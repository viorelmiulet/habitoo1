import { describe, expect, it } from "vitest";
import { applyMarketLocationFilters, marketPoolScope } from "./acp-location";
import { matchesMarketFilters, type MarketIntelligenceRow } from "./intelligence";
import { scoreLocation } from "../acp/scoring";

const filters = { city: "București", sector: "Sector 3", neighborhood: "Titan" };
const row: MarketIntelligenceRow = {
  id: "storia-1", source: "storia", status: "active", city: "București", sector: "Sector 3",
  county: "București", district: "Titan", neighborhood: "Titan", address: null,
  propertyType: "apartament", transactionType: "rent", rooms: 2, usableArea: 50,
  price: 1500, currency: "EUR", pricePerSqm: 30, firstSeenAt: null, lastSeenAt: null,
};

describe("canonical ACP geography and mixed market", () => {
  it("accepts the exact hbsync București / Sector 3 / Titan shape", () => {
    expect(marketPoolScope(filters)).toMatchObject({ city: "bucuresti", sector: "sector 3" });
    expect(matchesMarketFilters(row, filters)).toBe(true);
  });
  it("excludes other sectors and neighborhoods", () => {
    expect(matchesMarketFilters({ ...row, sector: "Sector 2" }, filters)).toBe(false);
    expect(matchesMarketFilters({ ...row, neighborhood: "Dristor" }, filters)).toBe(false);
  });
  it("includes both particular and agency offers with real classification", () => {
    const offers = [{ ...row, publisher_type: "particular", is_private: true },
      { ...row, id: "agency-1", publisher_type: "agency", is_private: false }];
    expect(offers.filter(offer => matchesMarketFilters(offer, filters)).map(offer => offer.publisher_type))
      .toEqual(["particular", "agency"]);
  });
  it("retains legacy sector-as-city rows", () => {
    expect(matchesMarketFilters({ ...row, city: "Sector 3", sector: null }, filters)).toBe(true);
    expect(scoreLocation({ city: "Sector 3" }, { city: "București", sector: "Sector 3" })).toBe(60);
  });
  it("sends separate geographic predicates before pagination and never filters is_private", () => {
    const calls: string[] = [];
    const query = { eq(column: string, value: string) { calls.push(`${column}=${value}`); return this; },
      or(expression: string) { calls.push(expression); return this; } };
    applyMarketLocationFilters(query, filters);
    expect(calls).toEqual([
      "normalized_city.eq.bucuresti,normalized_city.in.(sector 1,sector 2,sector 3,sector 4,sector 5,sector 6,sectorul 1,sectorul 2,sectorul 3,sectorul 4,sectorul 5,sectorul 6)",
      "sector.ilike.sector 3,normalized_city.eq.sector 3,normalized_city.eq.sectorul 3",
      "normalized_neighborhood=titan",
    ]);
  });
});