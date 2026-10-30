import { beforeEach, describe, expect, it, vi } from "vitest";
import { imobiliareAdapter } from "../../adapters/imobiliare.server";
import type { PortalContext, ListingRef } from "../../adapter";
import { mergePortalOffers, type PortalOffer } from "../offer-links";

const mocks = vi.hoisted(() => ({
  plans: [] as { transaction: "sale" | "rent"; customReference: string; listing: Record<string, unknown> }[],
  offers: [] as PortalOffer[], request: vi.fn(), log: vi.fn(), gallery: vi.fn(), online: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({
      data: table === "properties" ? { property_type: "house" } : { portal_offers: mocks.offers }, error: null,
    }) };
    return query;
  },
} }));
vi.mock("@/lib/portals.functions", () => ({ logOperation: mocks.log }));
vi.mock("../auth.server", () => ({ getImobiliareSession: async () => ({ ok: true, session: {} }), imobiliareAuthedRequest: mocks.request }));
vi.mock("../categories.server", () => ({ readCategoryCatalog: () => ({}), categoryCatalogIsFresh: () => true }));
vi.mock("../media.server", () => ({ encodeImobiliareImages: async () => ({ images: [{ dataUrl: "fake", bytes: 4 }], expected: 1, warnings: [] }) }));
vi.mock("../payload.server", () => ({ buildImobiliarePayload: async () => ({ ok: true, plans: mocks.plans, warnings: [] }) }));
vi.mock("../media-transfer.server", () => ({ sendImobiliareGallery: mocks.gallery }));
vi.mock("../client.server", () => ({ withImobiliareWriteLock: (_key: string, run: () => unknown) => run() }));
vi.mock("../lock.server", () => ({ withDurableImobiliareLock: ({ run }: { run: () => unknown }) => run() }));
vi.mock("../online-promotions.server", () => ({
  publishImobiliareOnline: mocks.online,
  withdrawImobiliareDestinations: async ({ reference }: { reference: string }) => mocks.request({}, {
    method: "POST", path: `/api/v3/listings/${reference}/promotions`, body: { status: "draft", imoradar_status: "draft" },
  }),
}));

const ctx = { organizationId: "org", settings: {}, allowLiveRequests: true } as PortalContext;
const offer = (transaction: "sale" | "rent", reference: string): PortalOffer => ({ transaction, reference, id: "1", url: "https://www.imobiliare.ro/oferta/1" });
const plan = (transaction: "sale" | "rent", customReference = "HB-1260") => ({ transaction, customReference, listing: { custom_reference: customReference } });
const run = (externalId: string) => imobiliareAdapter.updateListing(ctx, { propertyId: "property", externalId, actorId: "actor" } as ListingRef);

describe("Imobiliare transaction replacement without network", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network forbidden"); }));
    mocks.request.mockResolvedValue({ ok: true, status: 200, body: { data: { id: 2, path: "https://www.imobiliare.ro/oferta/2" } } });
    mocks.gallery.mockResolvedValue({ ok: true, sent: 1, body: {} });
    mocks.online.mockResolvedValue({ ok: true, status: 200, body: { data: { id: 2 } }, promotionErrors: [] });
    mocks.log.mockResolvedValue(undefined);
  });

  it.each([
    ["sale", "rent", "-C"], ["rent", "sale", "-V"],
  ] as const)("%s → %s drafts old reference and creates %s", async (previous, next, suffix) => {
    mocks.offers = [offer(previous, "HB-1260")];
    mocks.plans = [plan(next)];
    const result = await run("HB-1260");
    expect(result.ok).toBe(true);
    const writes = mocks.request.mock.calls.map((call) => call[1]).filter((call) => call.method !== "GET");
    expect(writes).toEqual([
      { method: "POST", path: "/api/v3/listings/HB-1260/promotions", body: { status: "draft", imoradar_status: "draft" } },
      expect.objectContaining({ method: "POST", body: { custom_reference: `HB-1260${suffix}` } }),
    ]);
    expect(mocks.request.mock.calls.some((call) => call[1].method === "PUT")).toBe(false);
    expect(mocks.gallery.mock.calls[0]?.[2]).toBe(`HB-1260${suffix}`);
    expect(mocks.online).toHaveBeenCalledWith(expect.objectContaining({ reference: `HB-1260${suffix}` }));
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ operation: "withdraw", success: true, externalId: "HB-1260", errorMessage: "tranzacție schimbată" }));
    expect(mocks.request.mock.invocationCallOrder[0]).toBeLessThan(mocks.gallery.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.gallery.mock.invocationCallOrder[0]).toBeLessThan(mocks.online.mock.invocationCallOrder[0] ?? 0);
    if (!result.ok) return;
    expect(result.data.externalId).toBe(`HB-1260${suffix}`);
    const saved = mergePortalOffers(mocks.offers, result.data.offers ?? [], result.data.replacedReferences);
    expect(saved.map((entry) => entry.reference)).toEqual([`HB-1260${suffix}`]);
  });

  it("same transaction keeps PUT and existing activation behavior", async () => {
    mocks.offers = [offer("sale", "HB-1260")]; mocks.plans = [plan("sale")];
    const result = await run("HB-1260");
    expect(result.ok).toBe(true);
    expect(mocks.request.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", path: "/api/v3/listings/HB-1260" });
    expect(mocks.log).not.toHaveBeenCalled(); expect(mocks.online).not.toHaveBeenCalled();
  });

  it("sale + rent retains both references and PUTs", async () => {
    mocks.offers = [offer("sale", "HB-1260-V"), offer("rent", "HB-1260-C")];
    mocks.plans = [plan("sale", "HB-1260-V"), plan("rent", "HB-1260-C")];
    const result = await run("HB-1260-V,HB-1260-C");
    expect(result.ok).toBe(true);
    expect(mocks.request.mock.calls.filter((call) => call[1].method === "PUT").map((call) => call[1].path)).toEqual([
      "/api/v3/listings/HB-1260-V", "/api/v3/listings/HB-1260-C",
    ]);
    expect(mocks.log).not.toHaveBeenCalled(); expect(mocks.online).not.toHaveBeenCalled();
    if (result.ok) expect(result.data.externalId).toBe("HB-1260-V,HB-1260-C");
  });
});