import { describe, expect, it, vi } from "vitest";
import { handleChanges, handleDevelopment, handleDevelopments, handleListing, handleListings, type PartnerReadStore, type StoredDevelopment, type StoredEvent, type StoredListing } from "./read.server";
import { mapPartnerDevelopment, eligiblePartnerDevelopments } from "./developments";
import { diffListings, stableJson } from "./schema";
import { webhookDelivers, webhookInput, DEFAULT_WEBHOOK_EVENTS } from "./webhook";
import { sandboxDevelopment, sandboxListings, SANDBOX_DEVELOPMENT_UNITS } from "./sandbox";
import type { PartnerContext } from "./core.server";
import type { DevelopmentRow } from "@/lib/site-feed/developments";
import type { PropertyRow } from "@/lib/site-feed/mapper";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const DEV = "33333333-3333-4333-8333-333333333333", L1 = "44444444-4444-4444-8444-444444444444";
const ctx = { identity: { environment: "live" }, portal: { slug: "p1" }, requestId: "r" } as unknown as PartnerContext;
const listing = sandboxListings({ apartment: "https://x/a.jpg", house: "https://x/h.jpg", land: "https://x/l.jpg" }, "2026-01-01T00:00:00Z")[0]!;
const stored: StoredListing = { property_id: L1, organization_id: A, visible: true, payload: { ...listing, id: L1, agency_id: A }, updated_at: "2026-01-02T00:00:00Z", withdrawn_at: null, development_id: DEV };
const events: StoredEvent[] = [
  { seq: 5, type: "listing.upserted", entity_type: "listing", entity_id: L1, organization_id: A, occurred_at: "2026-01-02T00:00:00Z" },
  { seq: 6, type: "development.upserted", entity_type: "development", entity_id: DEV, organization_id: A, occurred_at: "2026-01-02T00:00:01Z" },
];
const devRow: StoredDevelopment = { development_id: DEV, organization_id: A, visible: true, payload: sandboxDevelopment("https://x/a.jpg", "2026-01-01T00:00:00Z"), updated_at: "2026-01-03T00:00:00Z" };
function store(over: Partial<PartnerReadStore> = {}): PartnerReadStore {
  return {
    scope: async () => ({ known: [A], active: new Map([[A, null]]) }),
    organizations: async () => [], agents: async () => [], maxSeq: async () => 6,
    listings: async () => [stored], listing: async () => stored,
    events: vi.fn(async (_p: string, _o: string[], _s: number, _l: number, inc?: boolean) => inc ? events : events),
    developments: async () => [devRow], development: async id => id === DEV ? devRow : null,
    ...over,
  };
}
const text = (r: Response) => r.text();
const cursor = (s: number) => btoa(JSON.stringify({ s })).replace(/=+$/, "");

