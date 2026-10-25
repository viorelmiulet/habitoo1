import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => ({ options }) }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = { middleware: () => builder, inputValidator: () => builder, handler: (handler: unknown) => handler };
    return builder;
  },
}));
vi.mock("@/lib/org-access", () => ({ requireActiveOrgAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
import { Route } from "@/routes/api/public/listings/upsert";
import { getOwnerListings, privateListingsFiltersSchema } from "./listings.functions";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Imoradar private listing endpoint and exact source filtering", () => {
  it("accepts imoradar alongside historical sources through the POST handler", async () => {
    vi.stubEnv("HBSYNC_SECRET", "test-only-secret");
    vi.stubEnv("SCRAPER_SECRET", "");
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: [] }) }), upsert });
    const url = "https://www.imoradar24.ro/link-extern/123?source=homezz";
    const listings = ["imoradar", "imobiliare", "romimo", "olx", "storia"].map(source => ({
      source, external_id: `${source}-1`, url, is_owner: true,
    }));
    const route = Route as unknown as { options: { server: { handlers: { POST: (input: { request: Request }) => Promise<Response> } } } };
    const response = await route.options.server.handlers.POST({ request: new Request("https://example.test/api/public/listings/upsert", {
      method: "POST", headers: { "Content-Type": "application/json", "x-scraper-secret": "test-only-secret" },
      body: JSON.stringify({ listings }),
    }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, inserted: 5 });
    expect(upsert.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "imoradar", external_id: "imoradar-1", url, phone: null }),
    ]));
    expect(upsert.mock.calls[0]?.[0].map((row: { source: string }) => row.source)).toEqual(listings.map(row => row.source));
  });

  it("applies the exact imoradar source before counting and pagination, excluding other sources", async () => {
    const rows = ["imoradar", "imobiliare", "olx"].map((source, index) => ({ id: String(index), source, is_owner: true }));
    let filtered = rows;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filtered = filtered.filter(row => row[column as keyof typeof row] === value);
        return query;
      },
      order: () => query,
      range: async () => ({ data: filtered, count: filtered.length, error: null }),
      in: async (_column: string, values: string[]) => ({
        data: filtered.filter((row) => values.includes(row.id)),
        error: null,
      }),
    };
    const handler = getOwnerListings as unknown as (input: unknown) => Promise<{ items: { source: string }[]; total: number }>;
    const result = await handler({ data: privateListingsFiltersSchema.parse({ source: "imoradar" }),
      context: { supabase: { from: () => query } } });
    expect(result.total).toBe(1);
    expect(result.items.map(row => row.source)).toEqual(["imoradar"]);
  });
});