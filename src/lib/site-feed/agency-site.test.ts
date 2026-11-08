import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { hashFeedToken } from "./auth.server";
import { feedSelectionPortal, normalizeAgencySiteUrl } from "./agency-site";
import { visibleSettingsTabs } from "@/lib/settings-tabs";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

// ---------------- In-memory admin client ----------------
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
function q(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let pending: { kind: "update"; row: Row } | null = null;
  let range: [number, number] | null = null;
  let lim: number | null = null;
  const match = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const api: Record<string, unknown> = {};
  const self = () => api;
  api["select"] = self; api["order"] = self;
  api["limit"] = (n: number) => ((lim = n), api);
  api["range"] = (f: number, t: number) => ((range = [f, t]), api);
  api["eq"] = (c: string, v: unknown) => (filters.push((r) => r[c] === v), api);
  api["neq"] = (c: string, v: unknown) => (filters.push((r) => r[c] !== v), api);
  api["is"] = (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), api);
  api["in"] = (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), api);
  api["maybeSingle"] = async () => ({ data: match()[0] ?? null, error: null });
  api["update"] = (row: Row) => ((pending = { kind: "update", row }), api);
  api["insert"] = async (rows: Row | Row[]) => {
    for (const row of Array.isArray(rows) ? rows : [rows]) (tables[table] ??= []).push({ id: `id${Math.random()}`, ...row });
    return { error: null };
  };
  api["upsert"] = async (row: Row) => {
    const list = (tables[table] ??= []);
    const i = list.findIndex((r) => r["organization_id"] === row["organization_id"]);
    if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row);
    return { error: null };
  };
  api["then"] = (resolve: (v: unknown) => unknown) => {
    let rows = match();
    if (pending) for (const r of rows) Object.assign(r, pending.row);
    const count = rows.length;
    if (range) rows = rows.slice(range[0], range[1] + 1);
    if (lim !== null) rows = rows.slice(0, lim);
    return resolve({ data: rows, error: null, count });
  };
  return api;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => q(t) } }));
vi.mock("@/lib/dynamic-feed-portals.server", () => ({
  findDynamicIndexTokenPortal: async () => null,
  resolveIndexPortal: async () => null,
  loadDynamicFeedPortals: async () => [],
}));

const TOKEN_A = "hbt_aaaa0000.secret-a";
const TOKEN_B = "hbt_bbbb0000.secret-b";
const property = (id: string, org: string) => ({
  id, organization_id: org, publish_status: "published", status: "active", deleted_at: null, assigned_to: null,
  reference: id.slice(0, 4), updated_at: "2026-11-08T00:00:00Z", title: "Apartament", transaction_type: "sale",
});

function reset() {
  for (const k of Object.keys(tables)) delete tables[k];
  tables["site_feed_tokens"] = [
    { id: "ta", organization_id: A, token_prefix: "hbt_aaaa0000", token_hash: hashFeedToken(TOKEN_A), revoked_at: null, scope: "site", request_count: 0 },
    { id: "tb", organization_id: B, token_prefix: "hbt_bbbb0000", token_hash: hashFeedToken(TOKEN_B), revoked_at: null, scope: "site", request_count: 0 },
  ];
  tables["agency_site_portals"] = [
    { organization_id: A, active: true, display_name: "Agenția A", site_url: null, first_activated_at: "2026-11-01T00:00:00Z" },
    { organization_id: B, active: true, display_name: "Agenția B", site_url: null, first_activated_at: "2026-11-01T00:00:00Z" },
  ];
  tables["properties"] = [property(P1, A), property(P2, A)];
  tables["portal_publications"] = [
    { id: "pp1", organization_id: A, property_id: P1, portal_key: "agency_site", enabled: true },
    { id: "pp2", organization_id: A, property_id: P2, portal_key: "agency_site", enabled: false },
  ];
  for (const t of ["property_images", "profiles", "portal_listings", "audit_logs", "portal_operation_logs", "portal_publish_jobs", "portal_api_keys"]) tables[t] = [];
}
beforeEach(reset);

const req = (path: string, token: string) => new Request(`https://crm.habitoo.ro/api/public/sites/v1${path}`, { headers: { authorization: `Bearer ${token}` } });

