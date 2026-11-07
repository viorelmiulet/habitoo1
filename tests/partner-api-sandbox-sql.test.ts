import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {sandboxAgents,sandboxListings,SANDBOX_AGENCY_ID} from "@/lib/partner-api/sandbox";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE FUNCTION is_superadmin() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    CREATE TABLE organizations(id uuid primary key,is_demo boolean);CREATE TABLE dynamic_feed_portals(slug text primary key,active boolean,integration_mode text);CREATE TABLE partner_api_test_agencies(organization_id uuid);
    CREATE TABLE notifications(user_id uuid,type text,title text,body text,link text);CREATE TABLE user_roles(user_id uuid,role text);
    CREATE TABLE partner_api_rate_windows(window_start timestamptz);CREATE TABLE partner_api_idempotency(expires_at timestamptz);CREATE TABLE partner_api_request_logs(created_at timestamptz);
    CREATE TABLE partner_api_agency_state(portal text,organization_id uuid,active boolean,activated_at timestamptz,deactivated_at timestamptz,updated_at timestamptz,PRIMARY KEY(portal,organization_id));
    CREATE TABLE partner_api_listing_state(portal text,property_id uuid,organization_id uuid,agent_id uuid,content_hash text,visible boolean,payload jsonb,withdrawn_at timestamptz,updated_at timestamptz DEFAULT now(),PRIMARY KEY(portal,property_id));
    CREATE TABLE partner_api_agent_state(portal text,agent_id uuid,organization_id uuid,content_hash text,payload jsonb,updated_at timestamptz DEFAULT now());
    CREATE TABLE partner_api_events(seq bigserial,portal text,type text,entity_type text,entity_id uuid,organization_id uuid,occurred_at timestamptz DEFAULT now());
    INSERT INTO organizations VALUES('${SANDBOX_AGENCY_ID}',true);INSERT INTO partner_api_test_agencies VALUES('${SANDBOX_AGENCY_ID}');`);
  await db.exec(readFileSync("drizzle/migrations/0254_partner_api_sandbox.sql","utf8"));
  for(const payload of sandboxAgents)await db.query("INSERT INTO partner_api_sandbox_templates VALUES('agent',$1,$2)",[payload.id,JSON.stringify(payload)]);
  for(const payload of sandboxListings({apartment:"a",house:"h",land:"l"}))await db.query("INSERT INTO partner_api_sandbox_templates VALUES('listing',$1,$2)",[payload.id,JSON.stringify(payload)]);
  await db.exec("INSERT INTO dynamic_feed_portals VALUES('example',true,'api'),('other',true,'api')");
},15000);
afterAll(async()=>{await db.close();});
describe("P5 durable sandbox rules",()=>{
  it("reset restores exactly initial 12 active listings and 2 agents without changing another portal",async()=>{
    await db.query("SELECT partner_api_sandbox_simulate('example','listing_create')");await db.query("SELECT partner_api_sandbox_simulate('example','listing_withdraw')");await db.query("SELECT partner_api_sandbox_simulate('example','agent_update')");
    await db.query("SELECT partner_api_sandbox_reset('example')");
    expect((await db.query("SELECT count(*)::int n FROM partner_api_listing_state WHERE portal='example' AND visible")).rows[0]).toEqual({n:12});
    expect((await db.query("SELECT count(*)::int n FROM partner_api_agent_state WHERE portal='example'")).rows[0]).toEqual({n:2});
    expect((await db.query("SELECT s.payload=t.payload same FROM partner_api_listing_state s JOIN partner_api_sandbox_templates t ON t.id=s.property_id WHERE s.portal='example' AND s.visible")).rows.every((r)=>r.same)).toBe(true);
    expect((await db.query("SELECT count(*)::int n FROM partner_api_listing_state WHERE portal='other' AND visible")).rows[0]).toEqual({n:12});
  });
  it("simulated events use P2 sequence and entity identifiers only",async()=>{
    const result=(await db.query<{r:{seq:number;type:string}}>("SELECT partner_api_sandbox_simulate('example','listing_update') r")).rows[0]?.r;
    expect(result?.type).toBe("listing.upserted");expect(Number(result?.seq)).toBeGreaterThan(0);
  });
  it("test notifications target only superadmin and lead payload is labelled Test",async()=>{
    await db.exec("INSERT INTO user_roles VALUES('a7b50000-0000-4000-8000-000000000800','superadmin'),('a7b50000-0000-4000-8000-000000000801','agency_admin')");
    await db.query("SELECT partner_api_sandbox_write('example','lead','lead-1',$1)",[JSON.stringify({name:"Demo",email:"demo@example.invalid"})]);
    expect((await db.query("SELECT user_id,title FROM notifications")).rows).toEqual([{user_id:"a7b50000-0000-4000-8000-000000000800",title:"Test · Partner API"}]);
    expect((await db.query("SELECT payload->>'label' label FROM partner_api_sandbox_data WHERE kind='lead'")).rows[0]).toEqual({label:"Test"});
  });
  it("writes expire after 30 days and hourly cleanup removes them",async()=>{
    expect((await db.query("SELECT extract(epoch FROM expires_at-created_at)::int lifetime FROM partner_api_sandbox_data WHERE kind='lead'")).rows[0]).toEqual({lifetime:30*86400});
    await db.exec("UPDATE partner_api_sandbox_data SET expires_at=now()-interval '1 second' WHERE kind='lead';SELECT partner_api_cleanup()");
    expect((await db.query("SELECT count(*)::int n FROM partner_api_sandbox_data WHERE kind='lead'")).rows[0]).toEqual({n:0});
  });
  it("ordinary clients cannot read fixtures, write or reset",async()=>{
    await db.exec("SET ROLE authenticated");await expect(db.exec("SELECT * FROM partner_api_sandbox_templates")).rejects.toThrow(/permission denied/);await expect(db.exec("SELECT partner_api_sandbox_reset('example')")).rejects.toThrow(/permission denied/);await db.exec("RESET ROLE");
  });
  it("stats retried overwrite a single test row",async()=>{
    for(const views of [12,12,7])await db.query("SELECT partner_api_sandbox_write('example','stats','listing:2026-11-07',$1)",[JSON.stringify({views})]);
    expect((await db.query("SELECT count(*)::int n,max((payload->>'views')::int) views FROM partner_api_sandbox_data WHERE kind='stats'")).rows[0]).toEqual({n:1,views:7});
  });
});