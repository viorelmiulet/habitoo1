/**
 * Interpretarea textului întors de model — modul pur, fără I/O și fără rețea.
 *
 * Modelul nu decide niciodată dacă un câmp este valid: de pe spate întoarce
 * exclusiv rândurile brute, care intră în parserul determinist; de pe față
 * întoarce câmpuri fără cifră de control, marcate mereu „de confirmat”.
 */
import type { IdField } from "./read";
import { transliterateForMrz } from "./mrz";

/** Extrage liniile candidate MRZ din răspunsul brut al modelului. */
export function extractMrzCandidates(text: string): string[] {
  return transliterateForMrz(text)
    .split(/[\r\n]+/)
    .map((line) => line.replace(/[^A-Z0-9<]/g, ""))
    .filter((line) => line.length >= 20 && line.includes("<"));
}

/** Cele trei linii de 30 de caractere, dacă modelul le-a întors complet. */
export function mrzTextFromCandidates(lines: string[]): string | null {
  const full = lines.filter((line) => line.length === 30);
  if (full.length < 3) return null;
  return full.slice(0, 3).join("\n");
}

export type IdFrontFieldName =
  | "idAddress"
  | "issuingAuthority"
  | "issuedOn"
  | "validUntil"
  | "series"
  | "surname"
  | "givenNames"
  | "documentNumber";

export const ID_FRONT_FIELD_NAMES: IdFrontFieldName[] = [
  "idAddress",
  "issuingAuthority",
  "issuedOn",
  "validUntil",
  "series",
  "surname",
  "givenNames",
  "documentNumber",
];

export type IdFrontReading = {
  fields: Record<IdFrontFieldName, IdField>;
  /** `true` dacă modelul nu a întors un JSON utilizabil. */
  unreadable: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMY = /^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/;

/** Normalizează o dată scrisă „12.03.2030” sau „2030-03-12” la forma ISO. */
export function normalizeFrontDate(raw: string): string | null {
  const value = raw.trim();
  if (ISO_DATE.test(value)) return value;
  const match = DMY.exec(value);
  if (!match) return null;
  const [, dd, mm, yyyy] = match as unknown as [string, string, string, string];
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (date.getUTCMonth() !== Number(mm) - 1 || date.getUTCDate() !== Number(dd)) return null;
  return date.toISOString().slice(0, 10);
}

function visionField(value: string | null, reason: string | null = null): IdField {
  /* Nimic de pe față nu are cifră de control: statusul rămâne „de confirmat”. */
  return {
    value,
    source: "vision",
    status: "unverified",
    reason: reason ?? "needs_user_confirmation",
  };
}

function emptyFront(reason: string): Record<IdFrontFieldName, IdField> {
  const fields = {} as Record<IdFrontFieldName, IdField>;
  for (const name of ID_FRONT_FIELD_NAMES) fields[name] = visionField(null, reason);
  return fields;
}

function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Traduce răspunsul de pe fața actului în câmpuri „de confirmat”. */
export function parseFrontVision(text: string): IdFrontReading {
  const payload = firstJsonObject(text);
  if (!payload || typeof payload !== "object") {
    return { fields: emptyFront("front_unreadable"), unreadable: true };
  }
  const raw = payload as Record<string, unknown>;
  const fields = emptyFront("not_found_on_front");
  for (const name of ID_FRONT_FIELD_NAMES) {
    const value = raw[name];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "" || /^(null|n\/?a|necunoscut)$/i.test(trimmed)) continue;
    if (name === "issuedOn" || name === "validUntil") {
      const iso = normalizeFrontDate(trimmed);
      fields[name] = iso ? visionField(iso) : visionField(null, "date_unreadable");
      continue;
    }
    fields[name] = visionField(trimmed.slice(0, 200));
  }
  return { fields, unreadable: false };
}

export type IdFieldConflict = {
  field: "surname" | "givenNames" | "documentNumber" | "series";
  mrz: string;
  vision: string;
};

function comparable(value: string): string {
  return transliterateForMrz(value)
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

/**
 * Compararea seriei: pe fața actului scrie „SERIA RX NR 123456”, deci modelul
 * întoarce de obicei numai perechea de litere. Comparăm literele cu primele două
 * caractere ale seriei din MRZ, iar cifrele numai dacă au fost și ele citite.
 * Un act corect nu produce niciodată conflict pe serie.
 */
export function seriesDiffers(mrzSeries: string, visionSeries: string): boolean {
  const mrz = comparable(mrzSeries);
  const mrzLetters = mrz.slice(0, 2);
  const mrzDigits = mrz.slice(2);
  /* Scoatem cuvintele tipărite pe card ca să nu confundăm „SE” din „SERIA”. */
  const vision = comparable(
    visionSeries.replace(/\b(seria|serie|serial|nr|no|numar|numarul)\b/gi, " "),
  );
  const letters = /[A-Z]{2}/.exec(vision)?.[0] ?? "";
  const digits = /[0-9]{6}/.exec(vision)?.[0] ?? "";
  if (letters && mrzLetters && letters !== mrzLetters) return true;
  if (digits && mrzDigits && digits !== mrzDigits) return true;
  return false;
}

/**
 * Conflictele dintre față și zona citibilă automat pe câmpurile comune.
 * Nu fuzionăm niciodată în silence: valoarea din MRZ rămâne cea returnată, iar
 * divergența este raportată explicit.
 */
export function detectFrontConflicts(
  mrzFields: { surname: IdField; givenNames: IdField; documentNumber: IdField; series: IdField },
  frontFields: Record<IdFrontFieldName, IdField>,
): IdFieldConflict[] {
  const conflicts: IdFieldConflict[] = [];
  const pairs: IdFieldConflict["field"][] = ["surname", "givenNames", "documentNumber", "series"];
  for (const field of pairs) {
    const mrzValue = mrzFields[field]?.value;
    const visionValue = frontFields[field]?.value;
    if (!mrzValue || !visionValue) continue;
    if (field === "series" || field === "documentNumber") {
      if (!seriesDiffers(mrzValue, visionValue)) continue;
    } else if (comparable(mrzValue) === comparable(visionValue)) continue;
    conflicts.push({ field, mrz: mrzValue, vision: visionValue });
  }
  return conflicts;
}
