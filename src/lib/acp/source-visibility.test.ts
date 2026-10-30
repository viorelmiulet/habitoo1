import { describe, expect, it } from "vitest";
import { agencyAcpReport, canReadAcpSourceDiagnostics } from "./source-visibility";
import { redactMarketIntelligenceForAgency, type MarketIntelligenceResult } from "@/lib/market/intelligence";
import type { AcpReportModel } from "./report/model";

const role = (data: unknown, error: unknown = null) => ({
  userId: "u1",
  supabase: { rpc: async () => ({ data, error }) },
}) as never;

const result = {
  filters: { city: "București" },
  aggregate: {
    totalMatched: 42, sampleSize: 40, sampleCapped: false,
    pricePerSqm: { count: 40, min: 1000, max: 3000, average: 2000, median: 1950, p10: 1200, p25: 1500, p75: 2400, p90: 2800 },
    sourceMix: [{ source: "storia", count: 30, share: 75, lastSeenAt: "2026-10-30T00:00:00Z" }],
    freshness: { lastSeenAt: "2026-10-30T00:00:00Z", lastSyncAt: "2026-10-30T01:00:00Z", ageDays: 0, level: "fresh" },
  },
  samplePricePerSqm: [1000, 2000, 3000],
  trend: null,
  sources: [{ source: "storia", status: "ok", duplicates: 3, rejected: 2 }],
  sourceNames: { storia: "Storia" },
  computedAt: "2026-10-30T02:00:00Z",
} as unknown as MarketIntelligenceResult;

describe("ACP source diagnostics by role", () => {
  it("only superadmin may receive the source panel data", async () => {
    expect(await canReadAcpSourceDiagnostics(role(true))).toBe(true);
    expect(await canReadAcpSourceDiagnostics(role(false))).toBe(false); // agency admin
    expect(await canReadAcpSourceDiagnostics(role(false))).toBe(false); // agent
    expect(await canReadAcpSourceDiagnostics(role(true, { message: "down" }))).toBe(false);
  });

  it("agency response contains no source rows, sync time or source counts", () => {
    const agency = redactMarketIntelligenceForAgency(result);
    const json = JSON.stringify(agency);
    expect(agency.sources).toEqual([]);
    expect(agency.sourceNames).toEqual({});
    expect(agency.aggregate.sourceMix).toEqual([]);
    expect(agency.aggregate.freshness.lastSyncAt).toBeNull();
    expect(json).not.toContain("storia");
    expect(json).not.toContain("duplicates");
  });

  it("market analysis numbers are identical for every role", () => {
    const agency = redactMarketIntelligenceForAgency(result);
    expect(agency.aggregate.pricePerSqm).toEqual(result.aggregate.pricePerSqm);
    expect(agency.aggregate.totalMatched).toBe(42);
    expect(agency.samplePricePerSqm).toEqual(result.samplePricePerSqm);
    expect(agency.computedAt).toBe(result.computedAt);
  });

  it("agency PDF omits collection diagnostics but keeps statistics and comparables", () => {
    const model = {
      statistics: [{ label: "Mediană", value: "1.950 €" }],
      used: [{ title: "Comparabil #1" }],
      sources: [{ name: "Storia", type: "market", found: 30, used: 5, excluded: 25, outcomeLabel: "Import parțial", outcomeDetail: "2 respinse" }],
      market: { capturedAt: null, note: null, rows: [
        { label: "Mediană € / mp piață", value: "1.950 €/mp" },
        { label: "Prospețimea datelor de piață", value: "proaspete" },
        { label: "Surse de piață", value: "storia: 30" },
      ] },
    } as unknown as AcpReportModel;
    const agency = agencyAcpReport(model);
    expect(agency.sources).toEqual([]);
    expect(agency.market?.rows).toEqual([{ label: "Mediană € / mp piață", value: "1.950 €/mp" }]);
    expect(agency.statistics).toEqual(model.statistics);
    expect(agency.used).toEqual(model.used);
  });
});
