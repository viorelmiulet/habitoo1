import { describe, expect, it } from "vitest";
import { runAcpAnalysis, type AcpCandidate } from "./engine";
import type { AcpSubject } from "./scoring";

const target: AcpSubject = {
  propertyType: "apartament",
  transactionType: "sale",
  city: "Bucuresti",
  county: "Bucuresti",
  district: "Titan",
  neighborhood: "Titan",
  latitude: 44.42,
  longitude: 26.14,
  rooms: 3,
  usableArea: 70,
  floor: 3,
  totalFloors: 8,
  constructionYear: 2010,
  condition: "buna",
  parking: true,
  balcony: true,
  furnished: false,
  price: 140_000,
  currency: "EUR",
  pricePerSqm: 2000,
};

function candidate(key: string, overrides: Partial<AcpSubject>): AcpCandidate {
  return {
    key,
    sourceType: "own_properties",
    sourceName: "Proprietățile mele",
    propertyId: key,
    title: `Comparabil ${key}`,
    subject: { ...target, ...overrides },
  };
}

const similarSet = [
  candidate("a", { price: 138_000, pricePerSqm: 1971.43 }),
  candidate("b", { price: 142_000, pricePerSqm: 2028.57 }),
  candidate("c", { price: 140_000 }),
  candidate("d", { price: 145_000, pricePerSqm: 2071.43 }),
  candidate("e", { price: 136_000, pricePerSqm: 1942.86 }),
];

describe("runAcpAnalysis", () => {
  it("selectează comparabilele similare și produce o estimare", () => {
    const result = runAcpAnalysis(target, similarSet);
    expect(result.comparablesUsed).toBe(5);
    expect(result.comparables.every((c) => c.tier === "direct")).toBe(true);
    expect(result.estimate.basis).toBe("price_per_sqm");
    expect(result.estimate.estimatedValue).toBeGreaterThan(130_000);
    expect(result.estimate.estimatedValue).toBeLessThan(150_000);
    expect(result.estimate.recommendedListingPrice).toBeGreaterThan(
      result.estimate.estimatedValue!,
    );
    expect(result.estimate.estimatedMin).toBeLessThan(result.estimate.estimatedValue!);
    expect(result.estimate.estimatedMax).toBeGreaterThan(result.estimate.estimatedValue!);
  });

  it("este determinist", () => {
    expect(runAcpAnalysis(target, similarSet)).toEqual(runAcpAnalysis(target, similarSet));
  });

  it("exclude automat comparabilele sub pragul de similaritate", () => {
    const weak = candidate("weak", {
      city: "Cluj-Napoca",
      county: "Cluj",
      district: "Zorilor",
      neighborhood: "Zorilor",
      latitude: 46.76,
      longitude: 23.58,
      rooms: 1,
      usableArea: 30,
      price: 70_000,
      pricePerSqm: 2333,
    });
    const result = runAcpAnalysis(target, [...similarSet, weak]);
    const row = result.comparables.find((c) => c.key === "weak")!;
    expect(row.tier).toBe("excluded");
    expect(row.isSelected).toBe(false);
    expect(row.selectionReason).toContain("sub pragul");
  });

  it("marchează outlierii fără să șteargă datele", () => {
    const outlier = candidate("outlier", { price: 400_000, pricePerSqm: 5714 });
    const result = runAcpAnalysis(target, [...similarSet, outlier]);
    const row = result.comparables.find((c) => c.key === "outlier")!;
    expect(row.isOutlier).toBe(true);
    expect(row.isSelected).toBe(false);
    expect(result.comparables).toHaveLength(6);
    expect(result.statistics.usedCount).toBe(5);
  });

  it("respectă excluderea manuală", () => {
    const result = runAcpAnalysis(target, similarSet, { a: "exclude" });
    const row = result.comparables.find((c) => c.key === "a")!;
    expect(row.isSelected).toBe(false);
    expect(row.manualOverride).toBe("exclude");
    expect(result.comparablesUsed).toBe(4);
  });

  it("respectă includerea manuală a unui comparabil slab", () => {
    const weak = candidate("weak", { rooms: 1, usableArea: 30, price: 60_000, pricePerSqm: 2000 });
    const result = runAcpAnalysis(target, [...similarSet, weak], { weak: "include" });
    const row = result.comparables.find((c) => c.key === "weak")!;
    expect(row.isSelected).toBe(true);
    expect(row.selectionReason).toContain("manual");
  });

  it("exclude comparabilele fără preț", () => {
    const noPrice = candidate("noprice", { price: null, pricePerSqm: null });
    const result = runAcpAnalysis(target, [noPrice]);
    const row = result.comparables[0]!;
    expect(row.isSelected).toBe(false);
    expect(row.selectionReason).toContain("preț");
    expect(row.adjustedPrice).toBeNull();
  });

  it("nu produce estimare fără comparabile utilizabile", () => {
    const result = runAcpAnalysis(target, []);
    expect(result.comparablesUsed).toBe(0);
    expect(result.estimate.estimatedValue).toBeNull();
    expect(result.estimate.basis).toBe("insufficient_data");
    expect(result.confidence.score).toBe(0);
    expect(result.explanation.join(" ")).toContain("Nu există comparabile utilizabile");
  });

  it("estimează pe baza prețului total când suprafața țintei lipsește", () => {
    const noArea = { ...target, usableArea: null, pricePerSqm: null };
    const result = runAcpAnalysis(noArea, similarSet);
    expect(result.estimate.basis).toBe("price");
    expect(result.estimate.estimatedValue).toBeGreaterThan(0);
  });

  it("include explicația pas cu pas și confidența", () => {
    const result = runAcpAnalysis(target, similarSet);
    expect(result.explanation.length).toBeGreaterThan(3);
    expect(result.confidence.score).toBeGreaterThan(0);
    expect(result.candidatesFound).toBe(5);
  });

  it("aplică ajustări pentru diferențele de caracteristici", () => {
    const smaller = candidate("small", { usableArea: 60, price: 120_000, pricePerSqm: 2000 });
    const result = runAcpAnalysis(target, [smaller]);
    const row = result.comparables[0]!;
    expect(row.adjustments.some((a) => a.factor === "area")).toBe(true);
    expect(row.adjustedPrice).toBe(140_000);
  });
});
