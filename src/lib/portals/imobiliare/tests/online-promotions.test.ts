import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalContext, ListingRef } from "../../adapter";
import type { ImobiliareListingPlan } from "../payload.server";
const state = vi.hoisted(() => ({ request: vi.fn(), logs: [] as Record<string, unknown>[], saved: [] as Record<string, unknown>[], gate: vi.fn() }));
vi.mock("../auth.server", () => ({ imobiliareAuthedRequest: state.request }));
vi.mock("@/lib/portals.functions", () => ({ logOperation: async (row: Record<string, unknown>) => { state.logs.push(row); } }));
vi.mock("../../promotions/allocation.server", () => ({ ensureImobiliarePromotionAllowed: state.gate, invalidatePromotionUsageCache: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const query = { select: () => query, eq: () => query, then: (resolve: (value: unknown) => unknown) => resolve({ data: [] }),
    upsert: async (row: Record<string, unknown>) => { state.saved.push(row); return { error: null }; } };
  return query;
} } }));
import { publishPlan } from "../../adapters/imobiliare.server";
import { imobiliareStandardSlotsMessage, warningsForImobiliareService } from "../online-promotions";
import { imobiliarePromotion } from "../promotions";
import { setImobiliareListingPromotion } from "../promotions.server";
import { imobiliarePromotionChanges } from "../card-promotions";

const ctx = { organizationId: "org" } as PortalContext;
const plan = { customReference: "HB-1126", transaction: "rent", listing: { custom_reference: "HB-1126" } } as unknown as ImobiliareListingPlan;
async function publish(changes: Record<string, boolean | number>) {
  return publishPlan({ ctx, session: {} as never, plan, images: [], mode: "create", ref: { propertyId: "property", imobiliarePromotions: changes } as ListingRef });
}
beforeEach(() => {
  vi.clearAllMocks(); state.saved.length = 0; state.logs.length = 0;
  state.gate.mockResolvedValue({ ok: true });
  state.request.mockImplementation(async (_session: unknown, call: { method: string; path: string }) => ({
    ok: true, status: 200, classification: null, body: call.path.includes("/slots/") ? { data: { total: 10, used: 2 } }
      : call.path.includes("/promotions/listings/") ? { data: [] }
      : call.method === "GET" ? { data: { path: "https://www.imobiliare.ro/oferta/test" } } : { data: {} },
  }));
});
const writes = () => state.request.mock.calls.map(call => call[1]).filter(call => call.method === "POST" && call.path.endsWith("/promotions"));
describe("initial online contract", () => {
  it("Bonus uses one online POST, not a preceding standard-slot POST", async () => {
    expect((await publish({ bonus: true })).ok).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({ status: "online", promotions: { bonus: true } });
    expect(state.saved).toEqual([expect.objectContaining({ promotion_id: "bonus", value_boolean: true })]);
    expect(state.gate).toHaveBeenCalledWith(expect.objectContaining({ propertyId: "property", next: true, definition: expect.objectContaining({ id: "bonus" }) }));
  });
  it("Bonus and Top Listing share the same online POST", async () => {
    expect((await publish({ bonus: true, tl: true })).ok).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({ status: "online", promotions: { bonus: true, top_listing: true } });
    expect(state.saved.map(row => row.promotion_id)).toEqual(["bonus", "tl"]);
  });
  it("all selected fields including promo and Energy go in that POST", async () => {
    await publish({ bonus: true, tl: true, tls: true, promo: true, energy: 3, pole_position: true, promote_imoradar: true });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body.promotions).toEqual({ bonus: true, top_listing: true, top_listing_s: true, promo: true, energy: 3, pole_position: true, promote_imoradar: true });
  });
  it("rejects allocation before online", async () => {
    state.gate.mockResolvedValue({ ok: false, message: "Plafonul agenției" });
    expect((await publish({ bonus: true })).ok).toBe(false);
    expect(writes()).toEqual([]);
  });
  it("rejects exhausted Bonus before online", async () => {
    const original = state.request.getMockImplementation();
    state.request.mockImplementation(async (session, call) => call.path.endsWith("/slots/bonus")
      ? { ok: true, status: 200, body: { data: { total: 2, used: 2 } }, classification: null } : original?.(session, call));
    expect((await publish({ bonus: true })).ok).toBe(false);
    expect(writes()).toEqual([]);
  });
  it("standard-slot 422 without Bonus produces the card message with live Bonus count", async () => {
    const original = state.request.getMockImplementation();
    state.request.mockImplementation(async (session, call) => call.method === "POST" && call.path.endsWith("/promotions")
      ? { ok: false, status: 422, body: {}, classification: { code: "VALIDATION_ERROR", message: "Nu aveți suficiente sloturi pentru a publica această ofertă" } } : original?.(session, call));
    const result = await publish({});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected failure");
    expect(result.fail.message).toBe("Locurile standard Imobiliare.ro sunt ocupate. Bifează Bonus (8 locuri libere) sau retrage alt anunț.");
    expect(imobiliareStandardSlotsMessage(result.fail.message, false, 5)).toContain("Bonus (5 locuri libere)");
    expect(imobiliareStandardSlotsMessage(result.fail.message, true, 5)).toBeNull();
    expect(state.saved).toEqual([]);
  });
  it("Top Listing warning does not reject online or confirm Top Listing, while Bonus is saved", async () => {
    const original = state.request.getMockImplementation();
    state.request.mockImplementation(async (session, call) => call.method === "POST" && call.path.endsWith("/promotions")
      ? { ok: true, status: 200, body: { promotion_warnings: ["Top Listing nu este activ pentru acest cont"] }, classification: null } : original?.(session, call));
    const result = await publish({ bonus: true, tl: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected online success");
    expect(result.promotionErrors).toEqual([{ promotionId: "tl", message: "Top Listing nu este activ pentru acest cont" }]);
    expect(state.saved.map(row => row.promotion_id)).toEqual(["bonus"]);
    expect(state.logs.find(row => row.operation === "promotion:tl:on")?.success).toBe(false);
  });
  it("inactive imoradar warning is tolerated only for imoradar and does not affect Bonus", async () => {
    const original = state.request.getMockImplementation();
    state.request.mockImplementation(async (session, call) => call.method === "POST" && call.path.endsWith("/promotions")
      ? { ok: true, status: 200, body: { promotion_warnings: ["Promovare imoradar nu este activ pentru acest cont"] }, classification: null } : original?.(session, call));
    const result = await publish({ bonus: true, promote_imoradar: true });
    expect(result.ok && result.promotionErrors).toEqual([]);
    expect(state.saved.map(row => row.promotion_id)).toEqual(["bonus", "promote_imoradar"]);
  });
  it("ambiguous warnings do not falsely confirm any requested service", () => {
    for (const id of ["bonus", "tl"]) {
      const definition = imobiliarePromotion(id);
      if (!definition) throw new Error("Missing service");
      expect(warningsForImobiliareService({ promotion_warnings: ["Serviciu indisponibil"] }, definition)).toEqual(["Serviciu indisponibil"]);
    }
  });
  it("published changes send only their difference without status", async () => {
    const changes = imobiliarePromotionChanges([{ id: "bonus", value: true }, { id: "tl", value: true }], { bonus: false }, true);
    const definition = imobiliarePromotion("bonus");
    if (!definition) throw new Error("Missing Bonus");
    await setImobiliareListingPromotion({ admin: { rpc: async () => ({ data: true, error: null }) } as never, session: {} as never,
      organizationId: "org", reference: "HB-1126", definition, value: changes.bonus ?? true, current: true, allocation: null });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({ promotions: { bonus: false } });
  });
});