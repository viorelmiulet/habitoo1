import { describe, expect, it } from "vitest";
import { ACP_SCORE_COMPONENTS, ACP_SCORE_WEIGHTS, ACP_THRESHOLDS } from "@/lib/acp/config";
import { publicAcpScoring, summarizePublicMarket } from "./acp-content";

describe("public ACP data", () => {
  it("reads all nine weights from the engine configuration", () => {
    expect(publicAcpScoring().components.map(({ key, weight }) => [key, weight])).toEqual(ACP_SCORE_COMPONENTS.map((key) => [key, ACP_SCORE_WEIGHTS[key]]));
    expect(publicAcpScoring().components.map(({ weight }) => weight)).toEqual([25, 20, 15, 10, 10, 5, 5, 5, 5]);
  });
  it("reads the direct and secondary thresholds from the engine", () => {
    expect(publicAcpScoring().direct).toBe(ACP_THRESHOLDS.direct);
    expect(publicAcpScoring().secondary).toBe(ACP_THRESHOLDS.secondary);
    expect([publicAcpScoring().direct, publicAcpScoring().secondary]).toEqual([85, 70]);
  });
  it("uses only active market offers, never owner-listing totals", () => {
    expect(summarizePublicMarket({ owner_sources: [{ source: "storia", count: 12 }], market_active: 8056 }, "2026-10-25T21:16:00Z").total).toBe(8056);
  });
  it("uses the observed day in Romania, including the midnight boundary", () => {
    const stats = { owner_sources: [], market_active: 1 };
    expect(summarizePublicMarket(stats, "2026-10-25T21:16:00Z").date).toBe("25 octombrie 2026");
    expect(summarizePublicMarket(stats, "2026-10-25T23:30:00Z").date).toBe("26 octombrie 2026");
  });
});