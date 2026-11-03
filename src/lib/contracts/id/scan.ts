/**
 * C4 — scanarea actului pe fișa clientului: logică pură, fără I/O.
 *
 * Modelul doar transcrie (JSON cu încredere per câmp). Deciziile vin din reguli
 * deterministe: MRZ cu cifre de control (TD1 pentru CEI/permis, TD3 pentru
 * pașaport), cifra de control a CNP-ului și potrivirea lui cu data nașterii și
 * sexul, expirarea. Imaginile nu ajung niciodată aici.
 */
import { checkDigit, mrzDateToIso, parseTd1, stripFiller } from "./mrz";
import { decodeCnp } from "./cnp";
import { isValidCnp } from "../templates";

export const SCAN_DOC_TYPES = ["ci", "cei", "pasaport", "permis_sedere", "altul"] as const;
export type ScanDocType = (typeof SCAN_DOC_TYPES)[number];
export const SCAN_DOC_TYPE_LABELS: Record<ScanDocType, string> = {
  ci: "Carte de identitate (CI)",
  cei: "Carte electronică de identitate (CEI)",
  pasaport: "Pașaport",
  permis_sedere: "Permis de ședere",
  altul: "Alt act",
};

export const SCAN_FIELD_NAMES = [
  "last_name", "first_name", "cnp", "birth_date", "birth_place", "sex", "nationality",
  "doc_series", "doc_number", "issued_by", "issued_at", "expires_at", "address",
] as const;
export type ScanFieldName = (typeof SCAN_FIELD_NAMES)[number];

/** Sub acest prag câmpul e marcat „de verificat”. */
export const LOW_CONFIDENCE = 0.7;

export type ScanField = {
  value: string | null;
  confidence: number | null;
  source: "ai" | "mrz";
  /** Motive pentru care agentul trebuie să verifice câmpul. */
  flags: string[];
};

export type ScanResult = {
  docType: ScanDocType;
  fields: Record<ScanFieldName, ScanField>;
  mrz: { present: boolean; valid: boolean; failures: string[] };
  warnings: string[];
  expired: boolean;
  /** CEI fără domiciliu: cere certificat de atestare sau completare manuală. */
  needsAddressSource: boolean;
  addressSource: "act" | "certificat_domiciliu" | "manual" | null;
};

export const SCAN_PROMPT = [
  "Transcrii un act de identitate (carte de identitate românească CI, carte electronică CEI, pașaport, permis de ședere sau alt act).",
  "Primești 1–2 imagini: fața și eventual versoul.",
  'Întoarce EXCLUSIV un obiect JSON: {"doc_type": "ci"|"cei"|"pasaport"|"permis_sedere"|"altul", "doc_type_confidence": 0-1,',
  '"mrz": "rândurile brute din zona citibilă automat separate prin \\n sau null", "fields": {',
  SCAN_FIELD_NAMES.map((n) => `"${n}": {"value": string|null, "confidence": 0-1}`).join(", "),
  "}}. Datele în format AAAA-LL-ZZ, sex M sau F.",
  "Pune null pentru orice câmp care nu se vede clar. Nu inventa valori și nu adăuga text în afara JSON-ului.",
].join(" ");

export const CERTIFICATE_PROMPT = [
  "În imagine este un certificat de atestare a domiciliului emis în România.",
  'Întoarce EXCLUSIV JSON: {"address": {"value": string|null, "confidence": 0-1}}. Nu inventa.',
].join(" ");

type RawField = { value?: unknown; confidence?: unknown };
export type ScanAiAnswer = {
  doc_type: ScanDocType | null;
  doc_type_confidence: number | null;
  mrz: string | null;
  fields: Partial<Record<ScanFieldName, { value: string | null; confidence: number | null }>>;
};

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function num01(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v && v.toLowerCase() !== "null" ? v.slice(0, 300) : null;
}

export function parseScanAnswer(text: string): ScanAiAnswer {
  const json = extractJson(text) ?? {};
  const rawFields = (json["fields"] && typeof json["fields"] === "object" ? json["fields"] : {}) as Record<string, RawField>;
  const fields: ScanAiAnswer["fields"] = {};
  for (const name of SCAN_FIELD_NAMES) {
    const raw = rawFields[name];
    if (!raw || typeof raw !== "object") continue;
    fields[name] = { value: str(raw.value), confidence: num01(raw.confidence) };
  }
  const docType = str(json["doc_type"]);
  return {
    doc_type: SCAN_DOC_TYPES.includes(docType as ScanDocType) ? (docType as ScanDocType) : null,
    doc_type_confidence: num01(json["doc_type_confidence"]),
    mrz: str(json["mrz"]),
    fields,
  };
}

