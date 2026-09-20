/**
 * Repartizarea promovărilor Imobiliare.ro pe agenție și pe agent.
 *
 * Testele verifică comportamentul, nu textele: un serviciu neactivat, o alocare
 * epuizată și un plafon de agenție atins trebuie să refuze activarea, iar
 * dezactivarea și recitirea nu consumă nimic. Portalul este înlocuit cu duble.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkPromotionAllocation,
  emptyPromotionUsage,
  promotionAllocationFor,
  promotionConsumption,
  promotionRemaining,
  validatePromotionCap,
} from "../allocation";

/* ------------------------------ duble de rețea ----------------------------- */

const slotListings = vi.fn(async (input: { slotType: string }) => ({
  ok: true as const,
  listings: [{ reference: "HB-1", listingId: "1", title: "A", url: null }],
}));
const listingPromotions = vi.fn(async (input: { reference: string }) => ({
  states: new Map<string, boolean | number | null>([["energy", 3]]),
  error: null as string | null,
}));

vi.mock("@/lib/portals/imobiliare/promotions.server", () => ({
  fetchImobiliareSlotListings: (input: { slotType: string }) => slotListings(input),
  fetchImobiliareListingPromotions: (input: { reference: string }) => listingPromotions(input),
  fetchImobiliareSlotInventory: async () => ({
    slotType: "tl",
    inventory: { slotType: "tl", total: 10, used: 1, available: 9 },
    error: null,
    syncedAt: new Date().toISOString(),
  }),
}));

import { ensureImobiliarePromotionAllowed } from "../allocation.server";
import { imobiliarePromotion } from "@/lib/portals/imobiliare/promotions";

/* ------------------------------ fake Supabase ------------------------------ */

type Rows = Record<string, Record<string, unknown>[]>;

function fakeAdmin(rows: Rows) {
  function builder(table: string) {
    const filters: { column: string; value: unknown }[] = [];
    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        return api;
      },
      matching: () =>
        (rows[table] ?? []).filter((row) =>
          filters.every(({ column, value }) => row[column] === value),
        ),
      maybeSingle: async () => ({ data: api.matching()[0] ?? null, error: null }),
      then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
        Promise.resolve({ data: api.matching(), error: null }).then(resolve),
    };
    return api;
  }
  return { from: (table: string) => builder(table) } as never;
}

const ORG = "org-1";
const AGENT = "agent-1";

function baseRows(overrides: Partial<Rows> = {}): Rows {
  return {
    properties: [{ id: "prop-1", organization_id: ORG, assigned_to: AGENT }],
    portal_listings: [
      {
        organization_id: ORG,
        portal: "imobiliare_ro",
        property_id: "prop-1",
        external_id: "HB-1",
      },
    ],
    promotion_service_settings: [],
    promotion_allocations: [],
    ...overrides,
  };
}

const session = { accessToken: "token", username: "agentie", refresh: async () => "token" } as never;

async function ensure(rows: Rows, value: boolean | number, current: boolean | number | null, id = "tl") {
  return ensureImobiliarePromotionAllowed({
    admin: fakeAdmin(rows),
    session,
    organizationId: ORG,
    propertyId: "prop-1",
    definition: imobiliarePromotion(id)!,
    current,
    next: value,
  });
}

beforeEach(async () => {
  const { clearPromotionUsageCache } = await import("../allocation.server");
  clearPromotionUsageCache();
  slotListings.mockClear();
  listingPromotions.mockClear();
});

describe("consumul unei modificări", () => {
  it("nu consumă la dezactivare, la scădere sau la retrimiterea aceleiași valori", () => {
    expect(promotionConsumption("boolean", true, false)).toBe(0);
    expect(promotionConsumption("boolean", true, true)).toBe(0);
    expect(promotionConsumption("numeric", 5, 2)).toBe(0);
    expect(promotionConsumption("numeric", 5, 5)).toBe(0);
  });

  it("consumă un loc la activare și diferența la creșterea unui buget", () => {
    expect(promotionConsumption("boolean", false, true)).toBe(1);
    expect(promotionConsumption("numeric", 2, 6)).toBe(4);
    expect(promotionConsumption("numeric", null, 3)).toBe(3);
  });
});

