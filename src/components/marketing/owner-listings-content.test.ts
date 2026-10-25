import { describe, expect, it } from "vitest";
import { summarizeOwnerStatistics } from "./owner-listings-content";

describe("public owner statistics", () => {
  const statistics = { owner_sources: [{ source: "storia", count: 388 }, { source: "anuntul", count: 620 }, { source: "olx", count: 0 }], market_active: 8056 };
  it("counts only positive owner sources, never the market pool", () => {
    const summary = summarizeOwnerStatistics(statistics, "2026-10-25T20:49:00Z");
    expect(summary.total).toBe(1008);
    expect(summary.sources).toEqual([{ source: "storia", count: 388 }, { source: "anuntul", count: 620 }]);
  });
  it("dates the observed statistics in the Romanian calendar", () => {
    expect(summarizeOwnerStatistics(statistics, "2026-10-25T20:49:00Z").date).toBe("25 octombrie 2026");
    expect(summarizeOwnerStatistics(statistics, "2026-10-25T23:30:00Z").date).toBe("26 octombrie 2026");
  });
});