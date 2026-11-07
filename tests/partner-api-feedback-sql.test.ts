import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const org = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", listing = "33333333-3333-4333-8333-333333333333", lead = "44444444-4444-4444-8444-444444444444", owner = "55555555-5555-4555-8555-555555555555";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE organizations(id uuid primary key,archived_at timestamptz,is_demo boolean DEFAULT false);
    CREATE TABLE dynamic_feed_portals(slug text primary key,active boolean DEFAULT true,integration_mode text DEFAULT 'api');
    CREATE TABLE portal_connections(organization_id uuid,portal text,activated boolean DEFAULT true);
    CREATE TABLE properties(id uuid primary key,organization_id uuid,deleted_at timestamptz,publish_status text DEFAULT 'published',status text DEFAULT 'active');
    CREATE TABLE partner_api_test_agencies(organization_id uuid);
    CREATE TABLE partner_api_listing_state(portal text,property_id uuid,organization_id uuid,visible boolean,withdrawn_at timestamptz);
    CREATE TABLE portal_publications(property_id uuid,portal_key text,enabled boolean DEFAULT true);
    CREATE TABLE leads(id uuid primary key,organization_id uuid,property_id uuid,name text,stage text DEFAULT 'new',deleted_at timestamptz,last_interaction_at timestamptz);
    CREATE TABLE portal_messages(id uuid primary key DEFAULT gen_random_uuid(),organization_id uuid,portal text,property_id uuid,lead_id uuid,external_message_id text,conversation_id text,sender_name text,body text,sent_at timestamptz,direction text,UNIQUE(portal,organization_id,external_message_id));
    CREATE TABLE lead_events(organization_id uuid,lead_id uuid,to_stage text,note text);
    INSERT INTO organizations(id) VALUES('${org}'),('${other}'); INSERT INTO dynamic_feed_portals(slug) VALUES('example'),('other');
    INSERT INTO portal_connections VALUES('${org}','example',true);
    INSERT INTO properties(id,organization_id) VALUES('${listing}','${org}');
    INSERT INTO portal_publications VALUES('${listing}','example',true);
    INSERT INTO partner_api_listing_state VALUES('example','${listing}','${org}',true,null);
    INSERT INTO leads(id,organization_id,property_id,name) VALUES('${lead}','${org}','${listing}','Client fictiv');`);
  await db.exec(readFileSync("drizzle/migrations/0252_partner_api_feedback.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0253_partner_api_message_receipts.sql", "utf8"));
}, 15000);
afterAll(async () => { await db.close(); });
const call = async (fn: string, args: unknown[]) => (await db.query<{ result: Record<string, unknown> }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`, args)).rows[0]?.result;
describe("P3 durable writes and security", () => {
  it("rejected publication stores reasons and older states never overwrite it", async () => {
    expect(await call("partner_api_publication_apply", ["example", "live", listing, JSON.stringify({ status: "rejected", reasons: [{ message: "Fotografii neacceptate" }], occurred_at: "2026-11-07T12:00:00Z" })])).toMatchObject({ applied: true });
    expect(await call("partner_api_publication_apply", ["example", "live", listing, JSON.stringify({ status: "published", occurred_at: "2026-11-06T12:00:00Z" })])).toMatchObject({ applied: false });
    const row = (await db.query<{status: string; reasons: unknown[]}>("select status,reasons from partner_api_publications")).rows[0];
    expect(row).toEqual({ status: "rejected", reasons: [{ message: "Fotografii neacceptate" }] });
  });
  it("another portal and test key cannot report on live listing", async () => {
    for (const [portal, environment] of [["other", "live"], ["example", "test"]]) expect(await call("partner_api_publication_apply", [portal, environment, listing, '{"status":"published"}'])).toMatchObject({ not_found: true });
  });
  it("withdrawn listing accepts publication for 30 days, not after", async () => {
    await db.exec("update partner_api_listing_state set visible=false,withdrawn_at=now()-interval '29 days'");
    expect(await call("partner_api_publication_apply", ["example", "live", listing, '{"status":"removed"}'])).toMatchObject({ applied: true });
    await db.exec("update partner_api_listing_state set withdrawn_at=now()-interval '31 days'");
    expect(await call("partner_api_publication_apply", ["example", "live", listing, '{"status":"removed"}'])).toMatchObject({ not_found: true });
    await db.exec("update partner_api_listing_state set visible=true,withdrawn_at=null");
  });
  it("stats overwrite portal/listing/day rather than increment", async () => {
    const item = [{ listing_id: listing, date: "2026-11-07", views: 12, contacts: 3, favorites: 2 }];
    for (let i = 0; i < 2; i++) expect(await call("partner_api_stats_apply", ["example", "live", JSON.stringify(item)])).toMatchObject({ accepted: 1 });
    expect((await db.query("select views,contacts,favorites from partner_api_statistics")).rows).toEqual([{ views: 12, contacts: 3, favorites: 2 }]);
    await call("partner_api_stats_apply", ["example", "live", JSON.stringify([{ ...item[0], views: 7 }])]);
    expect((await db.query("select sum(views)::int as total from partner_api_statistics")).rows[0]).toEqual({ total: 7 });
  });
  it("invalid stats batch writes nothing even if first item is allowed", async () => {
    const result = await call("partner_api_stats_apply", ["example", "live", JSON.stringify([{ listing_id: listing, date: "2026-11-06", views: 10 }, { listing_id: owner, date: "2026-11-06", views: 100 }])]);
    expect(result).toMatchObject({ not_found: true });
    expect((await db.query("select * from partner_api_statistics where date='2026-11-06'")).rows).toEqual([]);
  });
  it("lead receipt permits only one creator and retries return same CRM lead", async () => {
    const r = await call("partner_api_lead_claim", ["example", "live", "external-1", org, owner]);
    expect(r).toMatchObject({ deduplicated: false });
    expect(await call("partner_api_lead_claim", ["example", "live", "external-1", org, listing])).toMatchObject({ pending: true });
    await db.query("select public.partner_api_lead_finish($1,$2,$3,$4,$5)", ["example", "live", "external-1", owner, lead]);
    expect(await call("partner_api_lead_claim", ["example", "live", "external-1", org, listing])).toMatchObject({ id: lead, deduplicated: true });
    expect((await db.query("select count(*)::int as n from partner_api_lead_receipts")).rows[0]).toEqual({ n: 1 });
  });
  it("unactivated agency cannot claim a lead", async () => {
    expect(await call("partner_api_lead_claim", ["example", "live", "external-other", other, owner])).toMatchObject({ not_found: true });
  });
  it("messages on another portal's lead return not_found", async () => {
    expect(await call("partner_api_message_apply", ["other", "live", lead, "m1", "Mesaj client", "2026-11-07T12:00:00Z"])).toMatchObject({ not_found: true });
  });
  it("message external ID deduplicates both message and event", async () => {
    const args = ["example", "live", lead, "m1", "Mesaj client", "2026-11-07T12:00:00Z"];
    const first = await call("partner_api_message_apply", args), repeat = await call("partner_api_message_apply", args);
    expect(first).toMatchObject({ deduplicated: false }); expect(repeat).toMatchObject({ id: first?.id, deduplicated: true });
    expect((await db.query("select count(*)::int as n from portal_messages")).rows[0]).toEqual({ n: 1 });
    expect((await db.query("select count(*)::int as n from lead_events")).rows[0]).toEqual({ n: 1 });
  });
  it("email claim is atomic and limited to once per ten minutes per lead", async () => {
    const take = async () => (await db.query<{allowed: boolean}>("select partner_api_email_claim($1,$2,$3) as allowed", ["example", "live", lead])).rows[0]?.allowed;
    expect(await take()).toBe(true); expect(await take()).toBe(false);
    await db.exec("update partner_api_lead_receipts set last_email_notified_at=now()-interval '10 minutes'");
    expect(await take()).toBe(true);
  });
  it("ordinary clients cannot execute portal mutation RPCs or read receipts", async () => {
    await db.exec("SET ROLE authenticated");
    await expect(db.exec(`select partner_api_email_claim('example','live','${lead}')`)).rejects.toThrow(/permission denied/);
    await expect(db.exec("select * from partner_api_lead_receipts")).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
});