import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { shouldDeselectStoria, storiaExpiresAt, storiaValidTo, STORIA_EXPIRED_REASON } from "./expiry";
import { metaToNotification, parseStoriaMetaRecord } from "./meta-sync";

const now = Date.parse("2026-11-15T07:05:00Z");
describe("ST1 expiry decision", () => {
  it("publication without renewal expires in exactly 30 days; renewal has no deadline", () => {
    expect(storiaExpiresAt("2026-11-15T07:05:00Z", false)).toBe("2026-12-15T07:05:00.000Z");
    expect(storiaExpiresAt("2026-11-15T07:05:00Z", true)).toBeNull();
    expect(storiaExpiresAt("2026-11-15T07:05:00Z", null)).toBeNull();
  });
  it("only the stored deadline decides; second run cannot deselect again", () => {
    const input = { autoRenew: false, enabled: true, expiresAt: "2026-11-15T07:05:00Z", now };
    expect(shouldDeselectStoria(input)).toBe(true);
    expect(shouldDeselectStoria({ ...input, enabled: false })).toBe(false);
    expect(shouldDeselectStoria({ ...input, autoRenew: true })).toBe(false);
    expect(shouldDeselectStoria({ ...input, expiresAt: null })).toBe(false);
    expect(shouldDeselectStoria({ ...input, now: now - 1 })).toBe(false);
  });
  it("normalizes valid_to and retains it in synthetic notifications", () => {
    expect(storiaValidTo({ state: { valid_to: 1794812400 } })).toBe("2026-11-16T07:00:00.000Z");
    expect(storiaValidTo({ valid_to: "invalid" })).toBeNull();
    const meta = parseStoriaMetaRecord({ uuid: "11111111-1111-4111-8111-111111111111", state: { code: "active" }, valid_to: "2026-11-20T08:00:00Z" });
    if (!meta) throw new Error("Expected meta");
    expect(metaToNotification(meta).data).toMatchObject({ valid_to: "2026-11-20T08:00:00.000Z" });
  });
});

describe("ST1 atomic persistence (isolated database, no Storia calls)", () => {
  it("deselects once, clears errors, logs and notifies once; preserves independent OLX and renewals", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
        CREATE TABLE properties(id uuid,organization_id uuid,deleted_at timestamptz,storia_auto_renew boolean,assigned_to uuid,created_by uuid,title text);
        CREATE TABLE profiles(id uuid,organization_id uuid);
        CREATE TABLE portal_listings(id uuid,organization_id uuid,property_id uuid,portal text,external_id text,status text,last_event_at timestamptz,updated_at timestamptz,withdraw_reason text,last_error text,last_sync_at timestamptz,published_at timestamptz);
        CREATE TABLE portal_publications(organization_id uuid,property_id uuid,portal_key text,enabled boolean,status text,last_error text,last_synced_at timestamptz,updated_at timestamptz);
        CREATE TABLE portal_operation_logs(organization_id uuid,portal text,property_id uuid,operation text,success boolean,external_id text,portal_response jsonb);
        CREATE TABLE audit_logs(organization_id uuid,action text,entity text,entity_id uuid,old_values jsonb,new_values jsonb);
        CREATE TABLE notifications(organization_id uuid,user_id uuid,type text,title text,body text,link text);
      `);
      await db.exec(readFileSync("drizzle/migrations/0279_storia_expiry_deselect.sql", "utf8"));
      await db.exec(readFileSync("drizzle/migrations/0280_storia_fixed_expiry.sql", "utf8"));
      const org = "11111111-1111-4111-8111-111111111111", p = "22222222-2222-4222-8222-222222222222", u = "33333333-3333-4333-8333-333333333333";
      await db.exec(`INSERT INTO properties VALUES('${p}','${org}',null,false,null,'${u}','Apartament test');
        INSERT INTO profiles VALUES('${u}','${org}');
        INSERT INTO portal_listings(id,organization_id,property_id,portal,external_id,status,last_error) VALUES('${p}','${org}','${p}','storia','SALE:sale-id','published','old error');
        INSERT INTO portal_publications(organization_id,property_id,portal_key,enabled,status,last_error) VALUES('${org}','${p}','storia',true,'synced','old error'),('${org}','${p}','olx_direct',true,'synced',null);`);
      const expire = (at = "2026-12-15T07:05:00Z") => db.query("SELECT storia_expire_due($1) AS n", [at]);
      await db.exec("UPDATE portal_listings SET published_at='2026-11-15T07:05:00Z'");
      expect((await db.query("SELECT expires_at::text AS date FROM portal_listings")).rows).toEqual([{ date: "2026-12-15 07:05:00+00" }]);
      await db.exec("UPDATE properties SET storia_auto_renew=true");
      expect((await db.query("SELECT expires_at FROM portal_listings")).rows).toEqual([{ expires_at: null }]);
      await db.exec("UPDATE properties SET storia_auto_renew=false");
      expect((await db.query("SELECT expires_at::text AS date FROM portal_listings")).rows).toEqual([{ date: "2026-12-15 07:05:00+00" }]);
      await db.query("SELECT storia_record_expiry($1,$2,$3,$4,$5,null)", [org,p,"sale-id","outdated","2026-11-10T07:00:00Z"]);
      expect((await expire("2026-12-15T07:04:59Z")).rows).toEqual([{ n: 0 }]);
      expect((await expire()).rows).toEqual([{ n: 1 }]);
      expect((await expire()).rows).toEqual([{ n: 0 }]);
      expect((await db.query("SELECT enabled,last_error FROM portal_publications WHERE portal_key='storia'")).rows).toEqual([{ enabled: false, last_error: null }]);
      expect((await db.query("SELECT status,withdraw_reason,last_error FROM portal_listings")).rows).toEqual([{ status: "withdrawn", withdraw_reason: STORIA_EXPIRED_REASON, last_error: null }]);
      expect((await db.query("SELECT count(*)::int AS n FROM notifications")).rows).toEqual([{ n: 1 }]);
      expect((await db.query("SELECT operation,success FROM portal_operation_logs")).rows).toEqual([{ operation: "expire", success: true }]);
      expect((await db.query("SELECT count(*)::int AS n FROM audit_logs")).rows).toEqual([{ n: 1 }]);
      expect((await db.query("SELECT user_id,link FROM notifications")).rows).toEqual([{ user_id: u, link: `/app/properties/${p}?tab=publishing` }]);
      expect((await db.query("SELECT enabled FROM portal_publications WHERE portal_key='olx_direct'")).rows).toEqual([{ enabled: true }]);
      await db.exec("UPDATE properties SET storia_auto_renew=true; UPDATE portal_publications SET enabled=true WHERE portal_key='storia'; UPDATE portal_listings SET published_at='2026-12-16T07:05:00Z'");
      expect((await db.query("SELECT expires_at FROM portal_listings")).rows).toEqual([{ expires_at: null }]);
      expect((await expire("2027-02-01T00:00:00Z")).rows).toEqual([{ n: 0 }]);
      await db.exec("UPDATE properties SET storia_auto_renew=false");
      expect((await db.query("SELECT expires_at::text AS date FROM portal_listings")).rows).toEqual([{ date: "2027-01-15 07:05:00+00" }]);
    } finally { await db.close(); }
  });
});