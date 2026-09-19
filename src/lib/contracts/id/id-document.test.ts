/**
 * Teste pentru citirea deterministă a actului de identitate.
 * Toate MRZ-urile sunt sintetice, construite programatic — nu sunt date reale.
 */
import { describe, expect, it } from "vitest";
import { checkDigit, parseTd1, transliterateForMrz, mrzDateToIso } from "./mrz";
import { cnpCheckDigit, decodeCnp } from "./cnp";
import { checkIdSeries } from "./series";
import { readMrz } from "./read";
import { ID_DOCUMENT_FIELD_NAMES, isRedactedDetailKey } from "@/lib/ai/security/redaction-keys";
import { scrubAuditDetails } from "@/lib/ai/security/audit";
import { scrubTraceDetails } from "@/lib/ai/tracing/trace";

function pad(value: string, length: number): string {
  return value.padEnd(length, "<").slice(0, length);
}

function syntheticCnp(prefix: string): string {
  const base = pad12(prefix);
  return `${base}${cnpCheckDigit(base)}`;
}

function pad12(value: string): string {
  return value.padEnd(12, "0").slice(0, 12);
}

function buildTd1(options: {
  documentNumber?: string;
  cnp?: string;
  birth?: string;
  sex?: string;
  expiry?: string;
  names?: string;
}): string {
  const docNumber = pad(options.documentNumber ?? "RX123456", 9);
  const cnp = options.cnp ?? syntheticCnp("190010112345");
  const birth = options.birth ?? "900101";
  const sex = options.sex ?? "M";
  const expiry = options.expiry ?? "350101";
  const l1 = `IDROU${docNumber}${checkDigit(docNumber)}${pad(cnp, 15)}`;
  const l2Head = `${birth}${checkDigit(birth)}${sex}${expiry}${checkDigit(expiry)}ROU${pad("", 11)}`;
  const composite =
    l1.slice(5, 30) + l2Head.slice(0, 7) + l2Head.slice(8, 15) + l2Head.slice(18, 29);
  const l2 = `${l2Head}${checkDigit(composite)}`;
  const l3 = pad(options.names ?? "POPESCU<<ION<MARIN", 30);
  return [l1, l2, l3].join("\n");
}

describe("MRZ TD1", () => {
  it("parsează un MRZ valid cu toate cifrele de control corecte", () => {
    const parsed = parseTd1(buildTd1({}));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.checkDigits).toEqual({
      documentNumber: true,
      birthDate: true,
      expiryDate: true,
      composite: true,
    });
    expect(parsed.documentNumber.value).toBe("RX123456");
    expect(parsed.surname.value).toBe("POPESCU");
    expect(parsed.givenNames.value).toBe("ION MARIN");
    expect(parsed.nationality.value).toBe("ROU");
    expect(parsed.sex.value).toBe("M");
  });

  it("un singur caracter modificat cade exact pe câmpul lui", () => {
    const lines = buildTd1({}).split("\n");
    const l1 = lines[0] as string;
    const broken = [`${l1.slice(0, 6)}9${l1.slice(7)}`, lines[1], lines[2]].join("\n");
    const parsed = parseTd1(broken);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.checkDigits.documentNumber).toBe(false);
    expect(parsed.documentNumber.status).toBe("failed");
    expect(parsed.documentNumber.reason).toBe("check_digit_document_number");
    expect(parsed.birthDate.status).toBe("verified");
  });

  it("nimic nu este verificat fără cifră de control proprie", () => {
    const parsed = parseTd1(buildTd1({}));
    if (!parsed.ok) throw new Error("mrz invalid");
    expect(parsed.surname.status).toBe("unverified");
    expect(parsed.givenNames.status).toBe("unverified");
    expect(parsed.nationality.status).toBe("unverified");
  });

  it("transliterează diacriticele românești și normalizează umplutura", () => {
    expect(transliterateForMrz("Gheorghiță Șerban Câmpeanu")).toBe("GHEORGHITA SERBAN CAMPEANU");
    const parsed = parseTd1(buildTd1({ names: "SERBAN<<ANA<MARIA" }));
    if (!parsed.ok) throw new Error("mrz invalid");
    expect(parsed.givenNames.value).toBe("ANA MARIA");
  });

  it("refuză un MRZ cu alt număr de linii sau lungime greșită", () => {
    expect(parseTd1("IDROU").ok).toBe(false);
    expect(readMrz("IDROU").failures).toContain("mrz_line_count");
  });

  it("convertește datele MRZ în ISO", () => {
    const today = new Date("2026-01-01T00:00:00Z");
    expect(mrzDateToIso("900101", "birth", today)).toBe("1990-01-01");
    expect(mrzDateToIso("350101", "expiry", today)).toBe("2035-01-01");
  });
});

