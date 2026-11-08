import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
let db: PGlite;
const org = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
  CREATE FUNCTION is_superadmin() RETURNS boolean LANGUAGE sql AS 'select coalesce(current_setting(''test.sa'',true),'''')=''yes''';
  CREATE FUNCTION current_org() RETURNS uuid LANGUAGE sql AS 'select nullif(current_setting(''test.org'',true),'''')::uuid';
  CREATE FUNCTION is_org_admin(uuid) RETURNS boolean LANGUAGE sql AS 'select false';
  CREATE TABLE organizations(id uuid primary key); CREATE TABLE properties(id uuid primary key);
  CREATE TABLE user_roles(user_id uuid,role text); INSERT INTO user_roles VALUES('${user}','superadmin');
  CREATE TABLE notifications(id uuid default gen_random_uuid() primary key,organization_id uuid,user_id uuid,created_by uuid,type text,title text,body text,link text);
  CREATE TABLE portal_operation_logs(organization_id uuid,property_id uuid,portal text,actor_id uuid,operation text,success boolean,error_code text,error_message text);
  CREATE FUNCTION enqueue_portal_contact_update(uuid,uuid,text,uuid,boolean,timestamptz) RETURNS void LANGUAGE plpgsql AS 'begin end';`);
  const schema = readFileSync("drizzle/migrations/0123_portal_publish_jobs.sql", "utf8").split("CREATE OR REPLACE FUNCTION")[0];
  await db.exec(schema);
  await db.exec(readFileSync("drizzle/migrations/0152_portal_republish_batches.sql", "utf8"));
  await db.exec(`ALTER TABLE portal_publish_jobs ADD contact_update_requested_by uuid, ADD followup_at timestamptz; ALTER TABLE portal_republish_batches ADD kind text DEFAULT 'republish';`);
  await db.exec(readFileSync("drizzle/migrations/0259_publication_resilience.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0198_republish_completion_notification.sql", "utf8"));
}, 15000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`DELETE FROM portal_publish_jobs; DELETE FROM portal_republish_batches; DELETE FROM portal_relay_health; DELETE FROM portal_publish_fairness; DELETE FROM portal_operation_logs; DELETE FROM notifications; DELETE FROM properties; DELETE FROM organizations; INSERT INTO organizations VALUES('${org}'); SELECT set_config('test.sa','yes',false); SELECT set_config('test.uid','${user}',false); SELECT set_config('test.org','${org}',false);`);
});
async function job(portal: string, patch = "", batch: string | null = null) {
  const id = crypto.randomUUID();
  await db.query("insert into properties(id) values($1)", [id]);
  await db.query(`insert into portal_publish_jobs(id,organization_id,property_id,portal_key,enabled,requested_by,republish_batch_id) values($1,$2,$1,$3,true,$4,$5)`, [id, org, portal, user, batch]);
  if (patch) await db.exec(`update portal_publish_jobs set ${patch} where id='${id}'`);
  return id;
}
const claim = async (limit = 3) => (await db.query<any>("select * from claim_portal_publish_jobs($1,300)", [limit])).rows;
it("third abandoned claim ends with TIMEOUT and never claims again", async () => {
  const id = await job("imobiliare_ro", "status='running',locked_at=now()-interval '6 minutes',attempts=3");
  expect(await claim()).toEqual([]);
  expect((await db.query<any>("select status,attempts,result_message from portal_publish_jobs where id=$1", [id])).rows[0]).toMatchObject({status:"error",attempts:3,result_message:"Portalul nu a răspuns de 3 ori; se reîncearcă la următoarea republicare"});
  expect((await db.query<any>("select error_code from portal_operation_logs")).rows[0].error_code).toBe("TIMEOUT");
  expect(await claim()).toEqual([]);
});
it("20 stalled jobs do not block other portals and the global per-portal cap is 2", async () => {
  for (let i=0;i<20;i++) await job("imobiliare_ro");
  await job("vdi"); await job("storia");
  const first = await claim(3);
  expect(new Set(first.map(j=>j.portal_key)).size).toBe(3);
  const second=await claim(20);
  expect([...first,...second].filter(j=>j.portal_key==="imobiliare_ro")).toHaveLength(2);
  expect(await claim(20)).toEqual([]);
});
it("three relay failures defer both portals 15 minutes and notify superadmins once", async () => {
  await job("imobiliare_ro"); await job("vdi"); await job("storia");
  await db.exec("select record_portal_relay_response(false); select record_portal_relay_response(false);");
  expect((await db.query<any>("select paused_until from portal_relay_health")).rows[0].paused_until).toBeNull();
  await db.exec("select record_portal_relay_response(false)");
  const state=(await db.query<any>("select extract(epoch from paused_until-now()) as seconds from portal_relay_health")).rows[0];
  expect(Number(state.seconds)).toBeGreaterThan(899); expect(Number(state.seconds)).toBeLessThanOrEqual(900);
  expect((await db.query<any>("select user_id,title from notifications")).rows).toEqual([{user_id:user,title:"Releul cu IP fix (relay.habitoo.ro) nu răsponde".replace("răsponde","răspunde")}]);
  expect((await claim(10)).map(j=>j.portal_key)).toEqual(["storia"]);
  await db.exec("select record_portal_relay_response(false)");
  expect((await db.query("select * from notifications")).rows).toHaveLength(1);
  await db.exec("select record_portal_relay_response(true)");
  expect((await claim(10)).map(j=>j.portal_key).sort()).toEqual(["imobiliare_ro","vdi"]);
});
it("success resets consecutive failures and the 5-minute window expires", async () => {
  await db.exec("select record_portal_relay_response(false); select record_portal_relay_response(true); select record_portal_relay_response(false); update portal_relay_health set first_failure_at=now()-interval '6 minutes'; select record_portal_relay_response(false)");
  expect((await db.query<any>("select consecutive_failures,paused_until from portal_relay_health")).rows[0]).toMatchObject({consecutive_failures:1,paused_until:null});
});
it("probe is exclusive and only due after 15 minutes", async () => {
  await db.exec("select record_portal_relay_response(false); select record_portal_relay_response(false); select record_portal_relay_response(false)");
  expect((await db.query<any>("select claim_portal_relay_probe() as claimed")).rows[0].claimed).toBe(false);
  await db.exec("update portal_relay_health set paused_until=now()-interval '1 second'");
  expect((await db.query<any>("select claim_portal_relay_probe() as claimed")).rows[0].claimed).toBe(true);
  expect((await db.query<any>("select claim_portal_relay_probe() as claimed")).rows[0].claimed).toBe(false);
});
it("Oprește restul closes the batch atomically and fences a late worker", async () => {
  const batch=crypto.randomUUID();
  await db.query("insert into portal_republish_batches(id,organization_id,requested_by,created_at,total) values($1,$2,$3,now()-interval '31 minutes',2)",[batch,org,user]);
  await job("imobiliare_ro","",batch); await job("storia","",batch);
  const [running]=await claim(1);
  expect((await db.query<any>("select cancel_portal_republish_batch($1) as cancelled",[batch])).rows[0].cancelled).toBe(2);
  expect((await db.query<any>("select status,succeeded,skipped from portal_republish_batches")).rows[0]).toEqual({status:"done",succeeded:0,skipped:2});
  expect((await db.query<any>("select finish_portal_publish_job($1,$2,'done',true,'published',null,0) as saved",[running.id,running.claim_token])).rows[0].saved).toBe(false);
  expect(await claim()).toEqual([]);
  expect((await db.query("select * from notifications")).rows).toHaveLength(1);
});
it("a stale generation cannot finalize the replacement claim", async () => {
  const id=await job("storia"); const [first]=await claim(1);
  await db.query("update portal_publish_jobs set locked_at=now()-interval '6 minutes' where id=$1",[id]);
  const [second]=await claim(1);
  expect(second.claim_token).not.toBe(first.claim_token);
  expect((await db.query<any>("select finish_portal_publish_job($1,$2,'done',true,'published',null,0) as saved",[id,first.claim_token])).rows[0].saved).toBe(false);
  expect((await db.query<any>("select finish_portal_publish_job($1,$2,'queued',false,'blocked','retry',30000) as saved",[id,second.claim_token])).rows[0].saved).toBe(true);
});
it("unauthorized and signed-out callers cannot cancel a stalled batch",async()=>{
  const batch=crypto.randomUUID(); await db.query("insert into portal_republish_batches(id,organization_id,requested_by,created_at) values($1,$2,$3,now()-interval '31 minutes')",[batch,org,user]);
  await db.exec("select set_config('test.sa','no',false);select set_config('test.uid','',false);select set_config('test.org','',false)");
  await expect(db.query("select cancel_portal_republish_batch($1)",[batch])).rejects.toThrow("Forbidden");
});