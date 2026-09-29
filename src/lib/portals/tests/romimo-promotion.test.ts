/**
 * Promovarea Romimo (`ad.promoted`), regulile 1–5. Fără date reale, fără rețea.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PortalContext } from "@/lib/portals/adapter";
import { createRomimoAdapter } from "@/lib/portals/adapters/romimo.server";
import {
  effectivePromoted,
  promotedAfterAction,
  promotionPlan,
} from "@/lib/portals/promotion-flag";
import { getPortalDefinition } from "@/lib/portals/registry";

afterEach(() => vi.restoreAllMocks());

const ctx: PortalContext = {
  organizationId: "org",
  definition: { id: "romimo" } as never,
  direction: "habitoo_to_portal" as never,
  authenticationMode: "portal_api_key" as never,
  externalAccountId: "agentie@exemplu.ro",
  portalCredential: "api-key-secret",
  settings: {},
  allowLiveRequests: true,
};

const baseDto = {
  ad: {
    active: true,
    externalid: "HB-9999",
    category: 338,
    price: 100000,
    currency: "EUR",
    title: "Apartament de test",
    text: "Descriere de test suficient de lungă.",
  },
};

describe("regula 1: Promovat depinde de Publicat", () => {
  it("fără Publicat, Promovat e mereu NU", () => {
    expect(effectivePromoted(false, true)).toBe(false);
    expect(effectivePromoted(true, true)).toBe(true);
  });
  it("debifarea Publicat debifează Promovat și dezactivează promovarea salvată", () => {
    const plan = promotionPlan({
      flag: true,
      enabled: false,
      published: true,
      previous: true,
      savedPromoted: true,
      wantedPromoted: true,
    });
    expect(plan.promoted).toBe(false);
  });
  it("doar Romimo are bifa Promovat", () => {
    expect(getPortalDefinition("romimo")?.supports_promoted_flag).toBe(true);
    expect(getPortalDefinition("imobiliare_ro")?.supports_promoted_flag).toBeFalsy();
  });
});

describe("regula 2: Promovat intră în fluxul „Publică”", () => {
  it("schimbarea doar la Promovat pe un anunț publicat = actualizare „Promovare activată”", () => {
    const plan = promotionPlan({
      flag: true,
      enabled: true,
      published: true,
      previous: true,
      savedPromoted: false,
      wantedPromoted: true,
    });
    expect(plan).toEqual({ promoted: true, operation: "promote_on", promotionOnlyUpdate: true });
  });
  it("oprirea promovării = „Promovare dezactivată”", () => {
    const plan = promotionPlan({
      flag: true,
      enabled: true,
      published: true,
      previous: true,
      savedPromoted: true,
      wantedPromoted: false,
    });
    expect(plan.operation).toBe("promote_off");
    expect(plan.promotionOnlyUpdate).toBe(true);
  });
  it("prima publicare cu Promovat nu e „doar promovare”", () => {
    const plan = promotionPlan({
      flag: true,
      enabled: true,
      published: false,
      previous: false,
      savedPromoted: false,
      wantedPromoted: true,
    });
    expect(plan.promoted).toBe(true);
    expect(plan.promotionOnlyUpdate).toBe(false);
  });
  it("portalurile fără flag nu sunt afectate", () => {
    const plan = promotionPlan({
      flag: false,
      enabled: true,
      published: true,
      previous: true,
      savedPromoted: false,
      wantedPromoted: true,
    });
    expect(plan).toEqual({ promoted: false, operation: null, promotionOnlyUpdate: false });
  });
});

describe("regula 3: mapper-ul trimite valoarea salvată", () => {
  function mockFetch() {
    const bodies: Record<string, Record<string, unknown>>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.includes("/api/Token")) return new Response('"jwt"', { status: 200 });
      if (typeof init?.body === "string") bodies.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }) as never);
    return bodies;
  }

  it("ref.promoted ajunge în `ad.promoted`", async () => {
    const bodies = mockFetch();
    const adapter = createRomimoAdapter(async (_c, ref) => ({
      ok: true,
      dto: { ad: { ...baseDto.ad, promoted: ref.promoted === true } },
    }));
    await adapter.updateListing(ctx, { propertyId: "p", externalId: "HB-9999", promoted: true });
    await adapter.updateListing(ctx, { propertyId: "p", externalId: "HB-9999" });
    expect(bodies[0]?.["ad"]?.["promoted"]).toBe(true);
    expect(bodies[1]?.["ad"]?.["promoted"]).toBe(false);
  });

  it("mapper-ul folosește promovarea din context, implicit NU", async () => {
    const { mapPropertyToRomimo } = await import("@/lib/portals/romimo/mapper");
    const property = {
      id: "p",
      reference: "HB-9999",
      propertyType: "apartment",
      transactionKind: "sale",
      rooms: 2,
      title: "Apartament 2 camere",
      description: "Apartament decomandat, complet mobilat și utilat.",
      price: 100000,
      currency: "EUR",
      salePrice: 100000,
      saleCurrency: "EUR",
      county: "Cluj",
      city: "Cluj-Napoca",
      district: null,
      lat: 46.77,
      lng: 23.6,
      assignedTo: null,
      usableSurface: 52,
      builtSurface: null,
      landSurface: null,
      floor: 1,
      layout: "Decomandat",
      buildYear: 2019,
      heatingSystems: ["Centrală proprie"],
      images: [],
    } as never;
    const context = {
      agent: { fullName: "Agent", email: "a@exemplu.ro", phone: "+40700000000" },
      organization: null,
      publicBaseUrl: "https://crm.habitoo.ro",
    };
    const on = await mapPropertyToRomimo(property, { ...context, promoted: true });
    const off = await mapPropertyToRomimo(property, context);
    expect(on.ok && on.dto.ad?.promoted).toBe(true);
    expect(off.ok).toBe(true);
    if (off.ok) expect(off.dto.ad?.promoted).toBe(false);
  });

  it("o actualizare fără schimbare la Promovat păstrează promovarea salvată", () => {
    const plan = promotionPlan({
      flag: true,
      enabled: true,
      published: true,
      previous: true,
      savedPromoted: true,
      wantedPromoted: undefined,
    });
    expect(plan).toEqual({ promoted: true, operation: null, promotionOnlyUpdate: false });
  });
});

describe("regula 4: retragerea șterge promovarea", () => {
  it("retragere reușită → NU", () => {
    expect(
      promotedAfterAction({ action: "withdraw", ok: true, saved: true, requested: true }),
    ).toBe(false);
  });
});

describe("regula 5: refuzul Romimo", () => {
  it("afișează mesajul exact al Romimo, iar valoarea salvată rămâne NU", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/Token")) return new Response('"jwt"', { status: 200 });
      return new Response(
        JSON.stringify({ status: 400, errors: { "": ["Pachetul nu mai are promovari disponibile!"] } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }) as never);
    const adapter = createRomimoAdapter(async () => ({
      ok: true,
      dto: { ad: { ...baseDto.ad, promoted: true } },
    }));
    const result = await adapter.updateListing(ctx, {
      propertyId: "p",
      externalId: "HB-9999",
      promoted: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Pachetul nu mai are promovari disponibile!");
    expect(
      promotedAfterAction({ action: "update", ok: false, saved: false, requested: true }),
    ).toBe(false);
  });
});
