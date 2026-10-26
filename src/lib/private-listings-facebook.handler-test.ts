import { afterEach, describe, expect, it, vi } from "vitest";
import { interleaveNewest, PRIVATE_LISTINGS_SOURCE_CYCLE } from "./private-listings";
import { hbsyncMarketListingSchema } from "./market/hbsync";
import { MARKET_SOURCES } from "./market/sources";

const mocks = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => ({ options }) }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (handler: unknown) => handler };
  return builder;
} }));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from, storage: { from: () => ({ upload: mocks.upload }) } } }));
import { Route } from "@/routes/api/public/listings/upsert";
import { getOwnerListings, privateListingsFiltersSchema } from "./listings.functions";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Facebook private listings (no real database writes)", () => {
  it("accepts Facebook phone and ordered photos through POST while Storia phone stays null", async () => {
    vi.stubEnv("HBSYNC_SECRET", "test-only-secret");
    vi.stubEnv("SCRAPER_SECRET", "");
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: [] }) }), upsert });
    mocks.upload.mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })));
    const route = Route as unknown as { options: { server: { handlers: { POST: (input: { request: Request }) => Promise<Response> } } } };
    const response = await route.options.server.handlers.POST({ request: new Request("https://example.test/api/public/listings/upsert", {
      method: "POST", headers: { "Content-Type": "application/json", "x-scraper-secret": "test-only-secret" },
      body: JSON.stringify({ listings: [
        { source: "facebook", external_id: "fb1", phone: "0744555666", is_owner: true, url: "https://www.facebook.com/groups/123/posts/456/", images: ["https://example.test/1.jpg", "https://example.test/2.jpg"] },
        { source: "storia", external_id: "s1", phone: "0744555666", is_owner: true },
      ] }),
    }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, inserted: 2 });
    const rows = upsert.mock.calls[0]?.[0] as { source: string; phone: string | null; images?: string[] }[];
    expect(rows[0]).toMatchObject({ source: "facebook", phone: "0744555666" });
    expect(rows[0]?.images).toHaveLength(2);
    expect(mocks.upload.mock.calls.map(call => call[0])).toEqual([expect.stringMatching(/^fb1\/0-/), expect.stringMatching(/^fb1\/1-/)]);
    expect(rows[1]).toMatchObject({ source: "storia", phone: null });
  });

  it("filters Facebook before counting and pagination", async () => {
    const rows = ["facebook", "storia", "anuntul"].map((source, index) => ({ id: String(index), source, is_owner: true, phone: null, first_seen_at: "2026-10-26T06:03:00Z" }));
    let filtered = rows;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filtered = filtered.filter(row => row[column as keyof typeof row] === value); return query; },
      order: () => query,
      range: async () => ({ data: filtered, count: filtered.length, error: null }),
      in: async (_column: string, ids: string[]) => ({ data: filtered.filter(row => ids.includes(row.id)), error: null }),
    };
    const handler = getOwnerListings as unknown as (input: unknown) => Promise<{ items: { source: string }[]; total: number }>;
    const result = await handler({ data: privateListingsFiltersSchema.parse({ source: "facebook" }), context: { supabase: { from: () => query } } });
    expect(result.total).toBe(1);
    expect(result.items.map(row => row.source)).toEqual(["facebook"]);
  });

  it("interleaves Facebook at the end of the existing source cycle", () => {
    expect(PRIVATE_LISTINGS_SOURCE_CYCLE).toEqual(["storia", "romimo", "olx", "imoradar", "imobiliare", "anuntul", "facebook"]);
    const rows = ["facebook", "anuntul", "storia"].map(source => ({ id: source, source, first_seen_at: "2026-10-26T06:03:00Z" }));
    expect(interleaveNewest(rows).map(row => row.source)).toEqual(["storia", "anuntul", "facebook"]);
  });

  it("does not add Facebook to the ACP ingestion contract or source registry", () => {
    const listing = { source: "facebook", external_id: "fb1", deal_type: "sale", property_type: "apartment", price: 100000, currency: "EUR", surface_built: 50, city: "București" };
    expect(hbsyncMarketListingSchema.safeParse({ ...listing, source: "storia" }).success).toBe(true);
    expect(hbsyncMarketListingSchema.safeParse(listing).success).toBe(false);
    expect(MARKET_SOURCES.some(source => source.id === "facebook")).toBe(false);
  });
});