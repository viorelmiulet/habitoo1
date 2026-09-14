import { describe, expect, it } from "vitest";
import { buildAcpReportModel } from "./model";
import { buildAcpReportPdf } from "./pdf.server";

const model = buildAcpReportModel({
  reportNumber: 1,
  generatedAt: "2026-09-14T12:00:00.000Z",
  agency: { name: "Agenția Test", cui: "50477503", address: "București" },
  version: {
    analysisId: "a1",
    rootAnalysisId: "a1",
    title: "ACP Apartament Titan",
    status: "completed",
    errorMessage: null,
    version: 2,
    createdAt: "2026-09-01T10:00:00.000Z",
    snapshotAt: "2026-09-01T10:05:00.000Z",
    authorName: "Ana Pop",
    currency: "EUR",
    target: {
      title: "Apartament 3 camere Titan",
      reference: "HB-1024",
      locationLabel: "Titan, București",
      capturedAt: "2026-09-01T10:00:00.000Z",
      pricePerSqm: 1_620,
      subject: { rooms: 3, usableArea: 78, currency: "EUR", price: 126_000, condition: "Renovat" },
    },
    estimate: {
      estimatedMin: 112_000,
      estimatedValue: 120_000,
      estimatedMax: 128_000,
      recommendedListingPrice: 125_000,
    },
    statistics: {
      medianPricePerSqm: 1_600,
      averagePricePerSqm: 1_610,
      median: 119_000,
      average: 120_500,
      minimum: 110_000,
      maximum: 132_000,
      p25: 115_000,
      p75: 126_000,
    },
    confidence: { score: 78, quantity: 80, quality: 75, dispersion: 79 },
    explanation: [],
    comparables: [
      {
        key: "market:1",
        title: "Apartament 3 camere, zonă similară",
        sourceType: "portal",
        sourceName: "Date piață",
        locationLabel: "Titan",
        price: 120_000,
        adjustedPrice: 118_000,
        adjustedPricePerSqm: 1_600,
        similarityScore: 88,
        tier: "direct",
        adjustmentAmount: -2_000,
        adjustmentPercent: -1.7,
        adjustments: [{ label: "Etaj", basis: "etaj 1 vs etaj 4", amount: -2_000 }],
        isOutlier: false,
        isSelected: true,
        subject: { rooms: 3, usableArea: 74, currency: "EUR", price: 120_000 },
      },
    ],
    sources: [
      {
        sourceType: "own_properties",
        sourceName: "Proprietăți proprii",
        itemsFound: 3,
        itemsUsed: 1,
        itemsExcluded: 2,
      },
    ],
    ai: { summary: "Piața este stabilă în zonă.", model: "gemini", generatedAt: "2026-09-10T08:00:00.000Z" },
  },
});

describe("raport ACP — PDF", () => {
  it("N. produce un fișier PDF valid, cu diacritice", async () => {
    const bytes = await buildAcpReportPdf(model);
    expect(bytes.byteLength).toBeGreaterThan(3_000);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  }, 30_000);
});
