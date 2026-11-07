import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createDynamicFeedPortalCore, loadDynamicFeedPortals } from "@/lib/dynamic-feed-portals.server";
import { chooseFeedPrefix, dynamicPortalDefinition } from "@/lib/dynamic-feed-portals";
import { authorizeIndexKey, hashIndexKey } from "./index-keys.server";
import { handlePortalIndex, listPortalIndexedAgencies } from "@/lib/portals/clickimob/index-feed.server";
import { authenticateFeedRequest } from "./auth.server";
import { handleSiteContact } from "./contacts.server";
import { withFeedDefinitions } from "@/lib/feed-registry-scope.server";
import { getPortalDefinition, STATIC_PORTALS } from "@/lib/portals/registry";
import { selectRepublishPairs } from "@/lib/portals/republish";
import { publicPortalCount } from "@/lib/portals/integration-pages";
import { configurablePortals } from "@/lib/portals/registry";
import { selectedPropertyIdsForPortal } from "./selection.server";
import { buildBazarulKyeroFeed } from "@/lib/portals/bazaruldecase/feed.server";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let failTable = "";
const org = "11111111-1111-4111-8111-111111111111";
const prop = "22222222-2222-4222-8222-222222222222";
const agent = "33333333-3333-4333-8333-333333333333";
function query(table: string) {
  const filters: [string, string, unknown][] = [];
  let inserted: Row | null = null;
  let range: [number, number] | null = null;
  const rows = () => (db[table] ?? []).filter(r => filters.every(([op, col, value]) => op === "eq" ? r[col] === value : op === "in" ? (value as unknown[]).includes(r[col]) : op === "is" ? (r[col] ?? null) === value : true));
  const result = () => ({ data: inserted ? [inserted] : range ? rows().slice(range[0], range[1] + 1) : rows(), error: table === failTable ? { message: "read failed" } : null });
  const q = {
    select: () => q, order: () => q, limit: () => q, not: () => q,
    eq: (c: string, v: unknown) => { filters.push(["eq", c, v]); return q; },
    in: (c: string, v: unknown) => { filters.push(["in", c, v]); return q; },
    is: (c: string, v: unknown) => { filters.push(["is", c, v]); return q; },
    range: (from: number, to: number) => { range = [from, to]; return q; },
    insert: (row: Row) => { inserted = { id: prop, ...row }; (db[table] ??= []).push(inserted); return q; },
    upsert: (raw: Row | Row[]) => { for (const row of Array.isArray(raw) ? raw : [raw]) (db[table] ??= []).push(row); return q; },
    update: (row: Row) => { for (const item of rows()) Object.assign(item, row); return q; },
    maybeSingle: async () => ({ data: inserted ?? rows()[0] ?? null, error: result().error }),
    single: async () => ({ data: inserted ?? rows()[0] ?? null, error: result().error }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return q;
}
const admin = { from: query, rpc: async () => ({ error: null }) };
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => query(table), rpc: async () => ({ error: null }) } }));
const caller = { rpc: async (_fn: string, args: Row) => {
  const prefix = (args._prefixes as string[]).find(p => !(db.dynamic_feed_portals ?? []).some(r => r.key_prefix === p));
  if (!prefix) return { data: null, error: { message: "no prefix" } };
  (db.dynamic_feed_portals ??= []).push({ slug: args._slug, display_name: args._name, key_prefix: prefix, website: args._website, logo_path: args._logo, xml_enabled: args._xml, active: true, show_public: args._public });
  (db.portal_index_keys ??= []).push({ id: prop, key_type: "index", portal: args._slug, prefix, last4: args._last4, key_hash: JSON.parse(args._key_hash as string)[prefix], source: "managed", status: "active", created_at: "2026-11-07", created_by: agent, last_used_at: null });
  return { data: prefix, error: null };
} };
async function create() { return createDynamicFeedPortalCore(caller, { slug: "exempluimob", display_name: "ExempluImob.ro", website: "https://example.org", xml_enabled: true }); }
const request = () => new Request("http://localhost:8080/api/public/feed/exempluimob/index/test");
beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key]; failTable = "";
  db.organizations = [{ id: org, name: "Agenție fictivă", status: "active", archived_at: null, updated_at: "2026-11-07T00:00:00Z" }];
  db.portal_connections = [{ organization_id: org, portal: "exempluimob", activated: true, updated_at: "2026-11-07T00:00:00Z" }];
  db.portal_publications = [{ organization_id: org, portal_key: "exempluimob", enabled: true, property_id: prop }];
  db.properties = [{ id: prop, organization_id: org, assigned_to: agent, title: "Apartament fictiv" }];
});
describe("K2 dynamic feed portals", () => {
  it("creates a portal and first hash atomically; its key opens a 200 index including the activated agency", async () => {
    const generated = await create();
    expect(generated.key).toMatch(/^hb[a-z]{2}_[a-f0-9]{64}$/);
    expect(db.portal_index_keys[0]?.key_hash).toBe(hashIndexKey(generated.key));
    expect(JSON.stringify(db)).not.toContain(generated.key);
    const response = await handlePortalIndex(request(), generated.key, "exempluimob", {
      indexKey: () => undefined, authorize: authorizeIndexKey, listAgencies: now => listPortalIndexedAgencies(now, "exempluimob"), log: async () => {}, rateLimited: () => false,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.agencies).toHaveLength(1);
    expect(body.agencies[0].feed.base_url).toBe("http://localhost:8080/api/public/sites/v1");
    expect(body.agencies[0].kyero_xml_url).toContain("/exempluimob/feed.xml?token=");
    const auth = await authenticateFeedRequest(new Request("http://localhost:8080/api/public/sites/v1/contacts", { headers: { authorization: `Bearer ${body.agencies[0].feed.token}` } }));
    expect(auth.ok).toBe(true);
    if (!auth.ok) throw new Error("Expected portal authentication");
    expect(auth.portal).toBe("exempluimob");
    expect(auth.scopes).toEqual(["feed:read", "agents:read", "leads:write"]);
    const contact = await handleSiteContact(admin as never, auth, { nume: "Client fictiv", telefon: "0700000000", id: prop });
    expect(contact.status).toBe(201);
    expect(db.leads[0]?.source).toBe("ExempluImob.ro");
    expect(db.leads[0]?.assigned_to).toBe(agent);
  });
  it("disabled portal returns 401 without deleting its key or catalog row", async () => {
    const generated = await create(); db.dynamic_feed_portals[0].active = false;
    expect((await handlePortalIndex(request(), generated.key, "exempluimob")).status).toBe(401);
    expect(db.portal_index_keys).toHaveLength(1); expect(db.dynamic_feed_portals).toHaveLength(1);
    withFeedDefinitions((db.dynamic_feed_portals as never[]).map(dynamicPortalDefinition), () => {
      expect(configurablePortals().some(p => p.id === "exempluimob")).toBe(false);
    });
  });
  it("rejects forged signatures, another portal's XML token and agency tokens after disabling", async () => {
    const generated = await create();
    const response = await handlePortalIndex(request(), generated.key, "exempluimob");
    const body = await response.json();
    const token = body.agencies[0].feed.token as string;
    const forged = token.slice(0, token.lastIndexOf(".") + 1) + "0".repeat(64);
    const auth = await authenticateFeedRequest(new Request("http://localhost:8080/", { headers: { authorization: `Bearer ${forged}` } }));
    expect(auth.ok).toBe(false); expect(!auth.ok && auth.status).toBe(401);
    const wrongXml = await authenticateFeedRequest(new Request("http://localhost:8080/", { headers: { authorization: `Bearer ${token}` } }), { indexPortal: "locuit" });
    expect(wrongXml.ok).toBe(false);
    db.dynamic_feed_portals[0].active = false;
    const disabled = await authenticateFeedRequest(new Request("http://localhost:8080/", { headers: { authorization: `Bearer ${token}` } }));
    expect(disabled.ok).toBe(false);
  });
  it("dynamic JSON selection and Kyero both exclude an offer whose agent has no phone", async () => {
    await create(); db.profiles = [{ id: agent, organization_id: org, full_name: "Agent fictiv", phone: null }];
    expect(await selectedPropertyIdsForPortal(org, "exempluimob")).toEqual([]);
    const xml = await buildBazarulKyeroFeed({ organizationId: org, requestUrl: request().url, portal: "exempluimob" });
    expect(xml.offers).toBe(0); expect(xml.xml).not.toContain(`<id>${prop}</id>`);
  });
  it("rejects every slug already defined in code", async () => {
    for (const portal of STATIC_PORTALS) await expect(createDynamicFeedPortalCore(caller, { slug: portal.id, display_name: "Portal fictiv", website: "https://example.org" })).rejects.toThrow();
    expect(db.dynamic_feed_portals ?? []).toHaveLength(0);
  });
  it("prefix generation is unique and static definitions have priority", async () => {
    expect(chooseFeedPrefix("exempluimob", [])).toBe("hbex_");
    expect(chooseFeedPrefix("exempluimob", ["hbex_"])).not.toBe("hbex_");
    await create(); const defs = (await loadDynamicFeedPortals()).map(dynamicPortalDefinition);
    await withFeedDefinitions([...defs, { ...defs[0], id: "clickimob", display_name: "Conflict" }], async () => {
      expect(getPortalDefinition("clickimob")?.display_name).toBe("ClickImob");
      expect(getPortalDefinition("exempluimob")?.activation).toBe("approval");
      const selected = selectRepublishPairs({ scope: "all", userId: agent, portalFilter: null, activePortals: new Set(["exempluimob"]), properties: [{ id: prop, status: "active", assigned_to: agent, deleted_at: null }], listings: [], publications: [{ property_id: prop, portal_key: "exempluimob", enabled: true }] });
      expect(selected.autoPull).toEqual([{ propertyId: prop, portalId: "exempluimob" }]);
      expect(selected.queued).toEqual([]);
    });
  });
  it("counts only publicly visible active dynamic portals", async () => {
    await create(); const def = dynamicPortalDefinition((await loadDynamicFeedPortals())[0]);
    const base = publicPortalCount([]);
    expect(publicPortalCount([def])).toBe(base);
    expect(publicPortalCount([{ ...def, show_public: true }])).toBe(base + 1);
    expect(publicPortalCount([{ ...def, show_public: true, status: "disabled" }])).toBe(base);
  });
  it("an agency read failure returns 503, never a partial 200", async () => {
    const generated = await create(); failTable = "organizations";
    const response = await handlePortalIndex(request(), generated.key, "exempluimob");
    expect(response.status).toBe(503); expect(response.headers.get("Retry-After")).toBe("300");
  });
  it("database RPC enforces atomic portal/key creation, uniqueness and SuperAdmin writes", async () => {
    const sql = new PGlite();
    await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${agent}'::uuid $$; CREATE FUNCTION public.is_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.admin',true)='true' $$; CREATE TABLE public.audit_logs(actor_id uuid,action text,entity text,new_values jsonb); CREATE TABLE public.portal_index_keys(portal text CONSTRAINT portal_index_keys_portal_check CHECK(portal='clickimob'),prefix text,last4 text,key_hash text CHECK(key_hash ~ '^[a-f0-9]{64}$'),created_by uuid);`);
    await sql.exec(readFileSync("drizzle/migrations/0247_dynamic_feed_portals.sql", "utf8"));
    await sql.exec(readFileSync("drizzle/migrations/0248_dynamic_feed_portal_atomic_digest.sql", "utf8"));
    const createSql = `SELECT public.create_dynamic_feed_portal('exempluimob','ExempluImob.ro','https://example.org',true,false,null,ARRAY['hbex_','hbey_'],ARRAY['clickimob'],ARRAY['hbci_'], $1, 'abcd')`;
    await sql.exec("SET test.admin='false'");
    await expect(sql.query(createSql, [JSON.stringify({ hbex_: "a".repeat(64), hbey_: "b".repeat(64) })])).rejects.toThrow("Acces refuzat");
    await sql.exec("SET test.admin='true'");
    const result = await sql.query(createSql, [JSON.stringify({ hbex_: "a".repeat(64), hbey_: "b".repeat(64) })]);
    expect(result.rows).toEqual([{ create_dynamic_feed_portal: "hbex_" }]);
    expect((await sql.query("SELECT portal,key_hash FROM public.portal_index_keys")).rows).toEqual([{ portal: "exempluimob", key_hash: "a".repeat(64) }]);
    await expect(sql.query(createSql, [JSON.stringify({ hbex_: "a".repeat(64) })])).rejects.toThrow("Identificatorul există");
    await expect(sql.exec("INSERT INTO public.dynamic_feed_portals(slug,display_name,key_prefix,website) VALUES('clickimob','Conflict','hbzz_','https://example.org')")).rejects.toThrow("Reserved");
    await sql.close();
  });
});