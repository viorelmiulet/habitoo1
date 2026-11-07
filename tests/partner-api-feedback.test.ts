import { describe, expect, it, vi } from "vitest";
import { handlePartnerWrite, type PartnerWriteStore } from "@/lib/partner-api/write.server";
import { generatePartnerKey, servePartner, type PartnerContext, type PartnerStore } from "@/lib/partner-api/core.server";
import { computePropertyIssues } from "@/lib/property-readiness";
import { summarizePortalStats, publicationReason, mergePublicationFeedback } from "@/lib/partner-api/feedback";
const org = "11111111-1111-4111-8111-111111111111", listing = "22222222-2222-4222-8222-222222222222";
const context: PartnerContext = { requestId: org, identity: { id: org, portal: "example", prefix: "hbpk_live_", environment: "live", key_hash: "", status: "active" }, portal: { slug: "example", display_name: "Exemplu.ro", active: true, integration_mode: "api", rate_limit_per_minute: 120 } };
function store(): PartnerWriteStore {
  return { read: { scope: async () => ({ known: [org], active: new Map([[org, null]]) }), listing: async () => ({ organization_id: org, visible: true } as never), organizations: async () => [], listings: async () => [], agents: async () => [], events: async () => [], maxSeq: async () => 0 }, publication: vi.fn(async () => ({ applied: true })), lead: vi.fn(async () => ({ id: listing, deduplicated: false })), message: vi.fn(async () => ({ not_found: true })), stats: vi.fn(async () => ({ accepted: 1 })) };
}
describe("P3 validation and agent-facing rules", () => {
  it("lead without email and phone is 422 and performs no ingestion", async () => {
    const s = store(); const r = await handlePartnerWrite(context, s, "lead", { external_id: "x", agency_id: org, name: "Client" });
    expect(r.status).toBe(422); expect(s.lead).not.toHaveBeenCalled();
  });
  it("listing from a different supplied agency is 404", async () => {
    const s = store(); const r = await handlePartnerWrite(context, s, "lead", { external_id: "x", listing_id: listing, agency_id: listing, name: "Client", phone: "0700000000" });
    expect(r.status).toBe(404); expect(s.lead).not.toHaveBeenCalled();
  });
  it("unactivated agency and empty test scope reject a lead", async () => {
    const s = store(); s.read.scope = async () => ({ known: [], active: new Map() });
    const r = await handlePartnerWrite({ ...context, identity: { ...context.identity, environment: "test" } }, s, "lead", { external_id: "x", listing_id: listing, name: "Client", email: "client@example.com" });
    expect(r.status).toBe(404); expect(s.lead).not.toHaveBeenCalled();
  });
  it("duplicate lead returns 200 with deduplicated true and the stable ID", async () => {
    const s = store(); s.lead = async () => ({ id: listing, deduplicated: true });
    const r = await handlePartnerWrite(context, s, "lead", { external_id: "x", agency_id: org, name: "Client", phone: "0700000000" });
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ id: listing, status: "accepted", deduplicated: true });
  });
  it("message on another portal lead is 404 and only client sender is accepted", async () => {
    expect((await handlePartnerWrite(context, store(), "message", { external_id: "x", body: "Mesaj", sender: "client" }, listing)).status).toBe(404);
    expect((await handlePartnerWrite(context, store(), "message", { external_id: "x", body: "Mesaj", sender: "agent" }, listing)).status).toBe(422);
  });
  it("stats reject over 500 rows, negative counters and impossible dates", async () => {
    for (const items of [Array.from({ length: 501 }, () => ({ listing_id: listing, date: "2026-11-07" })), [{ listing_id: listing, date: "2026-11-07", views: -1 }], [{ listing_id: listing, date: "2026-02-31" }]]) expect((await handlePartnerWrite(context, store(), "stats", { items })).status).toBe(422);
  });
  it("rejected publication produces named readiness issue with first reason", () => {
    const reasons = [{ code: "PHOTOS", message: "Fotografii neacceptate" }, { message: "Al doilea motiv" }];
    const issues = computePropertyIssues({ description: "a".repeat(600), imageCount: 5, lat: 44, lng: 26, price: 100000, salePrice: null, rentPrice: null, city: "București", address: null, publishStatus: "published", createdAt: new Date().toISOString(), publications: [{ portalKey: "example", portalName: "Exemplu.ro", status: "error", enabled: true, apiFeedback: true, reason: publicationReason(reasons) }] });
    expect(issues.find(i => i.code === "portal_rejected")?.label).toBe("Respins de Exemplu.ro: Fotografii neacceptate");
  });
  it("statistics totals contain exactly the last 30 UTC days", () => {
    const result = summarizePortalStats([{ portal: "example", date: "2026-10-08", views: 100, contacts: 100, favorites: 100 }, { portal: "example", date: "2026-10-09", views: 4, contacts: 2, favorites: 1 }, { portal: "example", date: "2026-11-07", views: 8, contacts: 3, favorites: 2 }], new Date("2026-11-07T13:28:00Z"));
    expect(result[0]).toMatchObject({ views: 12, contacts: 5, favorites: 3 }); expect(result[0]?.days).toHaveLength(30);
  });
  it("API feedback replaces rather than duplicates a portal readiness entry", () => {
    const merged = mergePublicationFeedback([{ portalKey: "example", status: "error", enabled: true }], [{ portal: "example", status: "rejected", name: "Exemplu.ro", reasons: [{ message: "Primul motiv" }] }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ portalKey: "example", status: "error", reason: "Primul motiv", apiFeedback: true });
    expect(mergePublicationFeedback(merged, [{ portal: "example", status: "published", name: "Exemplu.ro", reasons: [] }])[0]?.status).toBe("published");
  });
  it("P1 idempotency on the actual publication handler replays and conflicts on another body", async () => {
    const key = generatePartnerKey("live"), s = store(); let saved: { hash: string; response?: Response } | undefined;
    const auth: PartnerStore = { key: async () => ({ ...context.identity, key_hash: key.key_hash }), portal: async () => context.portal, rate: async () => ({ limit: 120, remaining: 119, reset: 1, allowed: true }), countAgencies: async () => 1, touch: async () => {}, log: async () => {}, claim: async (_p, _e, _k, hash) => { if (!saved) { saved = { hash }; return { state: "claimed" }; } if (saved.hash !== hash) return { state: "conflict" }; if (!saved.response) return { state: "pending" }; return { state: "replay", status: saved.response.status, body: await saved.response.clone().text() }; }, complete: async (_p, _e, _k, _o, response) => { if (saved) saved.response = response; } };
    const run = (body: string) => { const request = new Request(`https://www.habitoo.ro/api/public/partner/v1/listings/${listing}/publication`, { method: "POST", headers: { authorization: `Bearer ${key.key}`, "Idempotency-Key": "example-1", "content-type": "application/json" }, body }); return servePartner(request, auth, async ctx => handlePartnerWrite(ctx, s, "publication", await request.json(), listing), "/api/public/partner/v1/listings/{id}/publication"); };
    expect((await run('{"status":"rejected"}')).status).toBe(200); expect((await run('{"status":"rejected"}')).status).toBe(200);
    expect((await run('{"status":"published"}')).status).toBe(409); expect(s.publication).toHaveBeenCalledTimes(1);
  });
});