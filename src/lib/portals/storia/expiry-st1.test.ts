import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { shouldDeselectStoria, storiaExpirySummary, storiaValidTo, STORIA_EXPIRED_REASON } from "./expiry";
import { metaToNotification, parseStoriaMetaRecord } from "./meta-sync";

const mocked = vi.hoisted(() => ({ admin: {} as Record<string, unknown> }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: mocked.admin }));
vi.mock("./oauth.server", () => ({ olxAuthorizedRequest: vi.fn(() => { throw new Error("No real Storia calls allowed"); }), loadStoriaTokens: vi.fn() }));
import { processLifecycle, readEventShape } from "./leads.server";
import { applyStoriaMeta } from "./meta-sync.server";

const org = "11111111-1111-4111-8111-111111111111";
const property = "22222222-2222-4222-8222-222222222222";
const user = "33333333-3333-4333-8333-333333333333";
const sale = "44444444-4444-4444-8444-444444444444";
const rent = "55555555-5555-4555-8555-555555555555";

describe("ST1c pure expiration rules", () => {
  it("requires every current transaction to be outdated, never dates or expired synonyms", () => {
    const input = { autoRenew: false, enabled: true, externalId: `SALE:${sale}|RENT:${rent}`, states: { [sale]: { code: "outdated", valid_to: "2000-01-01" }, [rent]: { code: "active", valid_to: "2000-01-01" } } };
    expect(shouldDeselectStoria(input)).toBe(false);
    expect(storiaExpirySummary(input.externalId, input.states).partial).toBe(true);
    expect(shouldDeselectStoria({ ...input, states: { [sale]: { code: "outdated" }, [rent]: { code: "outdated" } } })).toBe(true);
    expect(shouldDeselectStoria({ ...input, externalId: `SALE:${sale}`, states: { [sale]: { code: "expired" } } })).toBe(false);
    expect(shouldDeselectStoria({ ...input, externalId: null })).toBe(false);
  });
  it("normalizes valid_to and carries the API date into meta notifications", () => {
    expect(storiaValidTo({ state: { valid_to: 1794812400 } })).toBe("2026-11-16T07:00:00.000Z");
    expect(storiaValidTo({ valid_to: "invalid" })).toBeNull();
    const meta = parseStoriaMetaRecord({ uuid: sale, state: { code: "active" }, valid_to: "2026-11-20T08:00:00Z" });
    if (!meta) throw new Error("Expected meta");
    expect(metaToNotification(meta).data).toMatchObject({ valid_to: "2026-11-20T08:00:00.000Z" });
  });
});