describe("Partner API developments are opt-in", () => {
  it("/listings and /listings/{id} without include are byte-identical to the legacy shape", async () => {
    const legacy = { ...stored.payload, status: stored.payload.status, updated_at: stored.updated_at, withdrawn_at: null };
    expect(await text(await handleListings(ctx, store(), new URL("https://h/listings")))).toBe(JSON.stringify({ data: [legacy], next_cursor: null }));
    expect(await text(await handleListing(ctx, store(), L1, new URL("https://h/listings/x")))).toBe(JSON.stringify(legacy));
  });
  it("/changes without include is byte-identical and asks the store without development events", async () => {
    const s = store();
    const body = await text(await handleChanges(ctx, s, new URL(`https://h/changes?cursor=${cursor(4)}`)));
    expect(s.events).toHaveBeenCalledWith("p1", [A], 4, 101, false);
    expect(body).toBe(JSON.stringify({ data: [{ seq: 5, type: "listing.upserted", entity_type: "listing", entity_id: L1, agency_id: A, occurred_at: "2026-01-02T00:00:00Z" }], next_cursor: cursor(5), has_more: false }));
  });
  it("include adds development_id and development events", async () => {
    const l = await (await handleListings(ctx, store(), new URL("https://h/listings?include=development"))).json();
    expect(l.data[0].development_id).toBe(DEV);
    const c = await (await handleChanges(ctx, store(), new URL(`https://h/changes?include=developments&cursor=${cursor(4)}`))).json();
    expect(c.data.map((e: { type: string }) => e.type)).toEqual(["listing.upserted", "development.upserted"]);
    expect(c.data[1].entity_type).toBe("development");
  });
  it("webhook delivers development events only when subscribed explicitly", () => {
    expect(webhookDelivers("development.upserted", [])).toBe(false);
    expect(webhookDelivers("development.withdrawn", ["listing.upserted"])).toBe(false);
    expect(webhookDelivers("listing.upserted", [])).toBe(true);
    expect(webhookDelivers("development.upserted", ["development.upserted"])).toBe(true);
    expect(DEFAULT_WEBHOOK_EVENTS).toHaveLength(5);
    expect(webhookInput.safeParse({ url: "https://x.example/h", events: ["listing.upserted","listing.withdrawn","agency.activated","agency.deactivated","agent.updated","development.upserted","development.withdrawn"] }).success).toBe(true);
  });
  it("/developments isolates portals and agencies", async () => {
    expect((await (await handleDevelopments(ctx, store(), new URL("https://h/developments"))).json()).data).toHaveLength(1);
    const otherAgency = store({ scope: async () => ({ known: [B], active: new Map() }) });
    expect((await handleDevelopment(ctx, otherAgency, DEV)).status).toBe(404);
    expect((await (await handleDevelopments(ctx, otherAgency, new URL(`https://h/developments?agency_id=${A}`))).json()).data).toEqual([]);
    expect((await handleDevelopment(ctx, store({ development: async () => null }), DEV)).status).toBe(404);
    expect((await handleDevelopment(ctx, store({ development: async () => ({ ...devRow, visible: false }) }), DEV)).status).toBe(404);
    expect((await handleDevelopment(ctx, store(), "nu-e-uuid")).status).toBe(404);
  });
  it("price_range uses eligible units, manual override and never mixes currencies", () => {
    const d = { id: DEV, organization_id: A, name: "D", status: "active", deleted_at: null, price_from: null, price_to: null, currency: "EUR", amenities: [], location_precise: false, lat: 44.4, lng: 26.1, created_at: "x", updated_at: "x" } as unknown as DevelopmentRow;
    const u = (id: string, price: number, cur: string) => ({ id, organization_id: A, development_id: DEV, status: "active", for_sale: true, sale_price: price, sale_currency: cur }) as unknown as PropertyRow;
    expect(mapPartnerDevelopment(d, [u("a", 100, "EUR"), u("b", 300, "EUR")], []).price_range).toEqual({ from: 100, to: 300, currency: "EUR" });
    expect(mapPartnerDevelopment(d, [u("a", 100, "EUR"), u("b", 300, "RON")], []).price_range).toEqual({ from: null, to: null, currency: null });
    expect(mapPartnerDevelopment({ ...d, price_from: 50, currency: "RON" }, [u("a", 100, "EUR")], []).price_range).toEqual({ from: 50, to: null, currency: "RON" });
    const r = eligiblePartnerDevelopments(A, [d, { ...d, id: B, status: "archived" }], [u("a", 1, "EUR"), { ...u("c", 1, "EUR"), development_id: B }], []);
    expect(r.developments.map(x => x.id)).toEqual([DEV]);
    expect(r.links).toEqual({ a: DEV });
    expect(r.developments[0]!.listing_ids).toEqual(["a"]);
  });
  it("unlinked listings keep their historical hash (no spurious events)", () => {
    const h = (v: string) => v;
    expect(diffListings([], [listing], h)[0]!.content_hash).toBe(stableJson(listing));
    expect(diffListings([], [listing], h, { [listing.id]: DEV })[0]!.development_id).toBe(DEV);
  });
  it("sandbox reset template: one fictitious development with 3 of the 12 listings", () => {
    const ids = sandboxListings({ apartment: "a", house: "h", land: "l" }).map(l => l.id);
    const d = sandboxDevelopment("a");
    expect(d.listing_ids).toEqual([...SANDBOX_DEVELOPMENT_UNITS].sort());
    expect(d.listing_ids.every(id => ids.includes(id))).toBe(true);
    expect(d.listing_ids).toHaveLength(3);
  });
});