export function parseCertificateAnswer(text: string): { value: string | null; confidence: number | null } {
  const json = extractJson(text) ?? {};
  const raw = (json["address"] ?? {}) as RawField;
  return { value: str(raw.value), confidence: num01(raw.confidence) };
}

/* ---------------------------------------------------------------- MRZ ---- */

export type MrzValues = {
  format: "TD1" | "TD3";
  documentCode: string;
  documentNumber: string;
  birthDate: string | null;
  expiryDate: string | null;
  sex: "M" | "F" | "X";
  nationality: string;
  lastName: string;
  firstName: string;
  personalNumber: string;
};
export type MrzAnyResult = { ok: true; values: MrzValues } | { ok: false; failures: string[] };

function mrzLines(raw: string): string[] {
  return raw
    .toUpperCase()
    .replace(/[«‹]/g, "<")
    .split(/\r?\n|\\n/)
    .map((l) => l.replace(/\s+/g, ""))
    .filter(Boolean);
}

function digitOk(field: string, digit: string | undefined): boolean {
  return digit !== undefined && /^\d$/.test(digit) && checkDigit(field) === Number(digit);
}

function names(line: string): { lastName: string; firstName: string } {
  const [last = "", first = ""] = line.split("<<");
  return { lastName: stripFiller(last), firstName: stripFiller(first.replace(/<+$/, "")) };
}

/** TD3 (pașaport): 2 rânduri × 44 caractere. */
export function parseTd3(raw: string, today = new Date()): MrzAnyResult {
  const lines = mrzLines(raw);
  if (lines.length !== 2 || lines.some((l) => l.length !== 44)) return { ok: false, failures: ["mrz_format"] };
  const [l1, l2] = lines as [string, string];
  const failures: string[] = [];
  const number = l2.slice(0, 9);
  const birth = l2.slice(13, 19);
  const expiry = l2.slice(21, 27);
  const personal = l2.slice(28, 42);
  if (!digitOk(number, l2[9])) failures.push("check_digit_document_number");
  if (!digitOk(birth, l2[19])) failures.push("check_digit_birth_date");
  if (!digitOk(expiry, l2[27])) failures.push("check_digit_expiry_date");
  const personalDigit = l2[42];
  if (!(personal.replace(/</g, "") === "" && (personalDigit === "<" || personalDigit === "0")) && !digitOk(personal, personalDigit)) {
    failures.push("check_digit_personal_number");
  }
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
  if (!digitOk(composite, l2[43])) failures.push("check_digit_composite");
  if (failures.length) return { ok: false, failures };
  const sexChar = l2[20];
  return {
    ok: true,
    values: {
      format: "TD3",
      documentCode: stripFiller(l1.slice(0, 2)),
      documentNumber: stripFiller(number),
      birthDate: mrzDateToIso(birth, "birth", today),
      expiryDate: mrzDateToIso(expiry, "expiry", today),
      sex: sexChar === "M" || sexChar === "F" ? sexChar : "X",
      nationality: stripFiller(l2.slice(10, 13)),
      ...names(l1.slice(5)),
      personalNumber: stripFiller(personal),
    },
  };
}

/** Citește MRZ TD1 (CEI, permis) sau TD3 (pașaport); orice cifră greșită = invalid. */
export function parseAnyMrz(raw: string, today = new Date()): MrzAnyResult {
  const lines = mrzLines(raw);
  if (lines.length === 2) return parseTd3(raw, today);
  const td1 = parseTd1(lines.join("\n"));
  if (!td1.ok) return { ok: false, failures: [td1.reason] };
  const failures = Object.entries(td1.checkDigits)
    .filter(([, ok]) => !ok)
    .map(([k]) => `check_digit_${k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`);
  if (failures.length) return { ok: false, failures };
  return {
    ok: true,
    values: {
      format: "TD1",
      documentCode: td1.documentCode,
      documentNumber: td1.documentNumber.value,
      birthDate: mrzDateToIso(td1.birthDate.value, "birth", today),
      expiryDate: mrzDateToIso(td1.expiryDate.value, "expiry", today),
      sex: td1.sex.value,
      nationality: td1.nationality.value,
      lastName: td1.surname.value,
      firstName: td1.givenNames.value,
      personalNumber: td1.optionalData1.value.replace(/[^0-9]/g, ""),
    },
  };
}

/* -------------------------------------------------------------- Build ---- */

function field(value: string | null, confidence: number | null): ScanField {
  const flags: string[] = [];
  if (value !== null && (confidence === null || confidence < LOW_CONFIDENCE)) flags.push("low_confidence");
  return { value, confidence, source: "ai", flags };
}

