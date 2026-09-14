/**
 * Teste pentru scorul determinist: reproductibilitate, breakdown, relevanță și
 * faptul că scorul NU este o evaluare ACP.
 */
import { describe, expect, it } from "vitest";
import { scoreProspect, scoreRelevance } from "../scoring";
import { normalizeProspect } from "../normalize";
import { emptyCriteria, type ProspectSearchCriteria, type RawProspect } from "../types";

const NOW = Date.parse("2026-09-10T00:00:00.000Z");

function prospect(overrides: Partial<RawProspect> = {}) {
  return normalizeProspect({
    sourceKey: "src",
    externalId: "1",
    url: "https://example.ro/1",
    title: "Apartament 2 camere Militari",
    description: "Direct de la proprietar, comision 0.",
    fields: {
      price: "85000 EUR",
      rooms: "2",
      surfaceUseful: "54",
      phone: "0722333444",
      city: "București",
      propertyType: "apartament",
      publishedAt: "2026-09-08T00:00:00.000Z",
    },
    fetchedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  });
}

const criteria: ProspectSearchCriteria = {
  ...emptyCriteria(),
  city: "București",
  priceMin: 50000,
  priceMax: 100000,
  roomsMin: 2,
  roomsMax: 3,
  propertyType: "apartament",
};

describe("scoreProspect", () => {
  it("este reproductibil pentru aceleași date", () => {
    const first = scoreProspect(prospect(), criteria, NOW);
    const second = scoreProspect(prospect(), criteria, NOW);
    expect(first.score).toBe(second.score);
    expect(first.breakdown).toEqual(second.breakdown);
  });

  it("rămâne în intervalul 0–100 și are breakdown explicabil", () => {
    const result = scoreProspect(prospect(), criteria, NOW);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown.length).toBeGreaterThanOrEqual(7);
    for (const factor of result.breakdown) {
      expect(factor.points).toBeLessThanOrEqual(factor.max);
      expect(factor.detail.length).toBeGreaterThan(0);
    }
    expect(result.breakdown.reduce((sum, f) => sum + f.points, 0)).toBe(result.score);
  });

  it("punctează mai bine un anunț de la proprietar decât unul de agenție", () => {
    const owner = scoreProspect(prospect(), criteria, NOW);
    const agency = scoreProspect(
      prospect({ description: "Agenție imobiliară, comision cumpărător 2%." }),
      criteria,
      NOW,
    );
    expect(owner.score).toBeGreaterThan(agency.score);
  });

  it("penalizează lipsa datelor, fără să le inventeze", () => {
    const poor = scoreProspect(
      prospect({ fields: { city: "București" }, description: null }),
      criteria,
      NOW,
    );
    expect(poor.score).toBeLessThan(scoreProspect(prospect(), criteria, NOW).score);
    expect(poor.breakdown.find((f) => f.key === "price_present")?.points).toBe(0);
    expect(poor.breakdown.find((f) => f.key === "contact")?.points).toBe(0);
  });

  it("scade scorul pentru anunțuri vechi", () => {
    const fresh = scoreProspect(prospect(), criteria, NOW);
    const old = scoreProspect(
      prospect({ fields: { ...prospect().features, publishedAt: "2025-01-01T00:00:00.000Z", city: "București" } }),
      criteria,
      NOW,
    );
    expect(old.score).toBeLessThanOrEqual(fresh.score);
  });
});

describe("scoreRelevance", () => {
  it("returnează 100 când toate criteriile completate se potrivesc", () => {
    expect(scoreRelevance(prospect(), criteria)).toBe(100);
  });

  it("scade când prețul iese din interval", () => {
    expect(
      scoreRelevance(prospect(), { ...criteria, priceMin: 200000, priceMax: 300000 }),
    ).toBeLessThan(100);
  });

  it("returnează neutru 50 fără criterii completate", () => {
    expect(scoreRelevance(prospect(), emptyCriteria())).toBe(50);
  });
});
