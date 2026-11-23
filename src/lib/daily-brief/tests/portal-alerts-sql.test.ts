import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const org='11111111-1111-4111-8111-111111111111', otherOrg='22222222-2222-4222-8222-222222222222', property='33333333-3333-4333-8333-333333333333', agent='44444444-4444-4444-8444-444444444444', admin='55555555-5555-4555-8555-555555555555';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE FUNCTION public.current_org() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.org',true),'')::uuid $$;
 CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
 CREATE TABLE public.properties(id uuid PRIMARY KEY,organization_id uuid,assigned_to uuid,deleted_at timestamptz,status text DEFAULT 'active',publish_status text DEFAULT 'published');
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,organization_id uuid,is_active boolean DEFAULT true);
 CREATE TABLE public.user_roles(user_id uuid,organization_id uuid,role text);
 CREATE TABLE public.portal_integrations(organization_id uuid,portal_key text,status text,last_error text);
 CREATE TABLE public.portal_publications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,property_id uuid,portal_key text,enabled boolean DEFAULT true,status text DEFAULT 'selected',last_error text);
 CREATE TABLE public.portal_operation_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,property_id uuid,portal text,operation text,success boolean,error_message text,error_code text,http_status integer,created_at timestamptz DEFAULT now());
 CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,type text,title text,body text,link text,read_at timestamptz);
 INSERT INTO public.profiles VALUES('${agent}','${org}',true),('${admin}','${org}',true);
 INSERT INTO public.user_roles VALUES('${admin}','${org}','agency_admin');
 INSERT INTO public.properties(id,organization_id,assigned_to) VALUES('${property}','${org}','${agent}');`);
 await db.exec(readFileSync('drizzle/migrations/0325_home_actions_portal_notifications.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0326_portal_alerts_fail_open.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0327_portal_alerts_stable_identity.sql','utf8'));
},15000);
beforeEach(async()=>{
 await db.exec(`TRUNCATE public.portal_publications,public.portal_operation_logs,public.notifications,public.portal_integrations;
 UPDATE public.properties SET status='active',deleted_at=NULL,publish_status='published';
 INSERT INTO public.portal_publications(organization_id,property_id,portal_key) VALUES('${org}','${property}','storia');`);
});
afterAll(async()=>{await db.close();});
async function record(message:string,code:string|null=null,http:number|null=null,operation='publish',success=false,organization=org){
 await db.query('SELECT public.record_portal_alert($1,$2,$3,$4,$5,$6,$7,$8,$9)',[organization,property,'storia',operation,success,message,code,http,'Storia']);
}
async function unresolved(){return (await db.query<{n:number}>('SELECT count(*)::int n FROM public.notifications WHERE resolved_at IS NULL')).rows[0]?.n;}

describe('existing portal bell rules and fail-open triggers',()=>{
 it('a validation failure creates one notification per agency recipient and property/portal',async()=>{
  await record('Câmp obligatoriu lipsă','VALIDATION_ERROR');await record('Câmp obligatoriu lipsă','VALIDATION_ERROR');
  expect(await unresolved()).toBe(2);
  const rows=(await db.query<{user_id:string;link:string}>('SELECT user_id,link FROM notifications ORDER BY user_id')).rows;
  expect(rows.map(r=>r.user_id)).toEqual([agent,admin]);
  expect(rows.every(r=>r.link===`/app/properties/${property}?tab=publishing`)).toBe(true);
 });
 it('temporary 5xx/521 failures do not notify during the first 24 hours',async()=>{
  await record('HTTP 521',null,521,'update');await record('eroare temporară',null,503,'update');
  expect(await unresolved()).toBe(0);
  expect((await db.query<{operation:string}>('SELECT alert_operation operation FROM portal_publications')).rows[0]?.operation).toBe('update');
 });
 it('one persistent temporary operation notifies after 24h and does not repeat',async()=>{
  await record('HTTP 500',null,500,'update');
  await db.exec("UPDATE portal_publications SET alert_since=now()-interval '24 hours 1 minute'");
  await db.exec('SELECT public.reconcile_portal_alerts(); SELECT public.reconcile_portal_alerts();');
  expect(await unresolved()).toBe(2);
  expect((await db.query<{title:string}>('SELECT title FROM notifications LIMIT 1')).rows[0]?.title).toBe('Portalul Storia nu răspunde de 24 h');
  expect((await db.query<{operation:string}>('SELECT alert_operation operation FROM portal_publications')).rows[0]?.operation).toBe('update');
 });
 it('successful publication resolves notifications automatically',async()=>{
  await record('Câmp lipsă','VALIDATION_ERROR');
  await db.exec("UPDATE portal_publications SET status='published',last_error=NULL");
  expect(await unresolved()).toBe(0);
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM notifications WHERE resolved_at IS NOT NULL AND read_at IS NOT NULL')).rows[0]?.n).toBe(2);
 });
 it('deselection retires alerts without republishing or deleting a listing',async()=>{
  await record('Câmp lipsă','VALIDATION_ERROR');await db.exec('UPDATE portal_publications SET enabled=false');
  expect(await unresolved()).toBe(0);
  expect((await db.query<{status:string;enabled:boolean}>('SELECT status,enabled FROM portal_publications')).rows[0]).toEqual({status:'selected',enabled:false});
 });
 it('another agency cannot create alerts for this property',async()=>{
  await record('Câmp lipsă','VALIDATION_ERROR',null,'publish',false,otherOrg);
  expect(await unresolved()).toBe(0);
 });
 it('unrelated notification types remain unchanged',async()=>{
  await db.query("INSERT INTO notifications(organization_id,user_id,type,title) VALUES($1,$2,'collaboration_message','message'),($1,$2,'news','news')",[org,agent]);
  await record('Câmp lipsă','VALIDATION_ERROR');await record('',null,null,'publish',true);
  expect((await db.query<{type:string;read_at:string|null;resolved_at:string|null}>("SELECT type,read_at,resolved_at FROM notifications WHERE type<>'portal_failure' ORDER BY type")).rows).toEqual([{type:'collaboration_message',read_at:null,resolved_at:null},{type:'news',read_at:null,resolved_at:null}]);
 });
 it('the same actionable error remains deduplicated after the hourly check',async()=>{
  await db.exec("UPDATE portal_publications SET status='error',last_error='Câmp obligatoriu lipsă'");
  await record('Câmp obligatoriu lipsă','VALIDATION_ERROR',null,'update');
  await db.exec('SELECT public.reconcile_portal_alerts(); SELECT public.reconcile_portal_alerts();');
  expect(await unresolved()).toBe(2);
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM notifications')).rows[0]?.n).toBe(2);
 });
 it('connection and lead-reading notices are not suppressed as publication errors',async()=>{
  await db.query("INSERT INTO notifications(organization_id,user_id,type,title,link) VALUES($1,$2,'portal_failure','Housera: cererile nu pot fi citite','/app/settings?tab=portals'),($1,$2,'portal_failure','Reconectează Storia','/app/settings?tab=portals')",[org,agent]);
  expect(await unresolved()).toBe(2);
 });
 it('snooze and ignore are stored privately for the authenticated user',async()=>{
  await db.exec('BEGIN');
  try{
   await db.query("SELECT set_config('test.uid',$1,true),set_config('test.org',$2,true)",[agent,org]);
   await db.exec('SET LOCAL ROLE authenticated');
   await db.query("INSERT INTO home_action_preferences(user_id,organization_id,action_key,snoozed_until,ignored) VALUES($1,$2,'lead:snooze',now()+interval '1 day',false),($1,$2,'lead:ignore',NULL,true)",[agent,org]);
   expect((await db.query<{key:string;ignored:boolean;snoozed:boolean}>('SELECT action_key key,ignored,snoozed_until>now() snoozed FROM home_action_preferences ORDER BY action_key')).rows).toEqual([{key:'lead:ignore',ignored:true,snoozed:null},{key:'lead:snooze',ignored:false,snoozed:true}]);
   await db.query("SELECT set_config('test.uid',$1,true)",[admin]);
   expect((await db.query('SELECT * FROM home_action_preferences')).rows).toEqual([]);
   await expect(db.query("INSERT INTO home_action_preferences(user_id,organization_id,action_key,ignored) VALUES($1,$2,'lead:foreign',true)",[agent,org])).rejects.toThrow();
  }finally{await db.exec('ROLLBACK');}
 });
 it('both triggers preserve the business write even when alert recording throws',async()=>{
  await db.exec('BEGIN');
  try{
   await db.exec(`CREATE OR REPLACE FUNCTION public.record_portal_alert(_org uuid,_property uuid,_portal text,_operation text,_success boolean,_message text DEFAULT NULL,_code text DEFAULT NULL,_http integer DEFAULT NULL,_name text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated private failure'; END $$;`);
   await db.exec("UPDATE portal_publications SET status='error',last_error='missing field'");
   await db.query("INSERT INTO portal_operation_logs(organization_id,property_id,portal,operation,success,error_message) VALUES($1,$2,'storia','publish',false,'failure')",[org,property]);
   expect((await db.query<{status:string}>('SELECT status FROM portal_publications')).rows[0]?.status).toBe('error');
   expect((await db.query<{n:number}>('SELECT count(*)::int n FROM portal_operation_logs')).rows[0]?.n).toBe(1);
   await db.exec('SELECT public.reconcile_portal_alerts()');
  }finally{await db.exec('ROLLBACK');}
 });
});