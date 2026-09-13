import { describe, expect, it } from "vitest";
import { ACP_AI_MAX_COMPARABLES, buildAcpAiContext, type AcpAiContextInput } from "./context";

function comparable(overrides: Partial<AcpAiContextInput["comparables"][number]> = {}) {
  return {
    title: "Comparabil",
    sourceType: "own_properties",
    sourceName: "Proprietățile mele",
    locationLabel: "Centru, Cluj-Napoca",
    subject: { rooms: 3, usableArea: 70, price: 120000, pricePerSqm: 1714, currency: "EUR" },
    similarityScore: 90,
    components: { location: 100, area: 95 },
    tier: "direct",
    adjustmentPercent: 2,
    adjustedPrice: 122000,
    adjustedPricePerSqm: 1743,
    isSelected: true,
    isOutlier: false,
    outlierReason: null,
    ...overrides,
  } satisfies AcpAiContextInput["comparables"][number];
}

const base: AcpAiContextInput = {
  target: {
    title: "Apartament 3 camere",
    locationLabel: "Centru, Cluj-Napoca",
    subject: {
      propertyType: "apartment",
      transactionType: "sale",
      city: "Cluj-Napoca",
      county: "Cluj",
      rooms: 3,
      usableArea: 72,
      price: 130000,
      currency: "EUR",
    },
    pricePerSqm: 1805,
  },
  statistics: {
    minimum: 110000,
    maximum: 140000,
    average: 125000,
    median: 124000,
    p25: 118000,
    p75: 132000,
    averagePricePerSqm: 1750,
    medianPricePerSqm: 1740,
  },
  estimate: {
    estimatedMin: 118000,
    estimatedValue: 125000,
    estimatedMax: 132000,
    recommendedListingPrice: 128750,
  },
  confidence: { score: 72, level: "medium" },
  comparables: [comparable(), comparable({ title: "Al doilea", similarityScore: 80 })],
  sourceStats: [
    {
      sourceType: "own_properties",
      sourceName: "Proprietățile mele",
      itemsFound: 12,
      itemsUsed: 2,
      itemsExcluded: 10,
    },
  ],
  explanation: ["2 comparabile folosite"],
};

describe("buildAcpAiContext", () => {
  it("copiază cifrele motorului fără să le modifice", () => {
    const ctx = buildAcpAiContext(base);
    expect(ctx.estimate).toEqual(base.estimate);
    expect(ctx.statistics).toEqual(base.statistics);
    expect(ctx.confidence).toEqual({ score: 72, level: "medium" });
    expect(ctx.currency).toBe("EUR");
    expect(ctx.comparablesUsed).toBe(2);
  });

  it("nu trimite date private, tokenuri sau raw_data", () => {
    const ctx = buildAcpAiContext({
      ...base,
      comparables: [
        comparable({
          // câmpuri suplimentare, ignorate de builder
          ...({ rawData: { phone: "0722000000" }, url: "https://x.ro" } as never),
        }),
      ],
    });
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain("0722000000");
    expect(serialized).not.toContain("rawData");
    expect(serialized).not.toContain("raw_data");
    expect(serialized).not.toContain("https://x.ro");
  });

  it("limitează numărul de comparabile trimise", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      comparable({ title: `C${i}`, similarityScore: 95 - i }),
    );
    const ctx = buildAcpAiContext({ ...base, comparables: many });
    expect(ctx.comparables).toHaveLength(ACP_AI_MAX_COMPARABLES);
    expect(ctx.comparables[0]?.similarityScore).toBe(95);
  });

  it("numără outlierii și păstrează motivul lor", () => {
    const ctx = buildAcpAiContext({
      ...base,
      comparables: [
        comparable(),
        comparable({
          title: "Atipic",
          isOutlier: true,
          isSelected: false,
          outlierReason: "peste limita IQR",
        }),
      ],
    });
    expect(ctx.outliersCount).toBe(1);
    expect(ctx.comparablesUsed).toBe(1);
    expect(ctx.comparables.some((c) => c.outlierReason === "peste limita IQR")).toBe(true);
  });

  it("acceptă date lipsă fără să inventeze valori", () => {
    const ctx = buildAcpAiContext({
      target: { subject: {} },
      statistics: null,
      estimate: null,
      confidence: null,
      comparables: [],
      sourceStats: [],
    });
    expect(ctx.target.city).toBeNull();
    expect(ctx.target.usableArea).toBeNull();
    expect(ctx.statistics).toBeNull();
    expect(ctx.estimate).toBeNull();
    expect(ctx.comparablesUsed).toBe(0);
    expect(ctx.currency).toBe("EUR");
  });
});