describe("ST1c webhook and meta through real handlers and isolated database", () => {
  let db: PGlite;
  const counts = async () => (await db.query("SELECT (SELECT count(*)::int FROM notifications) AS notifications, (SELECT count(*)::int FROM portal_operation_logs) AS logs, (SELECT count(*)::int FROM audit_logs) AS audits")).rows;
  const selected = async () => (await db.query("SELECT enabled,last_error FROM portal_publications WHERE portal_key='storia'")).rows;
  const event = async (uuid = sale, code = "outdated", at = "2026-11-15T08:00:00Z", date: string | null = "2026-12-01T08:00:00Z") => {
    const shape = readEventShape({ flow: "advert_lifecycle", event_type: "advert_state_changed", object_id: uuid, event_timestamp: Date.parse(at) / 1000, data: { code, ...(date ? { valid_to: date } : {}) } });
    if (!shape) throw new Error("Expected webhook shape");
    return processLifecycle(mocked.admin as unknown as Parameters<typeof processLifecycle>[0], shape);
  };
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
      CREATE TABLE properties(id uuid,organization_id uuid,deleted_at timestamptz,storia_auto_renew boolean,assigned_to uuid,created_by uuid,title text);
      CREATE TABLE profiles(id uuid,organization_id uuid);
      CREATE TABLE portal_listings(id uuid,organization_id uuid,property_id uuid,portal text,external_id text,status text,last_event_at timestamptz,updated_at timestamptz,withdraw_reason text,last_error text,last_sync_at timestamptz,published_at timestamptz,public_url text);
      CREATE TABLE portal_publications(organization_id uuid,property_id uuid,portal_key text,enabled boolean,status text,last_error text,last_synced_at timestamptz,updated_at timestamptz);
      CREATE TABLE portal_operation_logs(organization_id uuid,portal text,property_id uuid,operation text,success boolean,external_id text,portal_response jsonb);
      CREATE TABLE audit_logs(organization_id uuid,action text,entity text,entity_id uuid,old_values jsonb,new_values jsonb);
      CREATE TABLE notifications(organization_id uuid,user_id uuid,type text,title text,body text,link text);
    `);
    for (const file of ["0279_storia_expiry_deselect", "0280_storia_fixed_expiry", "0281_storia_api_expiry"]) await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
    await db.exec(`INSERT INTO properties VALUES('${property}','${org}',null,false,'${user}',null,'Apartament test');
      INSERT INTO profiles VALUES('${user}','${org}');
      INSERT INTO portal_listings(id,organization_id,property_id,portal,external_id,status,last_error,published_at) VALUES('${property}','${org}','${property}','storia','SALE:${sale}','published','old error','2026-11-01');
      INSERT INTO portal_publications(organization_id,property_id,portal_key,enabled,status,last_error) VALUES('${org}','${property}','storia',true,'synced','old error'),('${org}','${property}','olx_direct',true,'synced',null);`);
    // Minimal query adapter executes the real handler reads/RPC against isolated PostgreSQL.
    mocked.admin.rpc = async (_name: string, args: Record<string, unknown>) => {
      try {
        const result = await db.query<{ handled: boolean }>("SELECT storia_record_expiry($1,$2,$3,$4,$5,$6) AS handled", [args.p_org,args.p_property,args.p_uuid ?? null,args.p_code ?? null,args.p_valid_to ?? null,args.p_event_at ?? null]);
        return { data: result.rows[0]?.handled, error: null };
      } catch (error) { return { data: null, error }; }
    };
    mocked.admin.from = (table: string) => {
      const clauses: string[] = [], values: unknown[] = [];
      let columns = "*", single = false;
      const run = async () => { const result = await db.query(`SELECT ${columns} FROM ${table}${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`, values); return { data: single ? result.rows[0] ?? null : result.rows, error: null }; };
      const query = {
        select(value: string) { columns = value; return query; },
        eq(key: string, value: unknown) { values.push(value); clauses.push(`${key}=$${values.length}`); return query; },
        is(key: string, _value: null) { clauses.push(`${key} IS NULL`); return query; },
        ilike(key: string, value: string) { values.push(value); clauses.push(`${key} ILIKE $${values.length}`); return query; },
        limit(_value: number) { return query; },
        maybeSingle() { single = true; return run(); },
        update() { throw new Error("Outdated must not enter generic lifecycle writes"); },
        then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) { return run().then(resolve, reject); },
      };
      return query;
    };
  });
  afterEach(async () => { await db.close(); });

  it("webhook outdated disables with exact reason, cleared errors, audit and responsible-agent link; OLX direct stays enabled", async () => {
    expect((await event()).processed).toBe(true);
    expect(await selected()).toEqual([{ enabled: false, last_error: null }]);
    expect((await db.query("SELECT status,withdraw_reason,last_error,valid_to::text FROM portal_listings")).rows).toEqual([{ status: "withdrawn", withdraw_reason: STORIA_EXPIRED_REASON, last_error: null, valid_to: "2026-12-01 08:00:00+00" }]);
    expect(await counts()).toEqual([{ notifications: 1, logs: 1, audits: 1 }]);
    expect((await db.query("SELECT operation FROM portal_operation_logs")).rows).toEqual([{ operation: "expire" }]);
    expect((await db.query("SELECT user_id,link FROM notifications")).rows).toEqual([{ user_id: user, link: `/app/properties/${property}?tab=publishing` }]);
    expect((await db.query("SELECT enabled FROM portal_publications WHERE portal_key='olx_direct'")).rows).toEqual([{ enabled: true }]);
  });
  it("autorenew true leaves selection and aggregate untouched", async () => {
    await db.exec("UPDATE properties SET storia_auto_renew=true");
    await event();
    expect(await selected()).toEqual([{ enabled: true, last_error: "old error" }]);
    expect((await db.query("SELECT status FROM portal_listings")).rows).toEqual([{ status: "published" }]);
    expect(await counts()).toEqual([{ notifications: 0, logs: 0, audits: 0 }]);
  });
  it("repeated webhook produces no duplicate notification, log or audit", async () => {
    await event(); await event();
    expect(await counts()).toEqual([{ notifications: 1, logs: 1, audits: 1 }]);
  });
  it("meta fallback disables even when aggregate state would be skipped as unchanged", async () => {
    await db.exec("UPDATE portal_listings SET status='expired',last_event_at='2026-11-15T08:00:00Z'");
    const meta = parseStoriaMetaRecord({ uuid: sale, state: { code: "outdated", valid_to: "2026-11-20T08:00:00Z" }, modified_at: "2026-11-15T08:00:00Z", last_error: "must not overwrite cleared error" });
    if (!meta) throw new Error("Expected meta");
    expect((await applyStoriaMeta(org, meta)).status).toBe("withdrawn");
    expect(await selected()).toEqual([{ enabled: false, last_error: null }]);
    expect(await counts()).toEqual([{ notifications: 1, logs: 1, audits: 1 }]);
  });
  it("one outdated out of two is saved as partial; second transaction can arrive with an older timestamp", async () => {
    await db.query("UPDATE portal_listings SET external_id=$1,last_event_at='2026-11-15T09:00:00Z'", [`SALE:${sale}|RENT:${rent}`]);
    await event(sale, "outdated", "2026-11-15T09:00:00Z");
    expect((await selected())[0]).toMatchObject({ enabled: true });
    const rows = await db.query<{ external_id: string; storia_advert_states: unknown; status: string }>("SELECT external_id,storia_advert_states,status FROM portal_listings");
    const row = rows.rows[0]; if (!row) throw new Error("Missing listing");
    expect(row.status).toBe("published");
    expect(storiaExpirySummary(row.external_id,row.storia_advert_states).partial).toBe(true);
    expect(await counts()).toEqual([{ notifications: 0, logs: 0, audits: 0 }]);
    await event(rent, "outdated", "2026-11-15T08:00:00Z");
    expect((await selected())[0]).toMatchObject({ enabled: false });
    expect(await counts()).toEqual([{ notifications: 1, logs: 1, audits: 1 }]);
  });
  it("ignores older same-UUID outdated after a newer active state and never decides from valid_to", async () => {
    await db.query("SELECT storia_record_expiry($1,$2,$3,'active',$4,$5)", [org,property,sale,"2000-01-01T00:00:00Z","2026-11-15T10:00:00Z"]);
    await event(sale,"outdated","2026-11-15T09:00:00Z");
    expect((await selected())[0]).toMatchObject({ enabled: true });
    expect(await counts()).toEqual([{ notifications: 0, logs: 0, audits: 0 }]);
  });
  it("removes fixed functions/triggers and no longer calculates expires_at", async () => {
    expect((await db.query("SELECT to_regprocedure('storia_expire_due(timestamptz,integer)') AS fn,(SELECT count(*)::int FROM pg_trigger WHERE tgname IN ('storia_fixed_expiry_listing','storia_fixed_expiry_renewal')) AS triggers,expires_at FROM portal_listings")).rows).toEqual([{ fn: null,triggers: 0,expires_at: null }]);
  });
});
