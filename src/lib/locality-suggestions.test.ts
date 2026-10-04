import { describe, expect, it } from "vitest";
import { displayLocalityName, filterSuggestions, localityPostalCode, toSuggestions, type LocalityRow } from "./locality-suggestions";

const row = (o: Partial<LocalityRow>): LocalityRow => ({
  sirutaCode: 1, rawName: "X", type: "sat", uatSirutaCode: 9, uatName: "COMUNA X", uatType: "comuna", postalCode: null, ...o,
});

describe("sugestii localitate", () => {
  it("sectoarele Bucureștiului au nume curat și sunt primele", () => {
    const list = toSuggestions([6, 1, 3, 2, 5, 4].map((n) =>
      row({ sirutaCode: n, rawName: `BUCUREŞTI SECTORUL ${n}`, type: "sector", uatName: "MUNICIPIUL BUCUREŞTI", uatType: "municipiu" }),
    ));
    expect(filterSuggestions(list, "").map((s) => s.name)).toEqual(["Sector 1", "Sector 2", "Sector 3", "Sector 4", "Sector 5", "Sector 6"]);
    expect(displayLocalityName("BUCUREŞTI SECTORUL 3", "sector")).toBe("Sector 3");
  });

  it("municipiile și orașele primele, apoi alfabetic; căutare fără diacritice", () => {
    const list = toSuggestions([
      row({ sirutaCode: 1, rawName: "APAHIDA" }),
      row({ sirutaCode: 2, rawName: "TURDA", type: "localitate_componenta", uatName: "MUNICIPIUL TURDA", uatType: "municipiu" }),
      row({ sirutaCode: 3, rawName: "HUEDIN", type: "localitate_componenta", uatName: "ORAŞ HUEDIN", uatType: "oras" }),
      row({ sirutaCode: 4, rawName: "BACIU" }),
      row({ sirutaCode: 5, rawName: "FLOREŞTI" }),
    ]);
    expect(filterSuggestions(list, "").map((s) => s.name)).toEqual(["Turda", "Huedin", "Apahida", "Baciu", "Floreşti"]);
    expect(filterSuggestions(list, "floresti").map((s) => s.name)).toEqual(["Floreşti"]);
  });

  it("lista vine doar din județul cerut (filtrul e pe interogare); filtrarea nu adaugă alte rânduri", () => {
    const list = toSuggestions([row({ sirutaCode: 1, rawName: "CHIAJNA" })]);
    expect(filterSuggestions(list, "cluj")).toEqual([]);
  });

  it("codul poștal se completează la 6 cifre", () => {
    expect(localityPostalCode("10013")).toBe("010013");
    expect(localityPostalCode(400335)).toBe("400335");
    expect(localityPostalCode(null)).toBeNull();
    const [s] = toSuggestions([row({ rawName: "BUCUREŞTI SECTORUL 1", type: "sector", postalCode: "10013" })]);
    expect(s!.postalCode).toBe("010013");
  });
});
