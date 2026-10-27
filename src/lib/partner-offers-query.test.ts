import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), orders: vi.fn(), range: vi.fn(), eq: vi.fn(), sign: vi.fn(async () => ({ data: [] })) }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const fn = { middleware: () => fn, inputValidator: () => fn, handler: (handler: unknown) => handler }; return fn; } }));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from, storage: { from: () => ({ createSignedUrls: mocks.sign }) } } }));
import { listCollaborationOffers } from "./collaboration.functions";
import { legacyPlaceChoices } from "./search-places";

describe("partner offers read-only global pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockImplementation((table: string) => {
      let response: unknown = { data: [], count: 73, error: null };
      const chain: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve),
        select: (cols: string) => {
          if (table === "profiles") response = { data: { organization_id: "mine" } };
          if (table === "organizations") response = cols.startsWith("id,") ? { data: [{ id: "partner-a", name: "A", city: null, status: "active", collaboration_enabled: true }, { id: "partner-b", name: "B", city: null, status: "active", collaboration_enabled: true }] } : { data: { collaboration_enabled: true } };
          return chain;
        },
        order: (...args: unknown[]) => { mocks.orders(...args); return chain; },
        range: (...args: unknown[]) => { mocks.range(...args); return chain; },
        eq: (...args: unknown[]) => { mocks.eq(table, ...args); return chain; },
      };
      for (const method of ["in", "neq", "is", "gte", "lte", "or", "maybeSingle"]) chain[method] = () => chain;
      return chain;
    });
    mocks.rpc.mockImplementation(() => mocks.from("properties"));
  });
  const run = listCollaborationOffers as unknown as (input: { context: { userId: string }; data: Record<string, unknown> }) => Promise<{ offers: unknown[]; total: number }>;

  it("returns a counted 24-offer page beyond the old cap", async () => {
    const result = await run({ context: { userId: "agent" }, data: { offset: 48, sort: "newest" } });
    expect(mocks.range).toHaveBeenCalledWith(48, 71);
    expect(result.total).toBe(73);
    expect(mocks.orders).toHaveBeenCalledWith("created_at", { ascending: false, nullsFirst: false });
  });
  it("applies agency and price sorting in the query rather than within a page", async () => {
    await run({ context: { userId: "agent" }, data: { agencyId: "partner-b", sort: "price-asc" } });
    expect(mocks.eq).toHaveBeenCalledWith("properties", "organization_id", "partner-b");
    expect(mocks.orders).toHaveBeenCalledWith("price", { ascending: true, nullsFirst: false });
  });
  it("does not return an agency outside the eligible partner set", async () => {
    expect(await run({ context: { userId: "agent" }, data: { agencyId: "mine" } })).toEqual({ offers: [], total: 0 });
    expect(mocks.range).not.toHaveBeenCalled();
  });
  it("uses scoped parameterized choices with exact counts before partner paging", async () => {
    const places = [...legacyPlaceChoices("București", "București", "Militari"), ...legacyPlaceChoices("Ilfov", "Chiajna")];
    await run({ context: { userId: "agent" }, data: { places, offset: 24 } });
    expect(mocks.rpc).toHaveBeenCalledWith("search_properties_places", { _choices: places }, { count: "exact" });
    expect(mocks.range).toHaveBeenCalledWith(24, 47);
    expect(mocks.eq).toHaveBeenCalledWith("properties", "collaboration", true);
  });
});