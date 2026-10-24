import { describe, expect, it } from "vitest";
import { applyListingAgeFilters, listingAgeDays, matchesListingAge } from "./listing-age";
import { matchesMarketFilters, type MarketIntelligenceRow } from "./intelligence";
import { MARKET_SOURCES } from "./sources";

const now = Date.parse("2026-10-24T14:00:00Z");
const row: MarketIntelligenceRow = {
  id: "1", source: "storia", status: "active", city: "București", county: "București",
  district: "Titan", neighborhood: "Titan", address: null, propertyType: "apartament",
  transactionType: "sale", rooms: 2, usableArea: 50, price: 100000, currency: "EUR",
  pricePerSqm: 2000, firstSeenAt: "2026-09-24T14:00:00Z", lastSeenAt: "2026-10-24T12:00:00Z",
};

describe("ACP source and observed age filters", () => {
  it("offers Storia, OLX and Romimo from the canonical source registry", () => {
    expect(MARKET_SOURCES.filter(source => ["storia", "olx", "romimo"].includes(source.id)).map(source => source.id).sort())
      .toEqual(["olx", "romimo", "storia"]);
  });
  it.each(["storia", "olx", "romimo"])("filters the exact %s source cumulatively with duration", (source) => {
    expect(matchesMarketFilters({ ...row, source }, { sources: [source], daysOnMarketMin: 30, daysOnMarketMax: 30 }, now)).toBe(true);
    expect(matchesMarketFilters({ ...row, source: "other" }, { sources: [source], daysOnMarketMin: 30 }, now)).toBe(false);
  });
  it("uses first observation, not the latest import, with inclusive whole-day bounds", () => {
    expect(listingAgeDays(row.firstSeenAt, now)).toBe(30);
    expect(matchesListingAge(row.firstSeenAt, { daysOnMarketMin: 30, daysOnMarketMax: 30 }, now)).toBe(true);
    expect(matchesListingAge(row.firstSeenAt, { daysOnMarketMin: 31 }, now)).toBe(false);
    expect(matchesListingAge(row.firstSeenAt, { daysOnMarketMax: 29 }, now)).toBe(false);
    expect(matchesListingAge("2026-09-23T14:00:01Z", { daysOnMarketMax: 30 }, now)).toBe(true);
    expect(matchesListingAge("2026-09-23T14:00:00Z", { daysOnMarketMax: 30 }, now)).toBe(false);
  });
  it("keeps zero days and excludes invalid, missing or future observations when bounded", () => {
    expect(matchesListingAge("2026-10-24T14:00:00Z", { daysOnMarketMax: 0 }, now)).toBe(true);
    for (const date of [null, "invalid", "2026-10-25T14:00:00Z"]) {
      expect(listingAgeDays(date, now)).toBeNull();
      expect(matchesListingAge(date, { daysOnMarketMin: 0 }, now)).toBe(false);
      expect(matchesListingAge(date, {}, now)).toBe(true);
    }
  });
  it("applies equivalent timestamp bounds before counts and pagination", () => {
    const calls: unknown[][] = [];
    const query = { lte(column: string, value: string) { calls.push(["lte", column, value]); return this; },
      gt(column: string, value: string) { calls.push(["gt", column, value]); return this; } };
    applyListingAgeFilters(query, { daysOnMarketMin: 30, daysOnMarketMax: 60 }, now);
    expect(calls).toEqual([["lte", "first_seen_at", "2026-09-24T14:00:00.000Z"],
      ["gt", "first_seen_at", "2026-08-24T14:00:00.000Z"]]);
  });
});