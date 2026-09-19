/**
 * Etapa 3: o singură cale de citire a actului, fără conflict fals pe serie,
 * cu blocarea generării până la confirmare și rezolvarea conflictelor.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectFrontConflicts, seriesDiffers, type IdFrontFieldName } from "./vision.parse";
import type { IdField } from "./read";
import {
  applyIdReading,
  confirmPendingFields,
  emptyPartyIdState,
  idGenerationBlockers,
  resolveConflict,
} from "./form-state";
import { readMrz } from "./read";
import { checkDigit } from "./mrz";
import { cnpCheckDigit } from "./cnp";

function mrzField(value: string | null): IdField {
  return { value, source: "mrz", status: value ? "verified" : "failed", reason: null };
}

function frontFields(overrides: Partial<Record<IdFrontFieldName, string | null>>): Record<IdFrontFieldName, IdField> {
  const names: IdFrontFieldName[] = [
    "idAddress",
    "issuingAuthority",
    "issuedOn",
    "validUntil",
    "series",
    "surname",
    "givenNames",
    "documentNumber",
  ];
  const fields = {} as Record<IdFrontFieldName, IdField>;
  for (const name of names) {
    fields[name] = { value: overrides[name] ?? null, source: "vision", status: "unverified", reason: null };
  }
  return fields;
}

function pad(value: string, length: number): string {
  return value.padEnd(length, "<").slice(0, length);
}

function buildTd1(): string {
  const docNumber = pad("RX123456", 9);
  const base = "190010112345";
  const cnp = `${base}${cnpCheckDigit(base)}`;
  const birth = "900101";
  const expiry = "350101";
  const l1 = `IDROU${docNumber}${checkDigit(docNumber)}${pad(cnp, 15)}`;
  const l2Head = `${birth}${checkDigit(birth)}M${expiry}${checkDigit(expiry)}ROU${pad("", 11)}`;
  const composite = l1.slice(5, 30) + l2Head.slice(0, 7) + l2Head.slice(8, 15) + l2Head.slice(18, 29);
  const l2 = `${l2Head}${checkDigit(composite)}`;
  return [l1, l2, pad("POPESCU<<ION<MARIN", 30)].join("\n");
}

describe("calea unică de citire", () => {
  it("funcția veche extractIdDocument nu mai există în cod", () => {
    const source = readFileSync("src/lib/contracts.functions.ts", "utf8");
    expect(source).not.toContain("extractIdDocument");
    expect(source).not.toContain("EXTRACTION_PROMPT");
    const dialog = readFileSync("src/components/app/contracts/NewContractDialog.tsx", "utf8");
    expect(dialog).not.toContain("extractIdDocument");
    expect(dialog).toContain("readIdDocument");
  });
});

describe("serie față vs MRZ", () => {
  it("un act corect nu produce conflict pe serie", () => {
    expect(seriesDiffers("RX123456", "RX")).toBe(false);
    expect(seriesDiffers("RX123456", "SERIA RX NR 123456")).toBe(false);
    expect(seriesDiffers("RX123456", "RX 123456")).toBe(false);
    const conflicts = detectFrontConflicts(
      { surname: mrzField("POPESCU"), givenNames: mrzField("ION MARIN"), documentNumber: mrzField("RX123456"), series: mrzField("RX123456") },
      frontFields({ series: "SERIA RX NR 123456", documentNumber: "RX", surname: "POPESCU", givenNames: "ION MARIN" }),
    );
    expect(conflicts).toEqual([]);
  });

  it("literele diferite sau cifrele diferite rămân conflict", () => {
    expect(seriesDiffers("RX123456", "SERIA ZV")).toBe(true);
    expect(seriesDiffers("RX123456", "SERIA RX NR 999999")).toBe(true);
  });
});

describe("blocarea generării", () => {
  it("câmpurile de pe față blochează până la confirmare", () => {
    const reading = readMrz(buildTd1(), new Date("2030-01-01T00:00:00Z"));
    const applied = applyIdReading(reading, { fields: frontFields({ idAddress: "Str. Lalelelor 3" }), unreadable: false }, []);
    expect(applied.values.address).toBe("Str. Lalelelor 3");
    expect(applied.state.pending).toContain("address");
    expect(idGenerationBlockers([{ label: "Proprietar", state: applied.state }])).toHaveLength(1);
    const confirmed = confirmPendingFields(applied.state);
    expect(idGenerationBlockers([{ label: "Proprietar", state: confirmed }])).toEqual([]);
  });

  it("un conflict blochează până la alegerea unei valori", () => {
    const state = { ...emptyPartyIdState, conflicts: [{ field: "surname" as const, mrz: "POPESCU", vision: "POPESCO" }] };
    expect(idGenerationBlockers([{ label: "Chiriaș", state }])).toHaveLength(1);
    expect(idGenerationBlockers([{ label: "Chiriaș", state: resolveConflict(state, "surname") }])).toEqual([]);
  });

  it("actul expirat este avertisment, nu blocaj", () => {
    const reading = readMrz(buildTd1(), new Date("2040-01-01T00:00:00Z"));
    const applied = applyIdReading(reading, null, []);
    expect(applied.state.warnings).toContain("document_expired");
    expect(idGenerationBlockers([{ label: "Proprietar", state: applied.state }])).toEqual([]);
  });
});
