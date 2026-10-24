import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeRepository } from "@/lib/market/__tests__/fake-repository";

const mocks = vi.hoisted(() => ({ repository: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => ({ options }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/lib/market/repository.server", () => ({ createMarketRepository: mocks.repository }));
import { Route } from "./upsert";

const validListing = {
  source: "storia", external_id: "valid", deal_type: "lease", property_type: "apartment",
  price: 1500, currency: "EUR", surface_built: 50, rooms: 2, city: "București",
  county: "București", sector: "Sector 3", neighborhood: "Titan", publisher_type: "particular",
};
const missingSurface = { ...validListing, external_id: "missing-surface", surface_built: null };

async function post(listings: unknown[]) {
  const route = Route as unknown as { options: { server: { handlers: { POST: (input: { request: Request }) => Promise<Response> } } } };
  return route.options.server.handlers.POST({ request: new Request("https://example.test/api/public/market-listings/upsert", {
    method: "POST", headers: { "Content-Type": "application/json", "x-scraper-secret": "test-only-secret" },
    body: JSON.stringify({ listings }),
  }) });
}

describe("market upsert HTTP outcomes with the real validation and ingestion pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("HBSYNC_SECRET", "test-only-secret");
    vi.stubEnv("SCRAPER_SECRET", "");
    mocks.repository.mockReturnValue(createFakeRepository().repo);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.from.mockReturnValue({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "test-run" }, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns 200 and success true for 49 imported and 1 rejected, preserving its error", async () => {
    const rows = Array.from({ length: 49 }, (_, i) => ({ ...validListing, external_id: `valid-${i}` }));
    const response = await post([...rows, missingSurface]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, received: 50, imported: 49, rejected: 1,
      errors: [{ reference: "missing-surface", message: "Lipsește suprafața." }] });
  });

  it("returns 422 and success false when no listing is imported", async () => {
    const response = await post([missingSurface]);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ success: false, imported: 0, rejected: 1,
      errors: [{ reference: "missing-surface", message: "Lipsește suprafața." }] });
    expect(mocks.repository).not.toHaveBeenCalled();
  });

  it("returns 200 for a fully valid batch", async () => {
    const response = await post([validListing]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, received: 1, imported: 1, rejected: 0, errors: [] });
  });
});