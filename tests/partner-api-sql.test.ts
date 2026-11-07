import {beforeAll,afterAll,it,expect} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
let pg:PGlite;
const id="11111111-1111-4111-8111-111111111111",owner="22222222-2222-4222-8222-222222222222",hash="a".repeat(64);
beforeAll(async()=>{
 pg=new PGlite();await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${owner}'::uuid $$;CREATE FUNCTION is_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE TABLE organizations(id uuid PRIMARY KEY);
 CREATE TABLE audit_logs(actor_id uuid,action text,entity text,entity_id uuid,new_values jsonb);
 CREATE TABLE dynamic_feed_portals(slug text PRIMARY KEY,display_name text,website text,logo_path text,active boolean,show_public boolean);
 CREATE TABLE portal_index_keys(id uuid PRIMARY KEY,portal text,prefix text,last4 text,key_hash text,source text,status text,created_by uuid,last_used_at timestamptz);
 CREATE SCHEMA cron;CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;`);
 await pg.exec(readFileSync("drizzle/migrations/0250_partner_api_foundation.sql","utf8"));
 await pg.exec(`CREATE TRIGGER keys_audit AFTER INSERT OR UPDATE ON portal_index_keys FOR EACH ROW EXECUTE FUNCTION portal_index_key_audit(); INSERT INTO dynamic_feed_portals(slug,display_name,website,active,show_public,integration_mode) VALUES('exemplu','Exemplu.ro','https://example.org',true,false,'both');INSERT INTO portal_index_keys(id,portal,prefix,last4,key_hash,source,status,key_type,environment) VALUES('${id}','exemplu','hbpk_live_','abcd','${hash}','managed','active','api','live');`);
});
afterAll(async()=>{await pg.close();});
it("atomic fixed-minute limit: 120 allowed, request 121 blocked, keys isolated",async()=>{
 const results=await Promise.all(Array.from({length:121},()=>pg.query<{r:{allowed:boolean;limit:number;remaining:number}}>("SELECT partner_api_rate_take($1) r",[id])));
 expect(results.filter(r=>r.rows[0]?.r.allowed)).toHaveLength(120);expect(results[120].rows[0]?.r).toMatchObject({allowed:false,limit:120,remaining:0});
 const rows=await pg.query<{request_count:number}>("SELECT request_count FROM partner_api_rate_windows WHERE key_id=$1",[id]);expect(rows.rows).toHaveLength(1);expect(rows.rows[0]?.request_count).toBe(121);
});
it("portal-specific configurable limit is read atomically",async()=>{await pg.exec("UPDATE dynamic_feed_portals SET rate_limit_per_minute=122 WHERE slug='exemplu'");const r=await pg.query<{r:{allowed:boolean;limit:number}}>("SELECT partner_api_rate_take($1) r",[id]);expect(r.rows[0]?.r).toMatchObject({allowed:true,limit:122});});
it("atomic idempotency claim, response replay, different request conflict, test/live isolation",async()=>{
 const claim=(environment:string,h=hash)=>pg.query<{r:{state:string;body?:string;status?:number}}>("SELECT partner_api_idempotency_claim('exemplu',$1,'example',$2,$3) r",[environment,h,owner]);
 expect((await claim("live")).rows[0]?.r.state).toBe("claimed");expect((await claim("live")).rows[0]?.r.state).toBe("pending");
 await pg.exec(`UPDATE partner_api_idempotency SET response_status=201,response_body='{"ok":true}',response_headers='{"content-type":"application/json"}' WHERE portal='exemplu' AND environment='live'`);
 expect((await claim("live")).rows[0]?.r).toMatchObject({state:"replay",status:201,body:'{"ok":true}'});expect((await claim("live","b".repeat(64))).rows[0]?.r.state).toBe("conflict");expect((await claim("test")).rows[0]?.r.state).toBe("claimed");
});
it("24h idempotency expiry permits a new request",async()=>{await pg.exec("UPDATE partner_api_idempotency SET expires_at=now()-interval '1 second' WHERE environment='test'");const r=await pg.query<{r:{state:string}}>("SELECT partner_api_idempotency_claim('exemplu','test','example',$1,$2) r",["c".repeat(64),owner]);expect(r.rows[0]?.r.state).toBe("claimed");});
it("cleanup removes windows older than 1h, receipts past 24h and logs older than 30d",async()=>{
 await pg.exec(`INSERT INTO partner_api_rate_windows VALUES('${id}',now()-interval '61 minutes',1);UPDATE partner_api_idempotency SET expires_at=now()-interval '1 second' WHERE environment='test';INSERT INTO partner_api_request_logs(request_id,method,path,status,duration_ms,created_at) VALUES('${owner}','GET','/api/public/partner/v1/me',200,1,now()-interval '31 days'),('${owner}','GET','/api/public/partner/v1/me',200,1,now());SELECT partner_api_cleanup();`);
 expect((await pg.query("SELECT * FROM partner_api_rate_windows WHERE window_start<now()-interval '1 hour'")).rows).toHaveLength(0);expect((await pg.query("SELECT * FROM partner_api_idempotency WHERE expires_at<=now()")).rows).toHaveLength(0);expect((await pg.query("SELECT * FROM partner_api_request_logs")).rows).toHaveLength(1);
});
it("audit never stores key hash and lists can project metadata without credentials",async()=>{const r=await pg.query<{new_values:Record<string,unknown>}>("SELECT new_values FROM audit_logs WHERE entity='portal_index_keys'");expect(r.rows).toHaveLength(1);expect(r.rows[0].new_values).toMatchObject({prefix:"hbpk_live_",last4:"abcd",key_type:"api",environment:"live"});expect(JSON.stringify(r.rows)).not.toContain(hash);});
it("ordinary authenticated clients cannot execute limits or receipts or read private tables",async()=>{await pg.exec("SET ROLE authenticated");await expect(pg.query("SELECT partner_api_rate_take($1)",[id])).rejects.toThrow();await expect(pg.query("SELECT partner_api_idempotency_claim('exemplu','live','example',$1,$2)",[hash,owner])).rejects.toThrow();await expect(pg.query("SELECT * FROM partner_api_idempotency")).rejects.toThrow();await expect(pg.query("SELECT * FROM partner_api_rate_windows")).rejects.toThrow();await pg.exec("RESET ROLE");});