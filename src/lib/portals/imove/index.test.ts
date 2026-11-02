/** Indexul iMove și tokenul hbmv_ în feedul iMove. Totul simulat; nicio cerere la iMove. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "test-imove-index-key-independent-0123";
process.env["IMOVE_INDEX_KEY"] = KEY;
process.env["LOCUIT_INDEX_KEY"] = "test-locuit-index-key-independent";
const ORG_A = "04041622-b3d2-4cbe-a2aa-000000000001";
const ORG_B = "0b0b0b0b-0b00-004a-00a8-000000000002";
const LEGACY = "imove-issued-legacy-key-abc";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const imoveIndexed = new Map<string, "active" | "grace">();
const built: string[] = [];

function query(table: string) {
  const filters: [string, unknown][] = [];
  const rows = () => (db[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
  const api: Record<string, unknown> = {
    select: () => api, eq: (c: string, v: unknown) => (filters.push([c, v]), api), in: () => api, is: () => api,
    not: () => api, order: () => api, limit: () => api, range: () => api, update: () => api, insert: () => api, upsert: () => api,
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
  };
  return api;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => query(t) } }));
vi.mock("@/lib/portals/crypto.server", () => ({ decryptPortalCredential: (v: string) => v }));
vi.mock("@/lib/portals/clickimob/index-feed.server", async () => {
  const { properstarEntityId } = await import("@/lib/portals/properstar/mapper");
  const list = (portal: string) => (portal === "imove" ? [...imoveIndexed.entries()] : []).map(([org, status]) => ({ id: properstarEntityId("hb", org), status }));
  return { listClickimobIndexedAgencies: async () => [], listPortalIndexedAgencies: async (_n: Date, p: string) => list(p) };
});
vi.mock("@/lib/portals/imove/feed.server", async (orig) => ({
  ...(await orig<typeof import("./feed.server")>()),
  buildImoveFeed: async (input: { organizationId: string; page: number; perPage: number }) => {
    built.push(input.organizationId);
    return { listings: [{ id: `l-${input.organizationId}` }], total: 1, page: input.page, perPage: input.perPage, selected: 1, excluded: [], warnings: [] };
  },
}));

const { clickimobFeedToken } = await import("@/lib/portals/clickimob/index-feed");
const { properstarEntityId } = await import("@/lib/portals/properstar/mapper");
const { Route } = await import("@/routes/api/public/portal/v1/imove.feed");
const idx = await vi.importActual<typeof import("@/lib/portals/clickimob/index-feed.server")>("@/lib/portals/clickimob/index-feed.server");

const get = (token: string) =>
  (Route.options.server!.handlers as { GET: (c: { request: Request }) => Promise<Response> }).GET({
    request: new Request(`https://crm.habitoo.ro/api/public/portal/v1/imove/feed?token=${encodeURIComponent(token)}`),
  });
const tokenFor = (org: string, portal: "imove" | "locuit" = "imove", key = KEY) => clickimobFeedToken(properstarEntityId("hb", org), key, portal);

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  imoveIndexed.clear();
  built.length = 0;
  db["organizations"] = [{ id: ORG_A }, { id: ORG_B }];
  db["portal_connections"] = [{ id: "c1", organization_id: ORG_B, portal: "imove", portal_credentials_encrypted: LEGACY }];
});

describe("indexul iMove", () => {
  const org = (id: string) => ({ id, status: "active", archived_at: null, name: "A", legal_name: null, cui: null, email: null, phone: null, city: null, logo_url: null, material_address: null, material_email: null, material_phone: null, material_website: null, updated_at: "2026-09-20T10:00:00Z" });
  const NOW = new Date("2026-10-01T09:00:00Z");

  it("conține doar agențiile eligibile, cu feed.base_url spre feedul iMove și token hbmv_", async () => {
    const src = { orgs: [org(ORG_A), org(ORG_B)], connections: [{ organization_id: ORG_A, activated: true, updated_at: null }, { organization_id: ORG_B, activated: true, updated_at: null }], selectedOrgs: [ORG_A], states: [] };
    const deps = { indexKey: () => KEY, listAgencies: async () => idx.selectClickimobAgencies(src, NOW).agencies, log: vi.fn(async () => {}), rateLimited: () => false };
    expect((await idx.handlePortalIndex(new Request("https://crm.habitoo.ro/x"), "wrong.json", "imove", deps, NOW)).status).toBe(401);
    const res = await idx.handlePortalIndex(new Request("https://crm.habitoo.ro/api/public/feed/imove/index/k.json"), `${KEY}.json`, "imove", deps, NOW);
    const body = await res.json();
    expect(body.version).toBe("habitoo-imove-index/1.0");
    expect(body.agencies).toHaveLength(1);
    expect(body.agencies[0].feed.base_url).toMatch(/\/api\/public\/portal\/v1\/imove\/feed$/);
    expect(body.agencies[0].feed.token.startsWith("hbmv_")).toBe(true);
  });

  it("grație 7 zile, apoi dispare", () => {
    const base = { orgs: [org(ORG_A)], selectedOrgs: [ORG_A] };
    const first = idx.selectClickimobAgencies({ ...base, connections: [{ organization_id: ORG_A, activated: true, updated_at: null }], states: [] }, NOW);
    const offAt = new Date(NOW.getTime() + 86_400_000);
    const off = { ...base, connections: [{ organization_id: ORG_A, activated: false, updated_at: offAt.toISOString() }], states: [first.changes[0]!] };
    const grace = idx.selectClickimobAgencies(off, new Date(offAt.getTime() + 3 * 86_400_000));
    expect(grace.agencies[0]?.status).toBe("grace");
    expect(idx.selectClickimobAgencies({ ...off, states: [grace.changes[0]!] }, new Date(offAt.getTime() + 8 * 86_400_000)).agencies).toHaveLength(0);
  });
});

describe("feedul iMove cu tokenul din index", () => {
  it("token hbmv_ valid → feedul agenției lui", async () => {
    imoveIndexed.set(ORG_A, "active");
    const res = await get(tokenFor(ORG_A));
    expect(res.status).toBe(200);
    expect(built).toEqual([ORG_A]);
  });
  it("token modificat, al altui portal sau cu altă cheie → 401", async () => {
    imoveIndexed.set(ORG_A, "active");
    expect((await get(tokenFor(ORG_A) + "0")).status).toBe(401);
    expect((await get(tokenFor(ORG_A, "locuit", "test-locuit-index-key-independent"))).status).toBe(401);
    expect((await get(tokenFor(ORG_A, "imove", "other-key"))).status).toBe(401);
    expect(built).toEqual([]);
  });
  it("agenție în grație → feed gol", async () => {
    imoveIndexed.set(ORG_A, "grace");
    const res = await get(tokenFor(ORG_A));
    expect(res.status).toBe(200);
    expect(built).toEqual([]);
  });
  it("cheia veche emisă de iMove funcționează în continuare", async () => {
    const res = await get(LEGACY);
    expect(res.status).toBe(200);
    expect(built).toEqual([ORG_B]);
  });
});
