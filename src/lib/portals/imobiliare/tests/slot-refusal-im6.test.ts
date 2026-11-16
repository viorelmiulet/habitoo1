import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalContext, ListingRef } from "../../adapter";
import type { ImobiliareListingPlan } from "../payload.server";

const state = vi.hoisted(() => ({
  request: vi.fn(), logs: [] as Record<string, unknown>[], invalidateUsage: vi.fn(),
  starter: { total: 30, used: 30 } as { total: number; used: number },
  bonus: { total: 5, used: 4 },
  refuseOnce: true, refuseAlways: false,
}));
vi.mock("../auth.server", () => ({ imobiliareAuthedRequest: state.request }));
vi.mock("@/lib/portals.functions", () => ({ logOperation: async (row: Record<string, unknown>) => { state.logs.push(row); } }));
vi.mock("../../promotions/allocation.server", () => ({ ensureImobiliarePromotionAllowed: async () => ({ ok: true }), invalidatePromotionUsageCache: state.invalidateUsage }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const query = { select: () => query, eq: () => query, then: (resolve: (value: unknown) => unknown) => resolve({ data: [] }), upsert: async () => ({ error: null }) };
  return query;
} } }));

import { publishPlan } from "../../adapters/imobiliare.server";
import { decideImobiliareSlotRefusal, IMORADAR_NO_SLOTS_WARNING } from "../online-promotions";
import { withdrawImobiliareDestinations } from "../online-promotions.server";
import { fetchImobiliareAccount, clearImobiliareAccountCache } from "../account.server";

const SLOTS_422 = {
  ok: false, status: 422,
  classification: { code: "VALIDATION_ERROR", message: "Imobiliare.ro a respins datele anunțului. (promotion: Nu aveți suficiente sloturi pentru a publica această ofertă)" },
  body: { errors: { promotion: ["Nu aveți suficiente sloturi pentru a publica această ofertă"] } },
};
const ctx = { organizationId: "org" } as PortalContext;
const plan = { customReference: "HB-1372", transaction: "sale", listing: { custom_reference: "HB-1372" } } as unknown as ImobiliareListingPlan;
const publish = (changes: Record<string, boolean | number>) => publishPlan({ ctx, session: {} as never, plan, images: [], mode: "create",
  ref: { propertyId: "property", imobiliareMode: "combined", imobiliarePromotions: changes } as ListingRef });
const onlinePosts = () => state.request.mock.calls.map((c) => c[1]).filter((c) => c.method === "POST" && c.path.endsWith("/promotions"));

beforeEach(() => {
  vi.clearAllMocks(); state.logs.length = 0; state.refuseOnce = true; state.refuseAlways = false;
  state.starter = { total: 30, used: 30 };
  clearImobiliareAccountCache();
  let refused = false;
  state.request.mockImplementation(async (_s: unknown, call: { method: string; path: string }) => {
    if (call.path.endsWith("/slots/starter")) return { ok: true, status: 200, classification: null, body: state.starter };
    if (call.path.endsWith("/slots/bonus")) return { ok: true, status: 200, classification: null, body: state.bonus };
    if (call.path === "/api/v3/me") return { ok: true, status: 200, classification: null, body: { data: { agency: { listing_online_count: 34 } } } };
    if (call.method === "POST" && call.path.endsWith("/promotions") && (state.refuseAlways || (state.refuseOnce && !refused))) { refused = true; return SLOTS_422; }
    if (call.path.includes("/promotions/listings/")) return { ok: true, status: 200, classification: null, body: { data: [] } };
    return { ok: true, status: 200, classification: null, body: call.method === "GET" ? { data: { path: "/oferta/x" } } : { data: {} } };
  });
});

