/**
 * C6 — traducerea rezultatului scannerului unic (C4) în starea formularului
 * de contract. Modul pur: nu primește niciodată octeți de imagine.
 */
import { SCAN_FLAG_LABELS, type ScanDocType, type ScanFieldName, type ScanResult } from "./scan";

/** Câmpurile formularului care pot fi completate din act. */
export type IdFormKey =
  | "fullName"
  | "cnp"
  | "idSeries"
  | "idNumber"
  | "idIssuer"
  | "idIssuedOn"
  | "birthDate"
  | "address"
  | "citizenship";

export type PartyIdState = {
  /** A fost făcută cel puțin o scanare reușită. */
  scanned: boolean;
  docType: ScanDocType | null;
  addressSource: "act" | "certificat_domiciliu" | "manual" | null;
  /** Câmpuri luate din MRZ valid. */
  verified: IdFormKey[];
  /** Câmpuri „de verificat”: încredere mică, CNP neconcordant, diferență față de MRZ. */
  pending: IdFormKey[];
  /** Motivele per câmp, în română. */
  flags: Partial<Record<IdFormKey, string[]>>;
  /** Avertismente generale (act expirat, MRZ invalid) — nu blochează. */
  warnings: string[];
  /** CEI fără domiciliu: cere certificat sau completare manuală. */
  needsAddress: boolean;
};

export const emptyPartyIdState: PartyIdState = {
  scanned: false,
  docType: null,
  addressSource: null,
  verified: [],
  pending: [],
  flags: {},
  warnings: [],
  needsAddress: false,
};

/** Data ISO în forma ZZ.LL.AAAA folosită de formular. */
export function isoToRo(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-") as [string, string, string];
  return `${d}.${m}.${y}`;
}

const MAP: [IdFormKey, ScanFieldName[]][] = [
  ["cnp", ["cnp"]],
  ["idSeries", ["doc_series"]],
  ["idNumber", ["doc_number"]],
  ["idIssuer", ["issued_by"]],
  ["idIssuedOn", ["issued_at", "expires_at"]],
  ["birthDate", ["birth_date"]],
  ["address", ["address"]],
  ["citizenship", ["nationality"]],
];

export const ID_WARNING_MESSAGES: Record<string, string> = {
  expired: "Actul este expirat. Verifică valabilitatea înainte de semnare.",
  mrz_invalid: "Codul din partea de jos a actului nu trece cifrele de control. Verifică numele, numărul și datele.",
};

export function applyScanResult(result: ScanResult): { values: Partial<Record<IdFormKey, string>>; state: PartyIdState } {
  const values: Partial<Record<IdFormKey, string>> = {};
  const verified: IdFormKey[] = [];
  const pending: IdFormKey[] = [];
  const flags: Partial<Record<IdFormKey, string[]>> = {};
  const overridden = new Set(result.warnings.filter((w) => w.startsWith("mrz_overrode_")).map((w) => w.slice(13)));

  const consider = (key: IdFormKey, names: ScanFieldName[], value: string | null) => {
    const fields = names.map((n) => result.fields[n]);
    const reasons = new Set<string>();
    for (const [i, f] of fields.entries()) {
      for (const flag of f.flags) if (flag !== "address_required") reasons.add(SCAN_FLAG_LABELS[flag] ?? flag);
      if (overridden.has(names[i] as string)) reasons.add(SCAN_FLAG_LABELS.mrz_conflict as string);
    }
    if (value) values[key] = value;
    if (reasons.size) {
      flags[key] = [...reasons];
      pending.push(key);
    } else if (value && fields.some((f) => f.value) && fields.filter((f) => f.value).every((f) => f.source === "mrz")) {
      verified.push(key);
    }
  };

  const last = result.fields.last_name.value ?? "";
  const first = result.fields.first_name.value ?? "";
  consider("fullName", ["last_name", "first_name"], `${last} ${first}`.trim() || null);
  for (const [key, names] of MAP) {
    const raw = result.fields[names[0] as ScanFieldName].value;
    const value = key === "idIssuedOn" || key === "birthDate" ? isoToRo(raw) || raw : raw;
    // Data expirării nu e câmp de formular: semnalează doar avertismentul pe data eliberării.
    consider(key, key === "idIssuedOn" ? names : names.slice(0, 1), value);
  }

  return {
    values,
    state: {
      scanned: true,
      docType: result.docType,
      addressSource: result.addressSource,
      verified,
      pending,
      flags,
      warnings: result.warnings.filter((w) => w === "expired" || w === "mrz_invalid"),
      needsAddress: result.needsAddressSource,
    },
  };
}

/** Confirmarea explicită a câmpurilor „de verificat”. */
export function confirmPendingFields(state: PartyIdState): PartyIdState {
  return { ...state, pending: [], flags: {} };
}

/**
 * Motivele pentru care documentul nu poate fi creat încă. Lista goală = creare
 * permisă. Avertismentele (act expirat) nu blochează, intenționat.
 */
export function idGenerationBlockers(parties: { label: string; state: PartyIdState; address?: string }[]): string[] {
  const blockers: string[] = [];
  for (const party of parties) {
    if (party.state.pending.length > 0) blockers.push(`${party.label}: confirmă câmpurile marcate „de verificat”.`);
    if (party.state.needsAddress && !(party.address ?? "").trim())
      blockers.push(`${party.label}: buletinul cu cip nu are domiciliul — adaugă certificatul de domiciliu sau completează manual.`);
  }
  return blockers;
}
