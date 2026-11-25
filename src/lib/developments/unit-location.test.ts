import { describe, it, expect } from "vitest";
import { isDevelopmentLocationComplete, unitInheritsLocation, withoutInheritedLocation, inheritedLocationNote, incompleteDevelopmentNote, LINK_LOCATION_WARNING } from "./unit-location";
const full = { id: "d1", name: "MRM", county: "Ilfov", city: "Chiajna", lat: 44.4, lng: 25.9 };
describe("locație completă", () => {
  it("cere județ, localitate și poziție pe hartă", () => {
    expect(isDevelopmentLocationComplete(full)).toBe(true);
    expect(isDevelopmentLocationComplete({ ...full, city: " " })).toBe(false);
    expect(isDevelopmentLocationComplete({ ...full, county: null })).toBe(false);
    expect(isDevelopmentLocationComplete({ ...full, lat: null })).toBe(false);
    expect(isDevelopmentLocationComplete({ ...full, lng: null })).toBe(false);
  });
  it("unitatea preia locația doar cu ansamblul ales și complet", () => {
    expect(unitInheritsLocation("d1", full)).toBe(true);
    expect(unitInheritsLocation(null, full)).toBe(false);
    expect(unitInheritsLocation("d2", full)).toBe(false);
    expect(unitInheritsLocation("d1", { ...full, lat: null })).toBe(false);
  });
  it("propunerile AI de localitate, zonă și adresă se elimină", () => {
    const p = { values: { city: "X", district: "Y", address: "Z", rooms: 2 } };
    expect(withoutInheritedLocation(p, true).values).toEqual({ rooms: 2 });
    expect(withoutInheritedLocation(p, false)).toBe(p);
  });
  it("textele", () => {
    expect(inheritedLocationNote("MRM")).toBe("Locația este preluată de la ansamblul «MRM». Se modifică din pagina ansamblului.");
    expect(incompleteDevelopmentNote("MRM")).toBe("Ansamblul «MRM» nu are locația completă (județ, localitate și poziție pe hartă). Până o completezi, anunțul își păstrează locația proprie.");
    expect(LINK_LOCATION_WARNING).toBe("La salvare, locația acestui anunț va fi înlocuită cu cea a ansamblului.");
  });
});
