import { describe, it, expect } from "vitest";
import { normalizeHouseraLocality as n } from "./mapper";

describe("normalizeHouseraLocality", () => {
  it("Sector 6 cu zonă", () => expect(n("Sector 6", "Bucureşti", "Militari")).toEqual({ city: "București", county: "București", area: "Militari" }));
  it("Bucureşti Sectorul 6 fără zonă", () => expect(n("Bucureşti Sectorul 6", "Bucureşti", null)).toEqual({ city: "București", county: "București", area: "Sector 6" }));
  it("Bucureşti cu zonă", () => expect(n("Bucureşti", "Bucureşti", "Lujerului")).toEqual({ city: "București", county: "București", area: "Lujerului" }));
  it("Chiajna neschimbat", () => expect(n("Chiajna", "Ilfov", "Militari Residence")).toEqual({ city: "Chiajna", county: "Ilfov", area: "Militari Residence" }));
  it("Sibiu neschimbat", () => expect(n("Sibiu", "Sibiu", null)).toEqual({ city: "Sibiu", county: "Sibiu", area: null }));
  it("variante București", () => {
    for (const c of ["Sectorul 3", "Bucuresti", "Municipiul București", "Mun. București", "București Sector 2"]) expect(n(c, null, null).city).toBe("București");
  });
});