describe("Site-ul agenției — autentificare", () => {
  it("cheia unui site activ citește feedul restrâns la bifele site-ului", async () => {
    const { authenticateFeedRequest } = await import("./auth.server");
    const auth = await authenticateFeedRequest(req("/properties", TOKEN_A));
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.organizationId).toBe(A);
      expect(auth.portal).toBeNull();
      expect(feedSelectionPortal(auth)).toBe("agency_site");
    }
  });
  it("site dezactivat → 401", async () => {
    tables["agency_site_portals"]![0]!["active"] = false;
    const { authenticateFeedRequest } = await import("./auth.server");
    const auth = await authenticateFeedRequest(req("/properties", TOKEN_A));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.status).toBe(401);
  });
  it("cheie revocată → 401", async () => {
    tables["site_feed_tokens"]![0]!["revoked_at"] = "2026-11-08T00:00:00Z";
    const { authenticateFeedRequest } = await import("./auth.server");
    const auth = await authenticateFeedRequest(req("/properties", TOKEN_A));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.status).toBe(401);
  });
});

describe("Site-ul agenției — feedul respectă bifa", () => {
  it("anunțul nebifat lipsește din /properties, cel bifat apare", async () => {
    const { authenticateFeedRequest } = await import("./auth.server");
    const { handlePropertiesList } = await import("./handlers.server");
    const auth = await authenticateFeedRequest(req("/properties", TOKEN_A));
    if (!auth.ok) throw new Error("auth");
    const out = await handlePropertiesList(req("/properties", TOKEN_A), auth);
    const body = await out.response.json() as { data: { id: string; portals?: string[] }[] };
    expect(out.response.status).toBe(200);
    expect(body.data.map((p) => p.id)).toEqual([P1]);
  });
  it("detaliul unui anunț nebifat → 404; bifat → 200", async () => {
    const { authenticateFeedRequest } = await import("./auth.server");
    const { handlePropertyDetail } = await import("./handlers.server");
    const auth = await authenticateFeedRequest(req(`/properties/${P2}`, TOKEN_A));
    if (!auth.ok) throw new Error("auth");
    expect((await handlePropertyDetail(req(`/properties/${P2}`, TOKEN_A), auth, P2)).response.status).toBe(404);
    expect((await handlePropertyDetail(req(`/properties/${P1}`, TOKEN_A), auth, P1)).response.status).toBe(200);
  });
  it("agenția B nu poate citi anunțurile agenției A cu cheia ei", async () => {
    const { authenticateFeedRequest } = await import("./auth.server");
    const { handlePropertyDetail } = await import("./handlers.server");
    const auth = await authenticateFeedRequest(req(`/properties/${P1}`, TOKEN_B));
    if (!auth.ok) throw new Error("auth");
    expect(auth.organizationId).toBe(B);
    expect((await handlePropertyDetail(req(`/properties/${P1}`, TOKEN_B), auth, P1)).response.status).toBe(404);
  });
});

