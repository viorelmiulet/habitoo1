import { describe, expect, it } from "vitest";
import { calculateComparableSimilarity, effectiveRooms, scoreLocationV4, scoreLocation } from "./scoring";
import { detectResidentialComplex } from "./complexes";
import { buildSanityCheck, runAcpAnalysis, type AcpCandidate } from "./engine";
import { engineVersionForRerun } from "./engine-version";

const base = { latitude: 44.4389, longitude: 25.987 };
const at = (km: number) => ({ latitude: 44.4389 + km / 111.2, longitude: 25.987 });

describe("ACP v4 — locație după distanță", () => {
  it("≤1 km scor maxim, scade apoi, 0 peste 5 km", () => {
    expect(scoreLocationV4(base, at(0.8))).toBe(100);
    expect(scoreLocationV4(base, at(3))).toBeCloseTo(50, 0);
    expect(scoreLocationV4(base, at(5.5))).toBe(0);
  });
  it("cu coordonate, numele cartierului nu mai contează", () => {
    expect(scoreLocationV4({ ...base, neighborhood: "Militari" }, { ...at(4), neighborhood: "Militari" })).toBeLessThan(30);
  });
  it("direct doar la cel mult 2 km", () => {
    const t = { ...base, rooms: 2, usableArea: 55, propertyType: "apartment", transactionType: "sale", floor: 2, totalFloors: 6, constructionYear: 2024, condition: "nou", parking: true, balcony: true, furnished: false };
    expect(calculateComparableSimilarity(t, { ...t, ...at(1.9) }, { geoLocation: true }).tier).toBe("direct");
    expect(calculateComparableSimilarity(t, { ...t, ...at(2.1) }, { geoLocation: true }).tier).toBe("secondary");
  });
});

describe("ACP v4 — ansambluri rezidențiale", () => {
  it("recunoaște variantele de scriere Militari Residence", () => {
    for (const t of ["Militari Residence", "MILITARI-RESIDENCE", "militari rezidence", "Militari Residance", "MilitariResidence"])
      expect(detectResidentialComplex(t)?.key).toBe("militari-residence");
    expect(detectResidentialComplex("Militari, Lujerului")).toBeNull();
  });
  it("ansamblul e zonă separată în Chiajna: Militari București nu mai primește 100", () => {
    const t = { complex: "militari-residence", city: "Sector 6", county: "București", neighborhood: "Militari" };
    const militariBuc = { city: "București", county: "București", neighborhood: "Militari" };
    expect(scoreLocation(t, militariBuc)).toBe(100);
    expect(scoreLocationV4(t, militariBuc)).toBe(10);
    expect(scoreLocationV4(t, { city: "Chiajna", county: "Ilfov" })).toBe(85);
    expect(scoreLocationV4(t, { complex: "militari-residence", city: "București" })).toBe(100);
  });
});

describe("ACP v4 — garsonieră", () => {
  it("studio fără camere = 1 cameră și se potrivește cu apartamente de 1 cameră", () => {
    expect(effectiveRooms({ propertyType: "studio" })).toBe(1);
    const r = calculateComparableSimilarity({ propertyType: "studio", usableArea: 30 }, { propertyType: "apartament", rooms: 1, usableArea: 30 }, { geoLocation: true });
    expect(r.components.rooms).toBe(100);
    expect(r.components.other).toBe(100);
  });
});

describe("ACP v4 — verificare de bun-simț", () => {
  const target = { price: 76500, usableArea: 55, rooms: 2, propertyType: "apartment", city: "București", neighborhood: "Militari" };
  const cand = (i: number, ppsm: number): AcpCandidate => ({
    key: `c${i}`, sourceType: "portal", sourceName: "x", title: "t", locationLabel: "Militari, București",
    subject: { ...target, price: ppsm * 55, pricePerSqm: ppsm },
  });
  it("avertizează peste 25% față de prețul de listare, cu maximum 3 cauze", () => {
    const r = runAcpAnalysis(target, [cand(1, 2000), cand(2, 2100), cand(3, 2050)], {}, { engineVersion: 4, now: "2026-10-27T00:00:00Z" });
    expect(r.sanityCheck?.deviationPercent).toBeGreaterThan(25);
    expect(r.sanityCheck?.causes.length).toBeGreaterThan(0);
    expect(r.sanityCheck!.causes.length).toBeLessThanOrEqual(3);
  });
  it("nu avertizează sub 25%", () => {
    expect(buildSanityCheck({ target, estimate: { estimatedValue: 90000, estimatedMin: null, estimatedMax: null, recommendedListingPrice: null, basis: "price" }, used: [], dispersionRatio: 0, ppsmValues: [] })).toBeNull();
  });
  it("v3 nu are avertisment; v1/v2 rămân pe versiunea lor la recalculare", () => {
    expect(runAcpAnalysis(target, [cand(1, 2000)], {}, { engineVersion: 3 }).sanityCheck).toBeUndefined();
    expect(engineVersionForRerun(1)).toBe(1);
    expect(engineVersionForRerun(2)).toBe(2);
    expect(engineVersionForRerun(3)).toBe(5);
  });
});