describe("alocări", () => {
  it("rând absent sau gol = nelimitat în limita agenției", () => {
    const map = new Map<string, number | null>([["a", null]]);
    expect(promotionAllocationFor(map, "a")).toBeNull();
    expect(promotionAllocationFor(map, "b")).toBeNull();
    expect(promotionRemaining(null, 7)).toBeNull();
    expect(promotionRemaining(3, 2)).toBe(1);
  });

  it("refuză activarea când alocarea agentului este epuizată", () => {
    const result = checkPromotionAllocation({
      label: "Top Listing",
      kind: "boolean",
      enabled: true,
      agencyCap: null,
      allocation: 2,
      usage: { byUser: new Map([[AGENT, 2]]), total: 2, totalFromPortal: false, unknownUsers: [], error: null },
      userId: AGENT,
      current: false,
      next: true,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("2/2");
  });

  it("plafonul agenției blochează chiar dacă agentul mai are loc", () => {
    const result = checkPromotionAllocation({
      label: "Top Listing",
      kind: "boolean",
      enabled: true,
      agencyCap: 4,
      allocation: 10,
      usage: { byUser: new Map([[AGENT, 1]]), total: 4, totalFromPortal: false, unknownUsers: [], error: null },
      userId: AGENT,
      current: false,
      next: true,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("4/4");
  });

  it("nu blochează pe nimeni când consumul agenției este cunoscut, chiar dacă un coleg nu a putut fi calculat", () => {
    const usage = {
      byUser: new Map<string, number>(),
      total: 0,
      totalFromPortal: true,
      unknownUsers: [AGENT],
      error: null,
    };
    expect(
      checkPromotionAllocation({
        label: "Top Listing",
        kind: "boolean",
        enabled: true,
        agencyCap: 4,
        allocation: null,
        usage,
        userId: AGENT,
        current: false,
        next: true,
      }),
    ).toEqual({ ok: true, consumes: 1 });

    // Cu alocare proprie nu putem decide fără consumul agentului, deci refuzăm explicit.
    const refused = checkPromotionAllocation({
      label: "Top Listing",
      kind: "boolean",
      enabled: true,
      agencyCap: 4,
      allocation: 2,
      usage,
      userId: AGENT,
      current: false,
      next: true,
    });
    expect(refused.ok).toBe(false);
  });

  it("permite dezactivarea chiar dacă serviciul nu mai este activat", () => {
    const result = checkPromotionAllocation({
      label: "Top Listing",
      kind: "boolean",
      enabled: false,
      agencyCap: 0,
      allocation: 0,
      usage: emptyPromotionUsage("eroare"),
      userId: AGENT,
      current: true,
      next: false,
    });
    expect(result).toEqual({ ok: true, consumes: 0 });
  });
});

describe("plafonul agenției față de rezerva portalului", () => {
  it("respinge un plafon mai mare decât locurile cumpărate", () => {
    const result = validatePromotionCap({ label: "Top Listing", cap: 12, poolTotal: 10 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("10");
  });

  it("acceptă un plafon în limita rezervei și plafonul gol", () => {
    expect(validatePromotionCap({ label: "Top Listing", cap: 10, poolTotal: 10 }).ok).toBe(true);
    expect(validatePromotionCap({ label: "Top Listing", cap: null, poolTotal: null }).ok).toBe(true);
  });

  it("refuză validarea când portalul nu raportează locurile", () => {
    expect(validatePromotionCap({ label: "Top Listing", cap: 1, poolTotal: null }).ok).toBe(false);
  });
});

describe("poarta server-side", () => {
  it("refuză un serviciu neactivat pentru agenție", async () => {
    const result = await ensure(baseRows(), true, false);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("nu este activat pentru agenție");
  });

  it("permite activarea când serviciul este activat și nu există plafoane", async () => {
    const rows = baseRows({
      promotion_service_settings: [
        {
          organization_id: ORG,
          portal_key: "imobiliare_ro",
          service_key: "tl",
          enabled: true,
          agency_cap: null,
        },
      ],
    });
    const result = await ensure(rows, true, false);
    expect(result).toEqual({ ok: true, consumes: 1 });
    // Fără plafon nu citim consumul de la portal.
    expect(slotListings).not.toHaveBeenCalled();
  });

  it("refuză activarea când alocarea agentului este consumată de anunțurile lui", async () => {
    const rows = baseRows({
      promotion_service_settings: [
        {
          organization_id: ORG,
          portal_key: "imobiliare_ro",
          service_key: "tl",
          enabled: true,
          agency_cap: null,
        },
      ],
      promotion_allocations: [
        {
          organization_id: ORG,
          portal_key: "imobiliare_ro",
          service_key: "tl",
          user_id: AGENT,
          amount: 1,
        },
      ],
    });
    const result = await ensure(rows, true, false);
    expect(result.ok).toBe(false);
    expect(slotListings).toHaveBeenCalled();
  });

  it("nu citește nimic și nu refuză la dezactivare", async () => {
    const result = await ensure(baseRows(), false, true);
    expect(result).toEqual({ ok: true, consumes: 0 });
    expect(slotListings).not.toHaveBeenCalled();
  });

  it("tratează Puncte Energy ca buget numeric al agenției", async () => {
    const rows = baseRows({
      promotion_service_settings: [
        {
          organization_id: ORG,
          portal_key: "imobiliare_ro",
          service_key: "energy",
          enabled: true,
          agency_cap: 4,
        },
      ],
    });
    // Consumul agenției vine din inventarul portalului (1 punct folosit), nu din citirea anunțurilor.
    const allowed = await ensure(rows, 3, 0, "energy");
    expect(allowed).toEqual({ ok: true, consumes: 3 });
    expect(listingPromotions).not.toHaveBeenCalled();
    const refused = await ensure(rows, 4, 0, "energy");
    expect(refused.ok).toBe(false);
  });
});

describe("permisiuni – tabelele de promovare", () => {
  const sql = readFileSync("drizzle/migrations/0068_promotion_allocation.sql", "utf8");

  it("activează RLS și acordă drepturi explicite", () => {
    for (const table of ["promotion_service_settings", "promotion_allocations"]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO authenticated`);
      expect(sql).toContain(`GRANT ALL ON public.${table} TO service_role`);
      expect(sql).not.toContain(`ON public.${table} TO anon`);
    }
  });

  it("limitează agentul la propria alocare, fără drept de scriere", () => {
    expect(sql).toContain("FOR SELECT TO authenticated\n  USING (user_id = auth.uid())");
    expect(sql).not.toMatch(/USING \(true\)/);
    // Scrierea rămâne la superadmin și la administratorul propriei agenții.
    expect(sql).toContain("public.is_org_admin() AND organization_id = public.current_org()");
    expect(sql).toContain("public.is_superadmin()");
  });
});

describe("consumul serviciilor numerice", () => {
  it("ia totalul agenției din inventarul portalului, fără să citească fiecare anunț", async () => {
    const { loadPromotionUsage, clearPromotionUsageCache } = await import("../allocation.server");
    clearPromotionUsageCache();
    const usage = await loadPromotionUsage({
      admin: fakeAdmin(baseRows()),
      session,
      organizationId: ORG,
      definition: imobiliarePromotion("energy")!,
      userIds: [],
    });
    expect(usage.totalFromPortal).toBe(true);
    expect(usage.total).toBe(1);
    expect(listingPromotions).not.toHaveBeenCalled();
  });

  it("un agent cu prea multe oferte nu blochează ceilalți agenți", async () => {
    const { loadPromotionUsage, clearPromotionUsageCache } = await import("../allocation.server");
    clearPromotionUsageCache();
    const many = Array.from({ length: 40 }, (_, index) => ({
      reference: `HB-${index}`,
      listingId: String(index),
      title: null,
      url: null,
    }));
    slotListings.mockImplementationOnce(async () => ({ ok: true as const, listings: many }));
    const rows = baseRows({
      properties: [
        { id: "prop-1", organization_id: ORG, assigned_to: AGENT },
        { id: "prop-2", organization_id: ORG, assigned_to: "agent-2" },
      ],
      portal_listings: [
        ...many.map((listing, index) => ({
          organization_id: ORG,
          portal: "imobiliare_ro",
          property_id: index === 0 ? "prop-2" : "prop-1",
          external_id: listing.reference,
        })),
      ],
    });
    const usage = await loadPromotionUsage({
      admin: fakeAdmin(rows),
      session,
      organizationId: ORG,
      definition: imobiliarePromotion("energy")!,
      userIds: [AGENT, "agent-2"],
    });
    expect(usage.unknownUsers).toContain(AGENT);
    expect(usage.unknownUsers).not.toContain("agent-2");
  });

  it("memorează consumul citit, deci a doua verificare nu mai întreabă portalul", async () => {
    const { loadPromotionUsage, clearPromotionUsageCache, invalidatePromotionUsageCache } =
      await import("../allocation.server");
    clearPromotionUsageCache();
    const args = {
      admin: fakeAdmin(baseRows()),
      session,
      organizationId: ORG,
      definition: imobiliarePromotion("energy")!,
      userIds: [] as string[],
    };
    await loadPromotionUsage(args);
    const calls = slotListings.mock.calls.length;
    await loadPromotionUsage(args);
    expect(slotListings.mock.calls.length).toBe(calls);
    invalidatePromotionUsageCache(ORG, "energy");
    await loadPromotionUsage(args);
    expect(slotListings.mock.calls.length).toBeGreaterThan(calls);
  });

  it("nu refuză activarea când portalul dă totalul agenției", () => {
    const result = checkPromotionAllocation({
      label: "Puncte Energy",
      kind: "numeric",
      enabled: true,
      agencyCap: 5000,
      allocation: null,
      usage: {
        byUser: new Map(),
        total: 844,
        totalFromPortal: true,
        unknownUsers: [],
        error: null,
      },
      userId: AGENT,
      current: 0,
      next: 10,
    });
    expect(result).toEqual({ ok: true, consumes: 10 });
  });
});

describe("retragerea surplusului", () => {
  const holdings = [
    { propertyId: "p1", userId: AGENT, amount: 1, activatedAt: "2026-01-01T00:00:00Z" },
    { propertyId: "p2", userId: AGENT, amount: 1, activatedAt: "2026-03-01T00:00:00Z" },
    { propertyId: "p3", userId: AGENT, amount: 1, activatedAt: "2026-02-01T00:00:00Z" },
  ];

  it("retrage cele mai recente activări până încape în alocare", async () => {
    const { planPromotionWithdrawals } = await import("../allocation");
    const plan = planPromotionWithdrawals({
      kind: "boolean",
      holdings,
      agencyCap: null,
      allocations: new Map([[AGENT, 1]]),
    });
    expect(plan.map((item) => item.propertyId)).toEqual(["p2", "p3"]);
  });

  it("nu planifică nimic când noua limită încape", async () => {
    const { planPromotionWithdrawals } = await import("../allocation");
    expect(
      planPromotionWithdrawals({
        kind: "boolean",
        holdings,
        agencyCap: 3,
        allocations: new Map([[AGENT, 3]]),
      }),
    ).toEqual([]);
  });
});

describe("serviciile afișate pe ofertă", () => {
  it("nu mai expune „Rotații” ca promovare", async () => {
    const { IMOBILIARE_PROMOTIONS } = await import("@/lib/portals/imobiliare/promotions");
    expect(IMOBILIARE_PROMOTIONS.some((definition) => definition.id === "rotatii")).toBe(false);
  });
});
