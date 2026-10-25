import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeRepository } from "@/lib/market/__tests__/fake-repository";
import { MARKET_SOURCES, marketSourceName } from "@/lib/market/sources";

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

function beginPost(listings: unknown[]) {
  const route = Route as unknown as { options: { server: { handlers: { POST: (input: { request: Request }) => Promise<Response> } } } };
  return route.options.server.handlers.POST({ request: new Request("https://example.test/api/public/market-listings/upsert", {
    method: "POST", headers: { "Content-Type": "application/json", "x-scraper-secret": "test-only-secret" },
    body: JSON.stringify({ listings }),
  }) });
}

async function post(listings: unknown[]) {
  const response = beginPost(listings);
  await vi.runAllTimersAsync();
  return response;
}

describe("market upsert HTTP outcomes with the real validation and ingestion pipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

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

  it("imports imobiliare, keeps its identity on reimport and labels it Imobiliare.ro in source choices", async () => {
    const { repo, store } = createFakeRepository();
    mocks.repository.mockReturnValue(repo);
    const row = { ...validListing, source: "imobiliare", external_id: "imobiliare-1" };
    const response = await post([row]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, imported: 1, rejected: 0, errors: [] });
    expect(store.listings[0]).toMatchObject({ source: "imobiliare", sourceListingId: "imobiliare-1" });
    expect(marketSourceName(store.listings[0]?.source ?? "")).toBe("Imobiliare.ro");
    expect(MARKET_SOURCES.find(source => source.id === "imobiliare")?.name).toBe("Imobiliare.ro");
    const updated = await post([{ ...row, price: 1600 }]);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ imported: 1, updated: 1 });
    expect(store.listings).toHaveLength(1);
    expect(store.listings[0]?.price).toBe(1600);
  });

  it("uses external_id for schema validation failures", async () => {
    const response = await post([{ ...validListing, source: "imobiliare", external_id: "invalid-1", price: "not-a-number" }]);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].reference).toBe("invalid-1");
    expect(body.imported).toBe(0);
  });

  it("imports imoradar alongside every existing source and preserves its external redirect URL", async () => {
    const { repo, store } = createFakeRepository();
    mocks.repository.mockReturnValue(repo);
    const url = "https://www.imoradar24.ro/link-extern/123?source=imobiliare.ro";
    const response = await post(["imoradar", "storia", "olx", "romimo", "imobiliare", "anuntul"].map(source => ({
      ...validListing, source, external_id: `${source}-1`, url: source === "imoradar" ? url : undefined,
    })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, imported: 6, rejected: 0, errors: [] });
    expect(store.listings.find(row => row.source === "imoradar")).toMatchObject({ sourceListingId: "imoradar-1", url });
    expect(store.listings.find(row => row.source === "anuntul")).toMatchObject({ sourceListingId: "anuntul-1" });
  });

  it("uses invalid when external_id is absent", async () => {
    const { external_id, ...row } = validListing;
    const response = await post([row]);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].reference).toBe("invalid");
  });

  it("reports each blocked Storia external_id while importing OLX with HTTP 200", async () => {
    mocks.rpc.mockImplementation(async (name, args) => ({ data: !(name === "market_sync_claim" && args._source === "storia"), error: null }));
    const response = await post([
      { ...validListing, external_id: "storia-1" },
      { ...validListing, external_id: "storia-2" },
      { ...validListing, source: "olx", external_id: "olx-1" },
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, imported: 1, errors: [
      { reference: "storia-1", message: "Un import pentru această sursă rulează deja. Reîncearcă lotul." },
      { reference: "storia-2", message: "Un import pentru această sursă rulează deja. Reîncearcă lotul." },
    ] });
    expect(mocks.rpc).not.toHaveBeenCalledWith("market_sync_release", expect.objectContaining({ _source: "storia" }));
  });

  it.each(["claim", "import"])("reports each Storia external_id on a %s exception and continues with OLX", async (stage) => {
    if (stage === "claim") {
      mocks.rpc.mockImplementation(async (name, args) => {
        if (name === "market_sync_claim" && args._source === "storia") throw new Error("claim failure");
        return { data: true, error: null };
      });
    } else {
      mocks.repository.mockImplementationOnce(() => { throw new Error("import failure"); });
    }
    const response = await post([
      { ...validListing, external_id: "storia-1" },
      { ...validListing, external_id: "storia-2" },
      { ...validListing, source: "olx", external_id: "olx-1" },
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, imported: 1, errors: [
      { reference: "storia-1", message: "Importul sursei a eșuat." },
      { reference: "storia-2", message: "Importul sursei a eșuat." },
    ] });
  });

  it("does not truncate failed external_ids beyond 200", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const response = await post(Array.from({ length: 500 }, (_, i) => ({ ...validListing, external_id: `storia-${i}` })));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.imported).toBe(0);
    expect(body.errors).toHaveLength(500);
    expect(body.errors.map((error: { reference: string }) => error.reference)).toEqual(Array.from({ length: 500 }, (_, i) => `storia-${i}`));
  });

  it("takes over a hbsync lock abandoned 3 minutes ago using 120 seconds, not the RPC default 900", async () => {
    const runningSince = Date.now() - 180_000;
    mocks.rpc.mockImplementation(async (name, args) => ({
      data: name !== "market_sync_claim" || runningSince < Date.now() - (args._stale_seconds ?? 900) * 1000,
      error: null,
    }));
    const response = await post([validListing]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ imported: 1, success: true, errors: [] });
    expect(mocks.rpc).toHaveBeenCalledWith("market_sync_claim", { _source: "storia", _stale_seconds: 120 });
  });

  it("waits in 2-second intervals for a simultaneous import of the same source to release its lock", async () => {
    let locked = false;
    mocks.rpc.mockImplementation(async (name) => {
      if (name === "market_sync_release") { locked = false; return { data: null, error: null }; }
      if (locked) return { data: false, error: null };
      locked = true;
      return { data: true, error: null };
    });
    let finishFirstInsert: (() => void) | undefined;
    const firstInsert = new Promise<void>(resolve => { finishFirstInsert = resolve; });
    mocks.from.mockReturnValueOnce({
      insert: () => ({ select: () => ({ single: async () => {
        await firstInsert;
        return { data: { id: "first-run" }, error: null };
      } }) }),
    });
    const first = beginPost([{ ...validListing, external_id: "first" }]);
    await vi.advanceTimersByTimeAsync(0);
    const second = beginPost([{ ...validListing, external_id: "second" }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "market_sync_claim")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "market_sync_claim")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "market_sync_claim")).toHaveLength(3);
    finishFirstInsert?.();
    expect((await first).status).toBe(200);
    await vi.advanceTimersByTimeAsync(2_000);
    const response = await second;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ imported: 1, success: true, errors: [] });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "market_sync_claim")).toHaveLength(4);
  });

  it("refuses an active lock only after 20 seconds with one error per external_id", async () => {
    const attempts: number[] = [];
    const start = Date.now();
    mocks.rpc.mockImplementation(async (name) => {
      if (name === "market_sync_claim") attempts.push(Date.now() - start);
      return { data: false, error: null };
    });
    let settled = false;
    const pending = beginPost([
      { ...validListing, external_id: "blocked-1" },
      { ...validListing, external_id: "blocked-2" },
    ]).then(response => { settled = true; return response; });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ imported: 0, success: false, errors: [
      { reference: "blocked-1", message: "Un import pentru această sursă rulează deja. Reîncearcă lotul." },
      { reference: "blocked-2", message: "Un import pentru această sursă rulează deja. Reîncearcă lotul." },
    ] });
    expect(attempts).toEqual([0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000]);
    expect(mocks.rpc).not.toHaveBeenCalledWith("market_sync_release", expect.anything());
    expect(mocks.repository).not.toHaveBeenCalled();
  });
});