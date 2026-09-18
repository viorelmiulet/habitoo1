/**
 * CNP — modul pur: cifra de control, decodarea sexului, a secolului și a datei
 * nașterii, plus verificarea consistenței cu MRZ-ul. Fără I/O, fără stocare.
 */

const WEIGHTS = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];

export type CnpDecoded = {
  cnp: string;
  sex: "M" | "F";
  birthDate: string; // ISO yyyy-mm-dd
  checkDigitOk: boolean;
  reason: string | null;
};

export type CnpResult = { ok: true; value: CnpDecoded } | { ok: false; reason: string };

export function cnpCheckDigit(cnp: string): number | null {
  if (!/^[0-9]{12,13}$/.test(cnp)) return null;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(cnp[i]) * (WEIGHTS[i] as number);
  }
  const rest = sum % 11;
  return rest === 10 ? 1 : rest;
}

function centuryFor(first: number): number | null {
  if (first === 1 || first === 2 || first === 7 || first === 8) return 1900;
  if (first === 3 || first === 4) return 1800;
  if (first === 5 || first === 6) return 2000;
  return null; // 9 = străin fără dată de naștere garantată
}

export function decodeCnp(raw: string): CnpResult {
  const cnp = raw.replace(/\s|</g, "");
  if (!/^[0-9]{13}$/.test(cnp)) return { ok: false, reason: "cnp_format" };
  const first = Number(cnp[0]);
  const century = centuryFor(first);
  if (century === null) return { ok: false, reason: "cnp_unsupported_prefix" };

  const yy = Number(cnp.slice(1, 3));
  const mm = Number(cnp.slice(3, 5));
  const dd = Number(cnp.slice(5, 7));
  const date = new Date(Date.UTC(century + yy, mm - 1, dd));
  if (
    mm < 1 ||
    mm > 12 ||
    dd < 1 ||
    date.getUTCMonth() !== mm - 1 ||
    date.getUTCDate() !== dd
  ) {
    return { ok: false, reason: "cnp_birth_date_invalid" };
  }

  const expected = cnpCheckDigit(cnp);
  const checkDigitOk = expected !== null && expected === Number(cnp[12]);

  return {
    ok: true,
    value: {
      cnp,
      sex: first % 2 === 1 ? "M" : "F",
      birthDate: date.toISOString().slice(0, 10),
      checkDigitOk,
      reason: checkDigitOk ? null : "cnp_check_digit",
    },
  };
}

export type CnpConsistency = { ok: true } | { ok: false; reason: string };

/** Consistența CNP ↔ MRZ: orice nepotrivire este eșec cu motiv numit. */
export function checkCnpAgainstMrz(
  decoded: CnpDecoded,
  mrz: { birthDateIso: string | null; sex: "M" | "F" | "X" },
): CnpConsistency {
  if (mrz.birthDateIso && mrz.birthDateIso !== decoded.birthDate) {
    return { ok: false, reason: "cnp_mrz_birth_date_mismatch" };
  }
  if (mrz.sex !== "X" && mrz.sex !== decoded.sex) {
    return { ok: false, reason: "cnp_mrz_sex_mismatch" };
  }
  return { ok: true };
}
