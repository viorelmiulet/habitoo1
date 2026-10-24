import { describe, expect, it } from "vitest";
import { normalizeHbsyncMarketListing, hbsyncMarketBodySchema } from "./hbsync";
import { ingestListings } from "./ingest";
import { createFakeRepository } from "./__tests__/fake-repository";
import { marketPoolScope } from "./acp-location";
import { marketListingToSubject } from "../acp/adapters";

const listing = {
  source: "storia", external_id: "real-id", deal_type: "lease", property_type: "apartment",
  price: 1500, currency: "EUR", surface_built: 50, rooms: 2, city: "București",
  county: "București", sector: "Sector 3", neighborhood: "Titan", publisher_type: "particular",
  images: ["https://example.org/image.jpg"], first_seen_at: "2026-10-01T00:00:00Z",
  contact_phone: "do-not-copy", crm: { perioada: "luna" },
};
describe("hbsync market contract", () => {
  it("maps lease, apartment, geography and EUR monthly price exactly", () => {
    const result = normalizeHbsyncMarketListing(listing);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.listing).toMatchObject({ source: "storia", sourceListingId: "real-id", city: "București",
      sector: "Sector 3", district: "Titan", neighborhood: "Titan", normalizedCity: "bucuresti",
      normalizedNeighborhood: "titan", transactionType: "rent", propertyType: "apartament",
      price: 1500, pricePerSqm: 30, rooms: 2, totalArea: 50, period: "luna",
      observedFirstSeenAt: "2026-10-01T00:00:00Z", imageUrl: "https://example.org/image.jpg" });
    expect(JSON.stringify(result.listing)).not.toContain("do-not-copy");
  });
  it("classifies only confirmed private sellers as private", () => {
    const result = normalizeHbsyncMarketListing(listing);
    expect(result.ok && result.listing.isPrivate).toBe(true);
  });
  it("keeps agencies in the ACP market pool as non-private", () => {
    const result = normalizeHbsyncMarketListing({ ...listing, publisher_type: "agency" });
    expect(result.ok && result.listing.isPrivate).toBe(false);
  });
  it("never assumes unknown sellers are private", () => {
    const result = normalizeHbsyncMarketListing({ ...listing, publisher_type: undefined });
    expect(result.ok && result.listing.isPrivate).toBeNull();
  });
  it("reimports the same portal id once and updates its price", async () => {
    const { repo, store } = createFakeRepository();
    for (const price of [1500, 1600]) {
      const result = normalizeHbsyncMarketListing({ ...listing, price });
      if (!result.ok) throw new Error(result.message);
      await ingestListings(repo, { source: "storia", mode: "partial", runId: null, now: "2026-10-24T00:00:00Z" }, [result.listing]);
    }
    expect(store.listings).toHaveLength(1);
    expect(store.listings[0]?.price).toBe(1600);
    expect(store.snapshots.filter(s => s.changeType === "price")).toHaveLength(1);
  });
  it("does not fabricate missing prices", () => {
    expect(normalizeHbsyncMarketListing({ ...listing, price: null }).ok).toBe(false);
  });
  it("does not mix daily rents with monthly rents", () => {
    expect(normalizeHbsyncMarketListing({ ...listing, period: "zi" }).ok).toBe(false);
  });
  it("accepts at most 500 rows per request", () => {
    expect(hbsyncMarketBodySchema.safeParse({ listings: Array(500).fill(listing) }).success).toBe(true);
    expect(hbsyncMarketBodySchema.safeParse({ listings: Array(501).fill(listing) }).success).toBe(false);
  });
  it("matches legacy sector-as-city targets to canonical Bucharest offers", () => {
    expect(marketPoolScope({ city: "Sector 3", propertyType: "Apartament", transactionType: "rent" }))
      .toEqual({ city: "bucuresti", sector: "sector 3", propertyType: "apartament", transactionType: "rent" });
    expect(marketListingToSubject({ city: "București", sector: "Sector 3", district: "Titan" }))
      .toMatchObject({ city: "Sector 3", district: "Titan", neighborhood: "Titan" });
  });
});