describe("CNP", () => {
  it("validează cifra de control", () => {
    const cnp = syntheticCnp("190010112345");
    const decoded = decodeCnp(cnp);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.checkDigitOk).toBe(true);
    expect(decoded.value.sex).toBe("M");
    expect(decoded.value.birthDate).toBe("1990-01-01");
  });

  it("cifra de control greșită este eșec numit", () => {
    const cnp = syntheticCnp("190010112345");
    const wrong = `${cnp.slice(0, 12)}${(Number(cnp[12]) + 1) % 10}`;
    const decoded = decodeCnp(wrong);
    if (!decoded.ok) throw new Error("format");
    expect(decoded.value.checkDigitOk).toBe(false);
    expect(readMrz(buildTd1({ cnp: wrong })).failures).toContain("cnp_check_digit");
  });

  it("nepotrivirea datei de naștere CNP ↔ MRZ este eșec", () => {
    const cnp = syntheticCnp("195050512345"); // 1995-05-05
    const reading = readMrz(buildTd1({ cnp, birth: "900101" }));
    expect(reading.ok).toBe(false);
    expect(reading.failures).toContain("cnp_mrz_birth_date_mismatch");
    expect(reading.fields.cnp.status).toBe("failed");
  });

  it("nepotrivirea sexului CNP ↔ MRZ este eșec", () => {
    const cnp = syntheticCnp("190010112345"); // masculin
    const reading = readMrz(buildTd1({ cnp, sex: "F" }));
    expect(reading.failures).toContain("cnp_mrz_sex_mismatch");
  });
});

describe("serie", () => {
  it("perechea cunoscută dă județul", () => {
    expect(checkIdSeries("RX123456").county).toBe("București");
  });

  it("perechea necunoscută avertizează, dar nu invalidează", () => {
    const reading = readMrz(buildTd1({ documentNumber: "QQ123456" }));
    expect(reading.ok).toBe(true);
    expect(reading.warnings).toContain("series_pair_unknown");
    expect(reading.fields.series.status).toBe("verified");
    expect(reading.county).toBeNull();
  });

  it("formatul greșit al seriei este eșec", () => {
    const reading = readMrz(buildTd1({ documentNumber: "R1234567" }));
    expect(reading.failures).toContain("series_format");
  });
});

describe("expirare", () => {
  it("documentul expirat avertizează explicit", () => {
    const reading = readMrz(buildTd1({ expiry: "200101" }), new Date("2026-01-01T00:00:00Z"));
    expect(reading.warnings).toContain("document_expired");
    expect(reading.fields.expiryDate.value).toBe("2020-01-01");
  });

  it("documentul valabil nu avertizează", () => {
    const reading = readMrz(buildTd1({}), new Date("2026-01-01T00:00:00Z"));
    expect(reading.warnings).not.toContain("document_expired");
    expect(reading.ok).toBe(true);
  });
});

describe("redactare", () => {
  it("lista de redactare acoperă fiecare câmp returnat de modul", () => {
    const reading = readMrz(buildTd1({}));
    for (const name of Object.keys(reading.fields)) {
      expect(isRedactedDetailKey(name), name).toBe(true);
    }
    for (const name of ID_DOCUMENT_FIELD_NAMES) {
      expect(isRedactedDetailKey(name), name).toBe(true);
    }
  });

  it("păstrează redactarea secretelor tehnice", () => {
    expect(isRedactedDetailKey("apiKey")).toBe(true);
    expect(isRedactedDetailKey("authorization")).toBe(true);
    expect(isRedactedDetailKey("accessToken")).toBe(true);
    expect(isRedactedDetailKey("propertyId")).toBe(false);
  });

  it("redactează identitatea doar pe potrivire exactă", () => {
    for (const name of ["cnp", "CNP", "birth_date", "givenNames", "idAddress", "adresa_act", "mrz"]) {
      expect(isRedactedDetailKey(name), name).toBe(true);
    }
    for (const name of [
      "address",
      "adresa",
      "propertyAddress",
      "enumeratedValues",
      "numericScore",
      "seriesCount",
      "documentNumbers",
    ]) {
      expect(isRedactedDetailKey(name), name).toBe(false);
    }
  });

  it("scrubberii de audit și tracing păstrează adresa proprietății", () => {
    const details = {
      propertyAddress: "Str. Exemplu 1",
      address: "Str. Exemplu 2",
      nested: { cnp: "1234567890123", idAddress: "Str. Act 3", apiKey: "x" },
    };
    for (const scrub of [scrubAuditDetails, scrubTraceDetails]) {
      const out = scrub(details) as Record<string, unknown>;
      expect(out.propertyAddress).toBe("Str. Exemplu 1");
      expect(out.address).toBe("Str. Exemplu 2");
      const nested = out.nested as Record<string, unknown>;
      expect(nested).toEqual({});
    }
  });
});
