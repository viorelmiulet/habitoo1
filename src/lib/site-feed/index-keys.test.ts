import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { authorizeIndexKey, generateIndexKey, hashIndexKey, safeIndexKey, verifyManagedAgencyToken, type IndexKeyRow } from "./index-keys.server";
import { clickimobFeedToken } from "@/lib/portals/clickimob/index-feed";
import { handlePortalIndex } from "@/lib/portals/clickimob/index-feed.server";

type StoredKeyRow = IndexKeyRow & { key_type: "index" | "api"; environment?: "live" | "test" };
const rows: StoredKeyRow[] = [];
let fail = false;
const writes: unknown[] = [];
function query() {
  const filters: [string, unknown][] = [];
  let inserted: StoredKeyRow | null = null;
  const q = {
    select: () => q, eq: (field: string, value: string) => { filters.push([field, value]); return q; },
    upsert: (value: Partial<StoredKeyRow>) => { inserted = { id: "legacy", key_type: "index", status: "active", last_used_at: null, created_at: new Date().toISOString(), created_by: null, ...value } as StoredKeyRow; rows.push(inserted); writes.push(value); return q; },
    maybeSingle: async () => ({ data: inserted, error: fail ? {} : null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows.filter(row => filters.every(([field, value]) => (row as Record<string, unknown>)[field] === value)), error: fail ? {} : null }).then(resolve),
  };
  return q;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => query(), rpc: async (_name: string, args: { _id: string }) => { const row = rows.find(r => r.id === args._id); if (row) row.last_used_at = new Date().toISOString(); return { error: null }; },
} }));
const legacy = "EXEMPLU-LEGACY-SECRET-FICTIV";
const req = new Request("https://www.habitoo.ro/index");
const index = (key: string, portal: "bazaruldecase" | "locuit" = "bazaruldecase") => handlePortalIndex(req, key, portal, {
  indexKey: () => undefined, authorize: authorizeIndexKey, listAgencies: async () => [], log: async () => {}, rateLimited: () => false,
});
beforeEach(() => { rows.length = 0; writes.length = 0; fail = false; process.env['BAZARULDECASE_INDEX_KEY'] = legacy; });
describe("managed portal index credentials", () => {
  it("accepts a managed key with 200 and rejects it with 401 after revocation", async () => {
    const generated = generateIndexKey("bazaruldecase");
    rows.push({ id: "managed", key_type: "index", portal: "bazaruldecase", source: "managed", status: "active", created_at: new Date().toISOString(), created_by: null, last_used_at: null, ...generated });
    expect((await index(generated.key)).status).toBe(200);
    rows[0].status = "revoked";
    expect((await index(generated.key)).status).toBe(401);
  });
  it("keeps the legacy secret and its WordPress XML token valid until explicit revocation", async () => {
    const token = clickimobFeedToken("hbEXEMPLE001", legacy, "bazaruldecase");
    expect((await index(legacy)).status).toBe(200);
    expect(await verifyManagedAgencyToken(token, "bazaruldecase")).toBe("hbEXEMPLE001");
    rows[0].status = "revoked";
    expect((await index(legacy)).status).toBe(401);
    expect(await verifyManagedAgencyToken(token, "bazaruldecase")).toBeNull();
    expect(JSON.stringify(writes)).not.toContain(legacy);
  });
  it("rejects another portal's key with 401", async () => {
    expect((await index(legacy, "locuit")).status).toBe(401);
  });
  it("rejects a valid live Partner API key on the index route with 401", async () => {
    const key = "hbpk_live_" + "a1".repeat(32);
    rows.push({ id: "api-live", key_type: "api", environment: "live", portal: "bazaruldecase", prefix: "hbpk_live_", last4: key.slice(-4), key_hash: hashIndexKey(key), source: "managed", status: "active", created_at: new Date().toISOString(), created_by: null, last_used_at: null });
    const generated = generateIndexKey("bazaruldecase");
    rows.push({ id: "index", key_type: "index", portal: "bazaruldecase", source: "managed", status: "active", created_at: new Date().toISOString(), created_by: null, last_used_at: null, ...generated });
    expect((await index(generated.key)).status).toBe(200);
    const request = new Request(`https://www.habitoo.ro/api/public/feed/bazaruldecase/index/${key}`);
    const listAgencies = vi.fn(async () => []);
    const response = await handlePortalIndex(request, key, "bazaruldecase", {
      indexKey: () => undefined, authorize: authorizeIndexKey, listAgencies, log: async () => {}, rateLimited: () => false,
    });
    expect(response.status).toBe(401);
    expect(listAgencies).not.toHaveBeenCalled();
    expect(rows[0].last_used_at).toBeNull();
  });
  it("new keys have at least 40 random characters and lists never expose plaintext or digest", async () => {
    const generated = generateIndexKey("bazaruldecase");
    expect(generated.key.slice(5).length).toBeGreaterThanOrEqual(40);
    expect(generated.key_hash).toBe(hashIndexKey(generated.key));
    const row = { id: "managed", portal: "bazaruldecase", source: "managed", status: "active", created_at: new Date().toISOString(), created_by: null, last_used_at: null, ...generated } as IndexKeyRow;
    const list = JSON.stringify(safeIndexKey(row));
    expect(list).not.toContain(generated.key);
    expect(list).not.toContain(generated.key_hash);
    expect(list).toContain(generated.last4);
  });
  it("managed agency tokens validate using stored hashes and are revoked with the key", async () => {
    const generated = generateIndexKey("bazaruldecase");
    rows.push({ id: "managed", key_type: "index", portal: "bazaruldecase", source: "managed", status: "active", created_at: new Date().toISOString(), created_by: null, last_used_at: null, ...generated });
    const token = clickimobFeedToken("hbEXEMPLE001", generated.key_hash, "bazaruldecase");
    expect(await verifyManagedAgencyToken(token, "bazaruldecase")).toBe("hbEXEMPLE001");
    expect(await verifyManagedAgencyToken(token, "locuit")).toBeNull();
    rows[0].status = "revoked";
    expect(await verifyManagedAgencyToken(token, "bazaruldecase")).toBeNull();
  });
  it("fails closed with 503 when lookup fails, even with the legacy secret", async () => {
    fail = true;
    expect((await index(legacy)).status).toBe(503);
  });
  it("database enforces superadmin access, redacted audit and five-minute atomic usage", async () => {
    const db = new PGlite();
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
      CREATE FUNCTION public.is_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.superadmin',true)='true' $$;
      CREATE TABLE public.audit_logs(actor_id uuid,action text,entity text,entity_id uuid,new_values jsonb);`);
    await db.exec(readFileSync(new URL("../../../drizzle/migrations/0246_portal_index_keys.sql", import.meta.url), "utf8"));
    const hash = hashIndexKey("EXEMPLU");
    await db.exec(`SET test.superadmin='true'; SET ROLE authenticated; INSERT INTO public.portal_index_keys(portal,prefix,last4,key_hash) VALUES('bazaruldecase','hbbc_','1234','${hash}'); RESET ROLE;`);
    const { rows: ids } = await db.query<{id: string}>("select id from public.portal_index_keys");
    const id = ids[0]?.id;
    if (!id) throw new Error("No inserted key");
    await db.query("select public.portal_index_key_touch($1)", [id]);
    const first = await db.query("select last_used_at from public.portal_index_keys");
    await db.query("select public.portal_index_key_touch($1)", [id]);
    expect((await db.query("select last_used_at from public.portal_index_keys")).rows).toEqual(first.rows);
    await db.exec("SET test.superadmin='false'; SET ROLE authenticated;");
    expect((await db.query("select * from public.portal_index_keys")).rows).toEqual([]);
    await expect(db.exec(`INSERT INTO public.portal_index_keys(portal,prefix,last4,key_hash) VALUES('locuit','hblo_','1234','${hash}');`)).rejects.toThrow();
    await db.exec("RESET ROLE");
    expect(JSON.stringify((await db.query("select * from public.audit_logs")).rows)).not.toContain(hash);
    await db.close();
  });
});