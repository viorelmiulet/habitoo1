import { describe, expect, it } from "vitest";
import legacyResult from "./tests/legacy-v1-result.json";
import { runAcpAnalysis, type AcpCandidate } from "./engine";
import type { AcpSubject } from "./scoring";
import {
  ACP_TIME_ADJUSTMENT_BOUNDS,
  buildAcpTimeAdjustmentSummary,
  computeAcpTimeAdjustment,
  type AcpPriceIndexSnapshot,
} from "./time-adjustment";

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

function candidate(key: string, price: number, ppsm: number, lastSeenAt: string): AcpCandidate {
  return {
    key,
    sourceType: "portal",
    sourceName: "Portaluri",
    marketListingId: key,
    title: `Comparabil ${key}`,
    subject: { ...target, price, pricePerSqm: ppsm },
    meta: {
      firstSeenAt: lastSeenAt,
      lastSeenAt,
      initialPrice: price,
      currentPrice: price,
      priceChanges: 0,
      status: "active",
      duplicateCount: 1,
    },
  };
}

/** Setul folosit și la capturarea rezultatului istoric al motorului v1. */
const legacySet = [
  candidate("a", 130_000, 1857.14, "2023-02-15T00:00:00Z"),
  candidate("b", 134_000, 1914.29, "2023-05-10T00:00:00Z"),
  candidate("c", 138_000, 1971.43, "2024-08-01T00:00:00Z"),
  candidate("d", 142_000, 2028.57, "2025-01-20T00:00:00Z"),
  candidate("e", 136_000, 1942.86, "2024-02-05T00:00:00Z"),
];

const index: AcpPriceIndexSnapshot = {
  source: "eurostat",
  dataset: "prc_hpi_q",
  series: "total",
  unit: "I15_Q",
  baseLabel: "2015=100",
  region: "RO",
  points: [
    { year: 2023, quarter: 1, value: 100 },
    { year: 2023, quarter: 2, value: 102 },
    { year: 2024, quarter: 1, value: 105 },
    { year: 2024, quarter: 3, value: 108 },
    { year: 2025, quarter: 1, value: 110 },
    { year: 2025, quarter: 4, value: 120 },
  ],
};

describe("computeAcpTimeAdjustment", () => {
  it("aduce prețul la trimestrul analizei cu raportul indicelui", () => {
    const result = computeAcpTimeAdjustment({
      index,
      price: 100_000,
      observedAt: "2023-01-20T00:00:00Z",
      analysisAt: "2025-02-01T00:00:00Z",
    });
    expect(result.applied).toBe(true);
    expect(result.comparableQuarter).toBe("2023-Q1");
    expect(result.usedQuarter).toBe("2025-Q1");
    expect(result.ratio).toBe(1.1);
    expect(result.adjustedPrice).toBe(110_000);
    expect(result.clamped).toBe(false);
  });

  it("plafonează la ultimul trimestru publicat când analiza îl depășește", () => {
    const result = computeAcpTimeAdjustment({
      index,
      price: 100_000,
      observedAt: "2023-01-20T00:00:00Z",
      analysisAt: "2026-06-01T00:00:00Z",
    });
    expect(result.clamped).toBe(true);
    expect(result.usedQuarter).toBe("2025-Q4");
    expect(result.ratio).toBe(1.2);
    expect(result.reason).toContain("2025-Q4");
  });

  it("nu ajustează când trimestrul comparabilului nu are indice", () => {
    const result = computeAcpTimeAdjustment({
      index,
      price: 100_000,
      observedAt: "2022-01-20T00:00:00Z",
      analysisAt: "2025-02-01T00:00:00Z",
    });
    expect(result.applied).toBe(false);
    expect(result.ratio).toBeNull();
    expect(result.adjustedPrice).toBe(100_000);
    expect(result.reason).toContain("2022-Q1");
  });

  it("refuză un raport în afara intervalului rezonabil", () => {
    const broken: AcpPriceIndexSnapshot = {
      ...index,
      points: [
        { year: 2023, quarter: 1, value: 10 },
        { year: 2025, quarter: 1, value: 400 },
      ],
    };
    const result = computeAcpTimeAdjustment({
      index: broken,
      price: 100_000,
      observedAt: "2023-01-20T00:00:00Z",
      analysisAt: "2025-02-01T00:00:00Z",
    });
    expect(result.applied).toBe(false);
    expect(result.adjustedPrice).toBe(100_000);
    expect(result.reason).toContain(String(ACP_TIME_ADJUSTMENT_BOUNDS.maxRatio));
  });

  it("nu ajustează când indicele lipsește complet", () => {
    const result = computeAcpTimeAdjustment({
      index: null,
      price: 100_000,
      observedAt: "2023-01-20T00:00:00Z",
      analysisAt: "2025-02-01T00:00:00Z",
    });
    expect(result.applied).toBe(false);
    expect(result.adjustedPrice).toBe(100_000);
  });

  it("nota de analiză spune indicele, sursa, baza și caracterul național", () => {
    const summary = buildAcpTimeAdjustmentSummary({
      index,
      analysisAt: "2026-06-01T00:00:00Z",
      adjustments: [
        computeAcpTimeAdjustment({
          index,
          price: 100_000,
          observedAt: "2023-01-20T00:00:00Z",
          analysisAt: "2026-06-01T00:00:00Z",
        }),
      ],
    });
    expect(summary.note).toContain("eurostat");
    expect(summary.note).toContain("2015=100");
    expect(summary.note).toContain("NAȚIONAL");
    expect(summary.clampedTo).toBe("2025-Q4");
    expect(summary.index?.newestQuarter).toBe("2025-Q4");
  });
});

