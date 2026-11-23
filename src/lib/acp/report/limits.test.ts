import { describe, expect, it } from "vitest";
import { buildAcpReportModel } from "./model";
import { buildAcpReportPdf, reportMapLayouts, reportPhotoUrls, REPORT_FULL_SHEETS_MAX, REPORT_PHOTOS_MAX } from "./pdf.server";
import { failStaleReports, isStaleGeneratingReport, REPORT_STALE_MESSAGE } from "./stale";

const input: Parameters<typeof buildAcpReportModel>[0] = {
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
};



const one = input.version.comparables[0]!;
const comparables = Array.from({ length: 47 }, (_, i) => ({
  ...one,
  key: `market:${i}`,
  similarityScore: 90 - i,
  photos: [1, 2, 3, 4].map((n) => `https://img.example/${i}/${n}.jpg`),
  subject: { ...one.subject, latitude: 44.42 + i / 1000, longitude: 26.1 },
}));
const big = buildAcpReportModel({
  ...input,
  version: {
    ...input.version,
    target: { ...input.version.target, photos: ["https://img.example/t1.jpg", "https://img.example/t2.jpg"] },
    comparables,
  },
});

describe("raport ACP — limite pentru analize mari", () => {
  it("47 de comparabile: maxim 12 fișe cu poze/mini-hartă, maxim 45 de descărcări, PDF generat", async () => {
    expect(big.used).toHaveLength(47);
    const sheets = reportMapLayouts(big).sheets;
    expect(sheets.size).toBeLessThanOrEqual(REPORT_FULL_SHEETS_MAX + 1);
    const urls = reportPhotoUrls(big);
    expect(urls.length).toBeLessThanOrEqual(REPORT_PHOTOS_MAX);
    expect(urls.some((u) => u.startsWith("https://img.example/12/"))).toBe(false);
    const calls: string[] = [];
    const bytes = await buildAcpReportPdf(big, {
      loadImage: async (u) => {
        calls.push(u);
        return null;
      },
      loadTile: async () => null,
    });
    expect(calls.length).toBeLessThanOrEqual(45);
    expect(new Set(calls.map((u) => u.split("/")[3]).filter((d) => /^\d+$/.test(d!))).size).toBeLessThanOrEqual(12);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  }, 60_000);

  it("limita comună de timp oprește descărcările rămase", async () => {
    const calls: string[] = [];
    const bytes = await buildAcpReportPdf(big, {
      photosTotalMs: 50,
      loadImage: async (u) => {
        calls.push(u);
        await new Promise((r) => setTimeout(r, 40));
        return null;
      },
      loadTile: async () => null,
    });
    expect(calls.length).toBeLessThan(20);
    expect(bytes.byteLength).toBeGreaterThan(3_000);
  }, 60_000);
});

describe("raport ACP — rânduri blocate", () => {
  const now = Date.parse("2026-11-23T19:00:00Z");
  it("generating mai vechi de 10 minute e întrerupt", () => {
    expect(isStaleGeneratingReport({ status: "generating", created_at: "2026-11-23T18:49:00Z" }, now)).toBe(true);
    expect(isStaleGeneratingReport({ status: "generating", created_at: "2026-11-23T18:55:00Z" }, now)).toBe(false);
    expect(isStaleGeneratingReport({ status: "ready", created_at: "2026-11-23T18:00:00Z" }, now)).toBe(false);
  });
  it("failStaleReports marchează failed cu mesajul cerut", async () => {
    const seen: unknown[] = [];
    const chain = {
      update: (v: unknown) => (seen.push(v), chain),
      eq: (c: string, v: string) => (seen.push([c, v]), chain),
      lt: async (c: string, v: string) => (seen.push([c, v]), { error: null }),
    };
    await failStaleReports({ from: () => chain }, "org1", now);
    expect(seen[0]).toEqual({ status: "failed", error_message: "Generarea raportului a fost întreruptă. Încearcă din nou." });
    expect(REPORT_STALE_MESSAGE).toBe("Generarea raportului a fost întreruptă. Încearcă din nou.");
    expect(seen).toContainEqual(["status", "generating"]);
    expect(seen).toContainEqual(["created_at", "2026-11-23T18:50:00.000Z"]);
  });
});
