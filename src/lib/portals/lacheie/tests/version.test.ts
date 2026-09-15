import { describe, expect, it } from "vitest";
import {
  FIRST_SOURCE_VERSION,
  acceptedVersionFromConflict,
  compareSourceVersions,
  isValidSourceVersion,
  nextSourceVersion,
  normalizeSourceVersion,
} from "../version";

describe("La Cheie — X-Source-Version", () => {
  it("prima versiune este 1", () => {
    expect(FIRST_SOURCE_VERSION).toBe("1");
    expect(nextSourceVersion({ current: null })).toBe("1");
  });

  it("păstrează precizia la valori peste 2^53 (nu folosește Number)", () => {
    const huge = "9007199254740993"; // 2^53 + 1
    expect(nextSourceVersion({ current: huge })).toBe("9007199254740994");
    expect(Number(nextSourceVersion({ current: huge }))).not.toBe(9007199254740994);
  });

  it("versiunea rămâne text zecimal valid", () => {
    expect(isValidSourceVersion("12")).toBe(true);
    expect(isValidSourceVersion("012")).toBe(false);
    expect(isValidSourceVersion(12 as unknown as string)).toBe(false);
    expect(isValidSourceVersion("12.5")).toBe(false);
  });

  it("normalizează valorile primite de la portal", () => {
    expect(normalizeSourceVersion("0007")).toBe("7");
    expect(normalizeSourceVersion(5)).toBe("5");
    expect(normalizeSourceVersion(9007199254740993n)).toBe("9007199254740993");
    expect(normalizeSourceVersion("abc")).toBeNull();
  });

  it("un conflict 409 pornește de la versiunea acceptată de portal, nu de la a noastră", () => {
    expect(nextSourceVersion({ current: "3", accepted: "10" })).toBe("11");
    expect(nextSourceVersion({ current: "12", accepted: "10" })).toBe("13");
  });

  it("citește versiunea acceptată din corpul 409", () => {
    expect(acceptedVersionFromConflict({ accepted_version: "42" })).toBe("42");
    expect(acceptedVersionFromConflict({ error: { accepted_version: 7 } })).toBe("7");
    expect(acceptedVersionFromConflict({ message: "conflict" })).toBeNull();
  });

  it("compară versiuni mari corect", () => {
    expect(compareSourceVersions("9007199254740993", "9007199254740992")).toBe(1);
    expect(compareSourceVersions("5", "5")).toBe(0);
  });
});
