/**
 * Citirea actului de identitate din MRZ — orchestrare pură, fără I/O.
 * Combină parsarea TD1, validarea CNP-ului, formatul seriei și expirarea.
 * Imaginea actului nu este niciodată primită, păstrată sau înregistrată aici.
 */
import { checkCnpAgainstMrz, decodeCnp } from "./cnp";
import { mrzDateToIso, parseTd1, type FieldStatus, type MrzField } from "./mrz";
import { checkIdSeries } from "./series";

export type IdField<T = string> = {
  value: T | null;
  source: "mrz";
  status: FieldStatus;
  reason: string | null;
};

export type IdDocumentReading = {
  ok: boolean;
  fields: {
    documentNumber: IdField;
    nationality: IdField;
    birthDate: IdField;
    sex: IdField<"M" | "F" | "X">;
    expiryDate: IdField;
    surname: IdField;
    givenNames: IdField;
    cnp: IdField;
    series: IdField;
    address: IdField;
  };
  county: string | null;
  warnings: string[];
  failures: string[];
  checkDigits: {
    documentNumber: boolean;
    birthDate: boolean;
    expiryDate: boolean;
    composite: boolean;
    cnp: boolean;
  };
};

function toField<T>(field: MrzField<T>): IdField<T> {
  return { value: field.value, source: "mrz", status: field.status, reason: field.reason };
}

function empty(reason: string): IdField {
  return { value: null, source: "mrz", status: "failed", reason };
}

export function emptyReading(reason: string): IdDocumentReading {
  const blank = empty(reason);
  return {
    ok: false,
    fields: {
      documentNumber: blank,
      nationality: blank,
      birthDate: blank,
      sex: { value: null, source: "mrz", status: "failed", reason },
      expiryDate: blank,
      surname: blank,
      givenNames: blank,
      cnp: blank,
      series: blank,
      address: { value: null, source: "mrz", status: "unverified", reason: "not_in_mrz" },
    },
    county: null,
    warnings: [],
    failures: [reason],
    checkDigits: {
      documentNumber: false,
      birthDate: false,
      expiryDate: false,
      composite: false,
      cnp: false,
    },
  };
}

export function readMrz(raw: string, today = new Date()): IdDocumentReading {
  const parsed = parseTd1(raw);
  if (!parsed.ok) return emptyReading(parsed.reason);

  const warnings: string[] = [];
  const failures: string[] = [];

  const birthIso = parsed.checkDigits.birthDate
    ? mrzDateToIso(parsed.birthDate.value, "birth", today)
    : null;
  const expiryIso = parsed.checkDigits.expiryDate
    ? mrzDateToIso(parsed.expiryDate.value, "expiry", today)
    : null;

  if (!parsed.checkDigits.documentNumber) failures.push("check_digit_document_number");
  if (!parsed.checkDigits.birthDate) failures.push("check_digit_birth_date");
  if (!parsed.checkDigits.expiryDate) failures.push("check_digit_expiry_date");
  if (!parsed.checkDigits.composite) failures.push("check_digit_composite");

  /* Seria: două litere + șase cifre, din numărul documentului. */
  const series = checkIdSeries(parsed.documentNumber.value);
  let county: string | null = series.county;
  let seriesField: IdField;
  if (!series.valid) {
    seriesField = { value: series.value || null, source: "mrz", status: "failed", reason: "series_format" };
    failures.push("series_format");
    county = null;
  } else {
    if (series.warning) warnings.push(series.warning);
    seriesField = {
      value: series.value,
      source: "mrz",
      status: parsed.checkDigits.documentNumber ? "verified" : "failed",
      reason: parsed.checkDigits.documentNumber ? series.warning : "check_digit_document_number",
    };
  }

  /* CNP din datele opționale ale liniei 1. */
  const cnpRaw = parsed.optionalData1.value.replace(/[^0-9]/g, "");
  const decoded = decodeCnp(cnpRaw);
  let cnpField: IdField;
  let cnpOk = false;
  if (!decoded.ok) {
    cnpField = { value: cnpRaw || null, source: "mrz", status: "failed", reason: decoded.reason };
    failures.push(decoded.reason);
  } else if (!decoded.value.checkDigitOk) {
    cnpField = { value: decoded.value.cnp, source: "mrz", status: "failed", reason: "cnp_check_digit" };
    failures.push("cnp_check_digit");
  } else {
    const consistency = checkCnpAgainstMrz(decoded.value, {
      birthDateIso: birthIso,
      sex: parsed.sex.value,
    });
    if (!consistency.ok) {
      cnpField = {
        value: decoded.value.cnp,
        source: "mrz",
        status: "failed",
        reason: consistency.reason,
      };
      failures.push(consistency.reason);
    } else {
      cnpOk = parsed.checkDigits.composite;
      cnpField = {
        value: decoded.value.cnp,
        source: "mrz",
        status: cnpOk ? "verified" : "unverified",
        reason: cnpOk ? null : "check_digit_composite",
      };
    }
  }

  /* Expirare: document expirat = avertisment explicit, niciodată trecut în silence. */
  if (expiryIso) {
    const todayIso = today.toISOString().slice(0, 10);
    if (expiryIso < todayIso) warnings.push("document_expired");
  }

  return {
    ok: failures.length === 0,
    fields: {
      documentNumber: toField(parsed.documentNumber),
      nationality: toField(parsed.nationality),
      birthDate: {
        value: birthIso,
        source: "mrz",
        status: parsed.checkDigits.birthDate && birthIso ? "verified" : "failed",
        reason: parsed.checkDigits.birthDate ? (birthIso ? null : "birth_date_invalid") : "check_digit_birth_date",
      },
      sex: toField(parsed.sex),
      expiryDate: {
        value: expiryIso,
        source: "mrz",
        status: parsed.checkDigits.expiryDate && expiryIso ? "verified" : "failed",
        reason: parsed.checkDigits.expiryDate
          ? expiryIso
            ? null
            : "expiry_date_invalid"
          : "check_digit_expiry_date",
      },
      surname: toField(parsed.surname),
      givenNames: toField(parsed.givenNames),
      cnp: cnpField,
      series: seriesField,
      address: { value: null, source: "mrz", status: "unverified", reason: "not_in_mrz" },
    },
    county,
    warnings,
    failures,
    checkDigits: { ...parsed.checkDigits, cnp: cnpOk },
  };
}