describe("Site-ul agenției — bife și jurnal", () => {
  it("retragerea și bifarea se jurnalizează, fără joburi de publicare", async () => {
    const { setPropertyAgencySiteSelection } = await import("./agency-site.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as never;
    expect(await setPropertyAgencySiteSelection(admin, { organizationId: A, propertyId: P1, enabled: false, actorId: "agent" })).toBe(true);
    expect(await setPropertyAgencySiteSelection(admin, { organizationId: A, propertyId: P1, enabled: true, actorId: "agent" })).toBe(true);
    expect(tables["portal_operation_logs"]!.map((r) => [r["portal"], r["operation"]])).toEqual([["agency_site", "withdraw"], ["agency_site", "publish"]]);
    expect(tables["portal_publish_jobs"]).toEqual([]);
  });
  it("prima activare bifează toate anunțurile publicate", async () => {
    tables["agency_site_portals"] = [];
    tables["portal_publications"] = [];
    const { saveAgencySite } = await import("./agency-site.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out = await saveAgencySite(supabaseAdmin as never, { organizationId: A, actorId: "admin", siteUrl: null, displayName: null, active: true, agencyName: "Agenția A" });
    expect(out.selected).toBe(2);
    expect(out.site.display_name).toBe("Agenția A");
  });
  it("adresa site-ului acceptă doar https", () => {
    expect(normalizeAgencySiteUrl("https://agentia.ro/")).toBe("https://agentia.ro");
    expect(() => normalizeAgencySiteUrl("http://agentia.ro")).toThrow();
    expect(normalizeAgencySiteUrl("")).toBeNull();
  });
  it("agentul nu vede fila Portaluri din Setări; administratorul o vede", () => {
    expect(visibleSettingsTabs({ role: "agent", isAdmin: false })).not.toContain("portals");
    expect(visibleSettingsTabs({ role: "agency_admin", isAdmin: true })).toContain("portals");
  });
  it("rândul din fișa anunțului nu depinde de rolul de administrator", () => {
    const source = readFileSync("src/components/app/PropertyPortalsCard.tsx", "utf8");
    const row = source.slice(source.indexOf('id="portal-agency-site"'), source.indexOf('id="portal-agency-site"') + 200);
    expect(row).toContain("disabled={!editing || site.isLoading}");
    expect(row).not.toContain("canManage");
  });
});

// ---------------- Migrare (PGlite) ----------------
describe("Migrarea site-ului agenției", () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE organizations(id uuid PRIMARY KEY, name text);
      CREATE TABLE site_feed_tokens(id uuid DEFAULT gen_random_uuid(), organization_id uuid, scope text, revoked_at timestamptz);
      CREATE TABLE properties(id uuid PRIMARY KEY, organization_id uuid, publish_status text, deleted_at timestamptz, created_by uuid);
      CREATE TABLE portal_publications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, property_id uuid, portal_key text, enabled boolean, status text, created_by uuid);
      CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
      CREATE FUNCTION current_org() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.org', true), '')::uuid $$;
      CREATE FUNCTION is_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
      INSERT INTO organizations VALUES ('${A}', 'Agenția A'), ('${B}', 'Agenția B');
      INSERT INTO site_feed_tokens(organization_id, scope) VALUES ('${A}', 'site');
      INSERT INTO properties VALUES ('${P1}', '${A}', 'published', null, null), ('${P2}', '${A}', 'draft', null, null),
        ('33333333-3333-4333-8333-333333333333', '${B}', 'published', null, null);`);
    await pg.exec(readFileSync("drizzle/migrations/0261_agency_site_portal.sql", "utf8").replaceAll("--> statement-breakpoint", ""));
  });
  afterAll(async () => { await pg.close(); });

  it("bifează toate anunțurile publicate ale agențiilor care aveau cheie de site", async () => {
    const rows = await pg.query<{ property_id: string; enabled: boolean }>("SELECT property_id, enabled FROM portal_publications WHERE portal_key = 'agency_site' ORDER BY property_id");
    expect(rows.rows).toEqual([{ property_id: P1, enabled: true }]);
    const sites = await pg.query<{ organization_id: string; active: boolean; display_name: string }>("SELECT organization_id, active, display_name FROM agency_site_portals");
    expect(sites.rows).toEqual([{ organization_id: A, active: true, display_name: "Agenția A" }]);
  });
  it("anunț nou → bifat implicit pentru site-ul activ; nu la agenția fără site", async () => {
    await pg.exec(`INSERT INTO properties VALUES ('44444444-4444-4444-8444-444444444444', '${A}', 'draft', null, null),
      ('55555555-5555-4555-8555-555555555555', '${B}', 'draft', null, null)`);
    const rows = await pg.query<{ property_id: string }>("SELECT property_id FROM portal_publications WHERE portal_key = 'agency_site' AND enabled ORDER BY property_id");
    expect(rows.rows.map((r) => r.property_id)).toEqual([P1, "44444444-4444-4444-8444-444444444444"]);
  });
  it("agenția B nu vede site-ul agenției A", async () => {
    await pg.exec(`SET ROLE authenticated; SELECT set_config('app.org', '${B}', false);`);
    const seen = await pg.query("SELECT * FROM agency_site_portals");
    await pg.exec(`SELECT set_config('app.org', '${A}', false);`);
    const own = await pg.query("SELECT * FROM agency_site_portals");
    await pg.exec("RESET ROLE");
    expect(seen.rows).toHaveLength(0);
    expect(own.rows).toHaveLength(1);
  });
});