describe("runAcpAnalysis – ajustarea în timp și versiunile motorului", () => {
  it("reproduce identic o analiză salvată, recalculată cu versiunea ei", () => {
    const recomputed = runAcpAnalysis(target, legacySet, {}, {
      now: "2026-03-01T00:00:00Z",
      engineVersion: 1,
    });
    expect(JSON.parse(JSON.stringify(recomputed))).toEqual(legacyResult);
  });

  it("versiunea 1 ignoră indicele chiar dacă este disponibil", () => {
    const v1 = runAcpAnalysis(target, legacySet, {}, {
      now: "2026-03-01T00:00:00Z",
      engineVersion: 1,
      priceIndex: index,
    });
    expect(JSON.parse(JSON.stringify(v1))).toEqual(legacyResult);
  });

  it("versiunea 2 aplică ajustarea și ridică estimarea", () => {
    const v1 = runAcpAnalysis(target, legacySet, {}, {
      now: "2026-03-01T00:00:00Z",
      engineVersion: 1,
    });
    const v2 = runAcpAnalysis(target, legacySet, {}, {
      now: "2026-03-01T00:00:00Z",
      engineVersion: 2,
      priceIndex: index,
    });
    expect(v2.engineVersion).toBe(2);
    expect(v2.timeAdjustment?.applied).toBe(true);
    expect(v2.timeAdjustment?.clampedTo).toBe("2025-Q4");
    expect(v2.estimate.estimatedValue).toBeGreaterThan(v1.estimate.estimatedValue!);
    const row = v2.comparables.find((c) => c.key === "a")!;
    expect(row.timeAdjustment?.applied).toBe(true);
    expect(row.timeAdjustment?.originalPrice).toBe(130_000);
    expect(row.timeAdjustment?.comparableQuarter).toBe("2023-Q1");
    expect(row.timeAdjustment?.usedQuarter).toBe("2025-Q4");
    expect(row.timeAdjustment?.ratio).toBe(1.2);
    expect(row.timeAdjustment?.adjustedPrice).toBe(156_000);
    // Prețul original al comparabilului rămâne neatins în snapshot.
    expect(row.subject.price).toBe(130_000);
  });

  it("tabel gol de indici = comportamentul de azi, cu o notă", () => {
    const v2 = runAcpAnalysis(target, legacySet, {}, {
      now: "2026-03-01T00:00:00Z",
      engineVersion: 2,
      priceIndex: null,
    });
    const v1 = runAcpAnalysis(target, legacySet, {}, {
      now: "2026-03-01T00:00:00Z",
      engineVersion: 1,
    });
    expect(v2.estimate).toEqual(v1.estimate);
    expect(v2.statistics).toEqual(v1.statistics);
    expect(v2.timeAdjustment?.applied).toBe(false);
    expect(v2.timeAdjustment?.note).toContain("nu este disponibil");
    expect(v2.comparables.every((c) => c.timeAdjustment?.applied === false)).toBe(true);
  });

  it("este determinist la versiunea 2", () => {
    const options = { now: "2026-03-01T00:00:00Z", engineVersion: 2, priceIndex: index };
    expect(runAcpAnalysis(target, legacySet, {}, options)).toEqual(
      runAcpAnalysis(target, legacySet, {}, options),
    );
  });
});
