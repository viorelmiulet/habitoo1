import { describe, expect, it } from "vitest";
import { romimoCountyName, romimoLocationName } from "../romimo/mapper";

describe("Romimo: județul în forma acceptată de /api/Resources/County", () => {
  it.each([
    ["Bucureşti", "bucuresti"], // ş cu sedilă (U+015F)
    ["București", "bucuresti"], // ș cu virgulă (U+0219)
    ["Bucuresti", "bucuresti"],
    ["Ilfov", "ilfov"],
    ["Municipiul București", "bucuresti"],
    ["Bistriţa-Năsăud", "bistrita-nasaud"],
    ["Satu Mare", "satu mare"],
  ])("%s → %s", (input, expected) => {
    expect(romimoCountyName(input)).toBe(expected);
  });

  it("orașele pierd diacriticele", () => {
    expect(romimoLocationName("Afumaţi")).toBe("afumati");
    expect(romimoLocationName("Chiajna")).toBe("chiajna");
  });
});