describe("IM6 — decizia la refuzul pentru sloturi", () => {
  it("slot de bază plin → mesaj cu X folosite din Y și Bonus liber", () => {
    const d = decideImobiliareSlotRefusal({ refused: true, bonusSelected: false, imoradarRequested: true, base: { total: 30, used: 30, available: 0 }, bonus: { total: 5, used: 4, available: 1 } });
    expect(d).toEqual({ kind: "base_exhausted", missing: "base", message: "Abonamentul Imobiliare.ro nu mai are anunțuri disponibile (30 folosite din 30). Sloturi Bonus libere: 1 — bifează Bonus sau retrage alt anunț." });
  });
  it("slot de bază liber + imoradar cerut → publicare fără imoradar, cu avertisment", () => {
    const d = decideImobiliareSlotRefusal({ refused: true, bonusSelected: false, imoradarRequested: true, base: { total: 30, used: 12, available: 18 }, bonus: null });
    expect(d).toEqual({ kind: "retry_without_imoradar", missing: "imoradar", warning: IMORADAR_NO_SLOTS_WARNING });
  });
  it("Bonus bifat sau alt refuz → nicio decizie de sloturi", () => {
    expect(decideImobiliareSlotRefusal({ refused: true, bonusSelected: true, imoradarRequested: true, base: null, bonus: null }).kind).toBe("not_slots");
    expect(decideImobiliareSlotRefusal({ refused: false, bonusSelected: false, imoradarRequested: true, base: null, bonus: null }).kind).toBe("not_slots");
  });

  it("422 cu slot de bază liber → al doilea POST fără imoradar, publicat cu avertisment, log slots_check", async () => {
    state.starter = { total: 30, used: 12 };
    const out = await publish({ promote_imoradar: true });
    expect(out.ok).toBe(true);
    expect(onlinePosts()).toHaveLength(2);
    expect(onlinePosts()[0].body).toMatchObject({ status: "online", imoradar_status: "online" });
    expect(onlinePosts()[1].body).toEqual({ status: "online" });
    expect(out.ok && out.promotionErrors).toContainEqual({ promotionId: "promote_imoradar", message: IMORADAR_NO_SLOTS_WARNING });
    const log = state.logs.find((l) => l.operation === "slots_check");
    expect(log?.portalResponse).toEqual({ missing: "imoradar", base: { slot_type: "starter", total: 30, used: 12 }, bonus: { total: 5, used: 4 } });
  });

  it("422 cu slot de bază plin → refuz cu mesajul abonamentului, fără al doilea POST", async () => {
    state.refuseAlways = true;
    const out = await publish({ promote_imoradar: true });
    expect(out.ok).toBe(false);
    expect(onlinePosts()).toHaveLength(1);
    expect(!out.ok && out.fail.message).toContain("Abonamentul Imobiliare.ro nu mai are anunțuri disponibile (30 folosite din 30).");
    expect(state.logs.find((l) => l.operation === "slots_check")).toMatchObject({ errorCode: "SLOT_LIMIT", portalResponse: { missing: "base" } });
  });
});

describe("IM6 — retragerea invalidează cache-urile și trece imoradar în draft", () => {
  it("după retragere, /me și consumul promoțiilor se recitesc", async () => {
    await fetchImobiliareAccount({} as never, "org");
    await fetchImobiliareAccount({} as never, "org");
    const meCalls = () => state.request.mock.calls.filter((c) => c[1].path === "/api/v3/me").length;
    expect(meCalls()).toBe(1);
    await withdrawImobiliareDestinations({ session: {} as never, organizationId: "org", reference: "HB-1272" });
    expect(state.invalidateUsage).toHaveBeenCalledWith("org");
    await fetchImobiliareAccount({} as never, "org");
    expect(meCalls()).toBe(2);
  });

  it("imoradar_status rămas online după POST → încă un POST doar pentru imoradar", async () => {
    let imoradar = "online";
    state.request.mockImplementation(async (_s: unknown, call: { method: string; path: string; body?: Record<string, unknown> }) => {
      if (call.method === "POST" && call.body?.imoradar_status === "draft" && !("status" in call.body)) imoradar = "draft";
      return { ok: true, status: 200, classification: null, body: call.method === "GET" ? { status: "draft", imoradar_status: imoradar } : { data: {} } };
    });
    const out = await withdrawImobiliareDestinations({ session: {} as never, organizationId: "org", reference: "HB-1272" });
    expect(onlinePosts().map((c) => c.body)).toEqual([{ status: "draft", imoradar_status: "draft" }, { imoradar_status: "draft" }]);
    expect(out).toMatchObject({ ok: true, imoradarWarning: null });
  });
});
