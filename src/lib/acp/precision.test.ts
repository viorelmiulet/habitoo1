/**
 * Teste pentru indicatorii de precizie (Stage 7).
 * Datele folosite sunt SINTETICE, construite pentru a verifica formulele —
 * nu reprezintă oferte reale de piață.
 */
import { describe, expect, it } from "vitest";
import {
  ACP_QUALITY_FIELDS,
  assessAcpDataQuality,
  calculateDataQuality,
  calculateFreshness,
  calculatePriceHistory,
  comparableRelevance,
  type AcpListingMeta,
} from "./precision";
import type { AcpSubject } from "./scoring";

const NOW = new Date("2026-03-01T00:00:00.000Z");

function meta(overrides: Partial<AcpListingMeta> = {}): AcpListingMeta {
  return {
    firstSeenAt: "2026-02-01T00:00:00.000Z",
    lastSeenAt: "2026-02-27T00:00:00.000Z",
    initialPrice: 100_000,
    currentPrice: 100_000,
    priceChanges: 0,
    status: "active",
    duplicateCount: 1,
    ...overrides,
  };
}

const fullSubject: AcpSubject = {
  propertyType: "apartament",
  transactionType: "sale",
  city: "Bucuresti",
  district: "Titan",
  rooms: 3,
  usableArea: 70,
  floor: 3,
  totalFloors: 8,
  constructionYear: 2010,
  condition: "buna",
  price: 140_000,
};

describe("calculateFreshness", () => {
  it("clasifică o ofertă văzută acum câteva zile drept proaspătă", () => {
    const result = calculateFreshness(meta({ lastSeenAt: "2026-02-28T00:00:00.000Z" }), NOW);
    expect(result.level).toBe("fresh");
    expect(result.score).toBeGreaterThan(90);
    expect(result.ageDays).toBeLessThanOrEqual(7);
  });

  it("scade scorul pentru oferte vechi", () => {
    const recent = calculateFreshness(meta({ lastSeenAt: "2026-02-10T00:00:00.000Z" }), NOW);
    const aging = calculateFreshness(meta({ lastSeenAt: "2025-12-20T00:00:00.000Z" }), NOW);
    const stale = calculateFreshness(meta({ lastSeenAt: "2025-06-01T00:00:00.000Z" }), NOW);
    expect(recent.score).toBeGreaterThan(aging.score);
    expect(aging.score).toBeGreaterThan(stale.score);
    expect(stale.level).toBe("stale");
  });

  it("marchează vechimea necunoscută fără a inventa o valoare", () => {
    const result = calculateFreshness(meta({ lastSeenAt: null }), NOW);
    expect(result.level).toBe("unknown");
    expect(result.ageDays).toBeNull();
  });
});

describe("calculateDataQuality", () => {
  it("dă scor maxim când toate câmpurile relevante există", () => {
    const result = calculateDataQuality(fullSubject);
    expect(result.score).toBe(100);
    expect(result.missing).toHaveLength(0);
    expect(result.totalFields).toBe(ACP_QUALITY_FIELDS.length);
  });

  it("raportează exact câmpurile lipsă", () => {
    const result = calculateDataQuality({ ...fullSubject, usableArea: null, condition: null });
    expect(result.score).toBeLessThan(100);
    expect(result.missing.length).toBe(2);
  });

  it("întoarce scor 0 pentru un subiect gol", () => {
    expect(calculateDataQuality({}).score).toBe(0);
  });
});

describe("calculatePriceHistory", () => {
  it("detectează o scădere de preț", () => {
    const result = calculatePriceHistory(
      meta({ initialPrice: 100_000, currentPrice: 90_000, priceChanges: 2 }),
      NOW,
    );
    expect(result.direction).toBe("decrease");
    expect(result.changePercent).toBeLessThan(0);
    expect(result.priceChanges).toBe(2);
  });

  it("consideră stabil un preț nemodificat", () => {
    const result = calculatePriceHistory(meta(), NOW);
    expect(result.direction).toBe("stable");
    expect(result.stabilityScore).toBeGreaterThanOrEqual(90);
  });

  it("nu deduce direcția fără date de preț", () => {
    const result = calculatePriceHistory(meta({ initialPrice: null, currentPrice: null }), NOW);
    expect(result.direction).toBe("unknown");
  });
});

describe("comparableRelevance", () => {
  it("combină similaritatea, calitatea datelor și prospețimea", () => {
    const strong = comparableRelevance({
      similarityScore: 90,
      dataQualityScore: 100,
      freshnessScore: 100,
    });
    const weak = comparableRelevance({
      similarityScore: 90,
      dataQualityScore: 40,
      freshnessScore: 20,
    });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(100);
  });
});

describe("assessAcpDataQuality", () => {
  const strongInput = {
    usedCount: 8,
    similarityScores: [92, 90, 88, 86, 85, 84, 83, 82],
    dispersionRatio: 0.06,
    freshnessScores: [95, 92, 90, 88, 86, 84, 82, 80],
    dataQualityScores: [100, 100, 95, 95, 90, 90, 90, 85],
    distinctSources: 3,
    outlierCount: 0,
    totalEligible: 8,
    calibrationReliability: 80,
  };

  it("dă calitate ridicată pentru un set bogat și coerent", () => {
    const result = assessAcpDataQuality(strongInput);
    expect(result.level).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.factors.length).toBeGreaterThan(0);
  });

  it("dă calitate scăzută și motive pentru un singur comparabil", () => {
    const result = assessAcpDataQuality({
      usedCount: 1,
      similarityScores: [72],
      dispersionRatio: null,
      freshnessScores: [50],
      dataQualityScores: [60],
      distinctSources: 1,
      outlierCount: 0,
      totalEligible: 1,
      calibrationReliability: null,
    });
    expect(result.level).toBe("low");
    expect(result.reasons.join(" ")).toContain("comparabile");
  });

  it("este determinist: aceleași intrări dau același scor", () => {
    expect(assessAcpDataQuality(strongInput).score).toBe(assessAcpDataQuality(strongInput).score);
  });
});
