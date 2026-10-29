import { describe, expect, it, vi } from "vitest";
import { createOferaAdapter } from "../adapters/ofera.server";
import { getPortalDefinition } from "../registry";
import type { PortalContext } from "../adapter";
import type { OferaState } from "./publish";
import type { OferaBody } from "./mapper";
const body: OferaBody = { category_id: 94, id_furnizor: 486, title: "Test", description: "Test", city_id: 179132, params: { price: 100000 }, images: [{ url: "https://example.invalid/image", order: 0 }], contact: { tip: "business", name: "Test", email: "test@example.invalid", phone: "0700000000" }, external_id: "HB-1-v", promoted: 0 };
function fixture(replies: unknown[], initial: OferaState[] = []) {
  let states = initial;
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(replies.shift()), { status: 200 }));
  const build = vi.fn(async () => ({ ok: true, reasons: [], warnings: [], bodies: [body], location: { cityId: 179132, reasons: [], warnings: [] }, currency: "EUR" as const, imagesFingerprint: "gallery", bodiesJson: null }));
  const clear = vi.fn(async (_input: unknown, external: string) => { states = states.filter(s => s.external_id !== external); });
  const adapter = createOferaAdapter({
    env: { OFERA_CLIENT_ID: "fixture", OFERA_CLIENT_SECRET: "fixture", OFERA_USERNAME: "fixture", OFERA_PASSWORD: "fixture" },
    store: { read: async () => ({ token: "test-token", expiresAt: Date.now() + 3600000, revision: "test-revision", scope: "test" }), claim: async () => false, save: async () => false, release: async () => {} },
    journal: async () => {}, fetch: fetcher, build, load: async () => states,
    save: async (_input, state) => { states = [...states.filter(s => s.transaction !== state.transaction), state]; }, clear,
  });
  const definition = getPortalDefinition("ofera");
  if (!definition) throw new Error("registry");
  const ctx: PortalContext = { organizationId: "org", definition, direction: "habitoo_to_portal", authenticationMode: "username_password", externalAccountId: null, portalCredential: null, settings: { id_furnizor: 486 }, allowLiveRequests: true };
  return { adapter, ctx, fetcher, build, clear, states: () => states };
}
const ok = (data: unknown = {}) => ({ code: "SUCCESS", status: 200, message: "Confirmat", data });
const failed = (status: number) => ({ code: "ERROR", status, message: "Refuz", data: {} });
const state: OferaState = { transaction: "sale", external_id: "HB-1-v", ofera_id: 52, public_url: null, valid_until: null, status: "pending_activation", images_fingerprint: "gallery", last_log_track_id: null, last_message: null };
describe("Ofera adapter persistence and queue intents", () => {
  it("definitive create rejection clears only its pre-send fence", async () => { const f = fixture([failed(500)]); expect((await f.adapter.publishListing(f.ctx, { propertyId: "p", externalId: null })).ok).toBe(false); expect(f.states()).toEqual([]); expect(f.clear).toHaveBeenCalledWith({ organizationId: "org", propertyId: "p" }, "HB-1-v"); });
  it("activation-only bypasses mapper, calls no create/update and confirms status", async () => { const f = fixture([ok()], [state]); const r = await f.adapter.updateListing(f.ctx, { propertyId: "p", externalId: "HB-1-v", oferaIntent: "activate" }); expect(r.ok).toBe(true); expect(f.build).not.toHaveBeenCalled(); expect(f.states()[0]?.status).toBe("active"); expect(f.fetcher).toHaveBeenCalledTimes(1); expect(String(f.fetcher.mock.calls[0]?.[0])).toContain("activate-product/52"); });
  it("creation preserves pending activation on refusal", async () => { const f = fixture([ok({ id: 52 }), failed(412)]); const r = await f.adapter.publishListing(f.ctx, { propertyId: "p", externalId: null }); expect(r.ok).toBe(false); expect(f.states()[0]?.status).toBe("pending_activation"); });
  it("406 result reaches generic promotedConfirmed:false", async () => { const f = fixture([failed(406), ok({ id: 52 }), ok()]); const r = await f.adapter.publishListing(f.ctx, { propertyId: "p", externalId: null, promoted: true }); expect(r).toMatchObject({ ok: true, data: { promotedConfirmed: false, portalStatus: "published" } }); });
  it("debifată transaction gets deactivated independently", async () => { const f = fixture([ok({ id: 52 }), ok(), ok()], [{ ...state, transaction: "rent", external_id: "HB-1-i", ofera_id: 53, status: "active" }]); expect((await f.adapter.publishListing(f.ctx, { propertyId: "p", externalId: null })).ok).toBe(true); expect(f.states().find(s => s.transaction === "rent")?.status).toBe("inactive"); expect(String(f.fetcher.mock.calls[2]?.[0])).toContain("deactivate-product/53"); });
  it("soft delete deactivates while account hard-delete uses DELETE", async () => { for (const [reason, method] of [["deleted", "POST"], ["account_deleted", "DELETE"]] as const) { const f = fixture([ok()], [{ ...state, status: "active" }]); expect((await f.adapter.withdrawListing(f.ctx, { propertyId: "p", externalId: "HB-1-v", withdrawReason: reason })).ok).toBe(true); expect(f.fetcher.mock.calls[0]?.[1]?.method).toBe(method); } });
  it("dry-run performs no remote calls or durable writes", async () => { const f = fixture([]); const r = await f.adapter.publishListing({ ...f.ctx, allowLiveRequests: false }, { propertyId: "p", externalId: null }); expect(r).toMatchObject({ ok: true, data: { live: false } }); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.states()).toEqual([]); });
});