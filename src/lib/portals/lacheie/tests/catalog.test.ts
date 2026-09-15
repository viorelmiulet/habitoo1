import { describe, expect, it } from "vitest";
import {
  findCatalogOption,
  laCheieCategory,
  parseLaCheieCities,
  parseLaCheieCounties,
  parseLaCheieOptions,
  propertyTypeOptions,
  resolveLaCheieIds,
  type LaCheieCatalog,
} from "../catalog";

const CATALOG: LaCheieCatalog = {
  options: {
    property_type: [
      { id: "101", name: "Apartament" },
      { id: "102", name: "Casă / Vilă" },
      { id: "103", name: "Teren" },
      { id: "104", name: "Spațiu comercial" },
    ],
    heating: [{ id: "5", name: "Centrală proprie" }],
  },
  counties: [
    { id: "40", name: "București" },
    { id: "23", name: "Cluj" },
  ],
  cities: {
    "40": [{ id: "179132", name: "Sector 5", countyId: "40" }],
    "23": [{ id: "54975", name: "Cluj-Napoca", countyId: "23" }],
  },
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

describe("La Cheie — catalog", () => {
  it("citește grupurile din /options", () => {
    const parsed = parseLaCheieOptions({
      options: { property_type: [{ id: 101, label: "Apartament" }] },
    });
    expect(parsed["property_type"]).toEqual([{ id: "101", name: "Apartament" }]);
  });

  it("citește județele și localitățile în ambele formate", () => {
    expect(parseLaCheieCounties([{ id: 40, name: "București" }])).toEqual([
      { id: "40", name: "București" },
    ]);
    expect(parseLaCheieCities({ data: [{ id: 1, name: "Sector 1" }] }, "40")).toEqual([
      { id: "1", name: "Sector 1", countyId: "40" },
    ]);
  });

  it("potrivește numele ignorând diacriticele", () => {
    expect(findCatalogOption(CATALOG.counties, "bucuresti")?.id).toBe("40");
    expect(findCatalogOption(CATALOG.cities["23"]!, "Cluj Napoca")?.id).toBe("54975");
    expect(findCatalogOption(CATALOG.counties, "Ilfov")).toBeNull();
  });

  it("rezolvă tipul, județul și localitatea din catalog, fără id-uri hardcodate", () => {
    const result = resolveLaCheieIds({
      catalog: CATALOG,
      propertyType: "apartment",
      county: "București",
      city: "Sector 5",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({ propertyTypeId: "101", countyId: "40", cityId: "179132" });
  });

  it("teren și spațiu comercial se rezolvă la tipurile corecte", () => {
    const land = resolveLaCheieIds({
      catalog: CATALOG,
      propertyType: "teren",
      county: "Cluj",
      city: "Cluj-Napoca",
    });
    expect(land.ok && land.propertyTypeId).toBe("103");
    const commercial = resolveLaCheieIds({
      catalog: CATALOG,
      propertyType: "office",
      county: "Cluj",
      city: "Cluj-Napoca",
    });
    expect(commercial.ok && commercial.propertyTypeId).toBe("104");
  });

  it("o localitate necunoscută blochează publicarea cu motiv clar", () => {
    const result = resolveLaCheieIds({
      catalog: CATALOG,
      propertyType: "apartment",
      county: "București",
      city: "Sector 9",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("Sector 9");
  });

  it("catalogul nesincronizat este raportat, nu presupus", () => {
    const result = resolveLaCheieIds({
      catalog: { options: {}, counties: [], cities: {}, fetchedAt: "" },
      propertyType: "apartment",
      county: "București",
      city: "Sector 5",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("sincronizat");
  });

  it("categoriile Habitoo se traduc corect", () => {
    expect(laCheieCategory("garsoniera")).toBe("apartment");
    expect(laCheieCategory("vila")).toBe("house");
    expect(laCheieCategory("depozit")).toBe("commercial");
    expect(laCheieCategory("barca")).toBeNull();
    expect(propertyTypeOptions(CATALOG)).toHaveLength(4);
  });
});