function addFlag(f: ScanField, flag: string) {
  if (!f.flags.includes(flag)) f.flags.push(flag);
}

/** Verificările CNP: cifra de control și potrivirea cu data nașterii și sexul. */
export function cnpChecks(cnp: string | null, birthDate: string | null, sex: string | null): string[] {
  if (!cnp) return [];
  if (!isValidCnp(cnp)) return ["cnp_invalid"];
  const decoded = decodeCnp(cnp.replace(/\D/g, ""));
  if (!decoded.ok) return ["cnp_invalid"];
  const out: string[] = [];
  if (birthDate && decoded.value.birthDate !== birthDate) out.push("cnp_birth_date_mismatch");
  if ((sex === "M" || sex === "F") && decoded.value.sex !== sex) out.push("cnp_sex_mismatch");
  return out;
}

export const SCAN_FLAG_LABELS: Record<string, string> = {
  low_confidence: "Încredere mică — verifică",
  cnp_invalid: "CNP-ul nu trece cifra de control",
  cnp_birth_date_mismatch: "CNP-ul nu se potrivește cu data nașterii",
  cnp_sex_mismatch: "CNP-ul nu se potrivește cu sexul",
  expired: "Actul este expirat",
  mrz_conflict: "Diferă de codul din partea de jos a actului",
  address_required: "Adaugă certificatul de domiciliu sau completează manual",
};

/** Combină citirea AI cu verificările deterministe. Nu salvează nimic. */
export function buildScanResult(
  answer: ScanAiAnswer,
  options: { docType?: ScanDocType | null; certificateAddress?: { value: string | null; confidence: number | null } | null; today?: Date } = {},
): ScanResult {
  const today = options.today ?? new Date();
  const docType: ScanDocType = options.docType ?? answer.doc_type ?? "altul";
  const fields = {} as Record<ScanFieldName, ScanField>;
  for (const name of SCAN_FIELD_NAMES) {
    const raw = answer.fields[name];
    fields[name] = field(raw?.value ?? null, raw?.confidence ?? null);
  }
  const warnings: string[] = [];

  /* MRZ: când e valid, are prioritate pentru nume, număr, naștere, expirare. */
  const mrz = { present: Boolean(answer.mrz), valid: false, failures: [] as string[] };
  if (answer.mrz) {
    const parsed = parseAnyMrz(answer.mrz, today);
    if (parsed.ok) {
      mrz.valid = true;
      const v = parsed.values;
      const apply = (name: ScanFieldName, value: string | null) => {
        if (!value) return;
        const f = fields[name];
        fields[name] = { value, confidence: 1, source: "mrz", flags: [] };
        if (f.value && f.value.toUpperCase().replace(/[^A-Z0-9]/g, "") !== value.toUpperCase().replace(/[^A-Z0-9]/g, "")) {
          warnings.push(`mrz_overrode_${name}`);
        }
      };
      apply("last_name", v.lastName);
      apply("first_name", v.firstName);
      if (v.format === "TD1" && /^[A-Z]{2}\d{6}$/.test(v.documentNumber)) {
        apply("doc_series", v.documentNumber.slice(0, 2));
        apply("doc_number", v.documentNumber.slice(2));
      } else {
        apply("doc_number", v.documentNumber);
      }
      apply("birth_date", v.birthDate);
      apply("expires_at", v.expiryDate);
    } else {
      mrz.failures = parsed.failures;
      warnings.push("mrz_invalid");
    }
  }

  /* CNP. */
  for (const flag of cnpChecks(fields.cnp.value, fields.birth_date.value, fields.sex.value)) addFlag(fields.cnp, flag);

  /* Expirare. */
  const todayIso = today.toISOString().slice(0, 10);
  const expired = Boolean(fields.expires_at.value && /^\d{4}-\d{2}-\d{2}$/.test(fields.expires_at.value) && fields.expires_at.value < todayIso);
  if (expired) {
    addFlag(fields.expires_at, "expired");
    warnings.push("expired");
  }

  /* Domiciliu. */
  let addressSource: ScanResult["addressSource"] = fields.address.value ? "act" : null;
  const cert = options.certificateAddress;
  if (cert?.value) {
    fields.address = field(cert.value, cert.confidence);
    addressSource = "certificat_domiciliu";
  }
  const needsAddressSource = docType === "cei" && !fields.address.value;
  if (needsAddressSource) addFlag(fields.address, "address_required");

  return { docType, fields, mrz, warnings, expired, needsAddressSource, addressSource };
}
