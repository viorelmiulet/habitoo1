/**
 * Zona citibilă automat (MRZ) TD1 — cartea de identitate românească.
 * Modul pur: fără I/O, fără rețea, fără stocare. Imaginea actului nu ajunge
 * niciodată aici; primim doar textul MRZ.
 *
 * Format TD1: 3 linii × 30 caractere.
 *  Linia 1: [1-2] cod document, [3-5] stat emitent, [6-14] număr document,
 *           [15] cifră de control număr, [16-30] date opționale 1 (CNP).
 *  Linia 2: [1-6] data nașterii, [7] cifră de control, [8] sex,
 *           [9-14] data expirării, [15] cifră de control, [16-18] cetățenie,
 *           [19-29] date opționale 2, [30] cifră de control compusă.
 *  Linia 3: nume de familie << prenume, separate prin `<`.
 */

export type FieldStatus = "verified" | "unverified" | "failed";

export type MrzField<T = string> = {
  value: T;
  source: "mrz";
  status: FieldStatus;
  reason: string | null;
};

export type MrzParseResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      documentCode: string;
      issuingState: string;
      documentNumber: MrzField;
      optionalData1: MrzField;
      birthDate: MrzField;
      sex: MrzField<"M" | "F" | "X">;
      expiryDate: MrzField;
      nationality: MrzField;
      optionalData2: MrzField;
      surname: MrzField;
      givenNames: MrzField;
      checkDigits: {
        documentNumber: boolean;
        birthDate: boolean;
        expiryDate: boolean;
        composite: boolean;
      };
      lines: [string, string, string];
    };

const CHAR_VALUES: Record<string, number> = (() => {
  const map: Record<string, number> = { "<": 0 };
  for (let d = 0; d <= 9; d += 1) map[String(d)] = d;
  for (let i = 0; i < 26; i += 1) map[String.fromCharCode(65 + i)] = 10 + i;
  return map;
})();

const WEIGHTS = [7, 3, 1];

/** Transliterarea ICAO a diacriticelor românești, plus eliminarea celorlalte. */
export function transliterateForMrz(value: string): string {
  return value
    .replace(/[ăâĂÂ]/g, "A")
    .replace(/[îÎ]/g, "I")
    .replace(/[șşȘŞ]/g, "S")
    .replace(/[țţȚŢ]/g, "T")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/** Cifra de control ICAO 9303 (ponderi 7-3-1). */
export function checkDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] as string;
    const value = CHAR_VALUES[char];
    if (value === undefined) return -1;
    sum += value * (WEIGHTS[i % 3] as number);
  }
  return sum % 10;
}

function verify(field: string, digit: string): boolean {
  if (!/^[0-9]$/.test(digit)) return false;
  return checkDigit(field) === Number(digit);
}

/** Înlocuiește caracterele de umplere `<` cu spații și normalizează spațiile. */
export function stripFiller(value: string): string {
  return value.replace(/</g, " ").replace(/\s+/g, " ").trim();
}

function nameFiller(value: string): string {
  return value.replace(/</g, " ").replace(/\s+/g, " ").trim();
}

function field<T = string>(
  value: T,
  status: FieldStatus,
  reason: string | null = null,
): MrzField<T> {
  return { value, source: "mrz", status, reason };
}

/** Curăță textul primit: păstrează doar liniile de 30 de caractere MRZ. */
export function normalizeMrzInput(raw: string): string[] {
  return transliterateForMrz(raw)
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\s+/g, "").trim())
    .filter((line) => line.length > 0);
}

export function parseTd1(raw: string): MrzParseResult {
  const lines = normalizeMrzInput(raw);
  if (lines.length !== 3) {
    return { ok: false, reason: "mrz_line_count" };
  }
  if (lines.some((line) => line.length !== 30)) {
    return { ok: false, reason: "mrz_line_length" };
  }
  if (lines.some((line) => /[^A-Z0-9<]/.test(line))) {
    return { ok: false, reason: "mrz_invalid_characters" };
  }
  const [l1, l2, l3] = lines as [string, string, string];

  const documentCode = l1.slice(0, 2);
  const issuingState = l1.slice(2, 5);
  const documentNumberRaw = l1.slice(5, 14);
  const documentNumberCheck = l1.slice(14, 15);
  const optionalData1Raw = l1.slice(15, 30);

  const birthRaw = l2.slice(0, 6);
  const birthCheck = l2.slice(6, 7);
  const sexRaw = l2.slice(7, 8);
  const expiryRaw = l2.slice(8, 14);
  const expiryCheck = l2.slice(14, 15);
  const nationality = l2.slice(15, 18);
  const optionalData2Raw = l2.slice(18, 29);
  const compositeCheck = l2.slice(29, 30);

  const docOk = verify(documentNumberRaw, documentNumberCheck);
  const birthOk = verify(birthRaw, birthCheck);
  const expiryOk = verify(expiryRaw, expiryCheck);

  const compositeInput =
    l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  const compositeOk = verify(compositeInput, compositeCheck);

  const [surnamePart, givenPart = ""] = l3.split("<<");
  const surname = nameFiller(surnamePart ?? "");
  const givenNames = nameFiller(givenPart);

  const sexValue: "M" | "F" | "X" = sexRaw === "M" || sexRaw === "F" ? sexRaw : "X";

  return {
    ok: true,
    documentCode,
    issuingState,
    documentNumber: docOk
      ? field(stripFiller(documentNumberRaw), "verified")
      : field(stripFiller(documentNumberRaw), "failed", "check_digit_document_number"),
    optionalData1: compositeOk
      ? field(stripFiller(optionalData1Raw), "verified")
      : field(stripFiller(optionalData1Raw), "unverified", "check_digit_composite"),
    birthDate: birthOk
      ? field(birthRaw, "verified")
      : field(birthRaw, "failed", "check_digit_birth_date"),
    sex: compositeOk
      ? field(sexValue, sexValue === "X" ? "unverified" : "verified", sexValue === "X" ? "sex_unknown" : null)
      : field(sexValue, "unverified", "check_digit_composite"),
    expiryDate: expiryOk
      ? field(expiryRaw, "verified")
      : field(expiryRaw, "failed", "check_digit_expiry_date"),
    nationality: field(stripFiller(nationality), "unverified", "no_check_digit"),
    optionalData2: compositeOk
      ? field(stripFiller(optionalData2Raw), "verified")
      : field(stripFiller(optionalData2Raw), "unverified", "check_digit_composite"),
    surname: field(surname, "unverified", "no_check_digit"),
    givenNames: field(givenNames, "unverified", "no_check_digit"),
    checkDigits: {
      documentNumber: docOk,
      birthDate: birthOk,
      expiryDate: expiryOk,
      composite: compositeOk,
    },
    lines: [l1, l2, l3],
  };
}

/** Construiește o linie MRZ cu cifra de control corectă (folosit în teste și la validare). */
export function withCheckDigit(value: string): string {
  return `${value}${checkDigit(value)}`;
}

/** Transformă YYMMDD din MRZ în dată ISO, cu fereastra uzuală pentru expirare/naștere. */
export function mrzDateToIso(
  yymmdd: string,
  kind: "birth" | "expiry",
  today = new Date(),
): string | null {
  if (!/^[0-9]{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const currentYy = today.getUTCFullYear() % 100;
  const century = today.getUTCFullYear() - currentYy;
  const year = kind === "birth" ? (yy > currentYy ? century - 100 + yy : century + yy) : century + yy;
  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  return date.toISOString().slice(0, 10);
}
