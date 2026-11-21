import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {runUnitOperationOnce,type UnitOperationJob,type UnitOperationItem, type UnitOperationDb} from './unit-operations';
import {allPortals} from '@/lib/portals/registry';

let db:PGlite;
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function as(uid:number|null){await db.exec(`reset role;set request.jwt.claim.sub='';set request.jwt.claims='{}';set test.uid='${uid===null?'':id(uid)}';${uid===null?'':'set role authenticated;'}`);}
async function call<T>(name:string,args:unknown[]=[]) {const r=await db.query<{r:T}>(`select ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) r`,args);const row=r.rows[0];if(!row)throw new Error('Missing RPC result');return row.r;}
const start=async(operation:string,ids=[id(41)])=>{await as(10);return call<string>('start_development_unit_operation',[id(30),ids,operation]);};
async function claim(){await as(null);const r=await db.query<UnitOperationJob>('select * from claim_development_clone_job(120)');const j=r.rows[0];if(!j)throw new Error('Missing job');return j;}
const workerDb:UnitOperationDb={
 step:async j=>{await as(null);return call<UnitOperationItem|null>('development_unit_operation_step',[j]);},
 advance:async(j,i,e)=>{await as(null);await call('development_unit_operation_advance',[j,i,e]);},
 release:async j=>{await as(null);await call('development_clone_job_release',[j]);},
 finish:async(j,e)=>{await as(null);await call('development_unit_operation_finish',[j,e]);},
};
const deps={activatedPortals:async()=>new Set(['storia','imove']),definitions:allPortals,
 developmentPortals:async()=>['agency_site','storia','imove'],
 applySelection:async(_j:UnitOperationJob,item:UnitOperationItem,selections:{portalId:string;enabled:boolean}[])=>{
  await as(null);
  for(const s of selections)await db.query("insert into portal_publications(property_id,portal_key,enabled,status) values($1,$2,$3,$4) on conflict(property_id,portal_key) do update set enabled=excluded.enabled,status=excluded.status",[item.propertyId,s.portalId,s.enabled,s.enabled?'published':'disabled']);
  return selections.map(s=>({portalId:s.portalId,ok:true,message:null}));
 },enqueueDeletion:async()=>{},
};
beforeAll(async()=>{
 db=new PGlite();await db.exec(`
 create role authenticated;create role anon;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('test.uid',true),''))::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 create table organizations(id uuid primary key);create table profiles(id uuid primary key,organization_id uuid);
 create table user_roles(user_id uuid,role text,organization_id uuid);
 create function current_org() returns uuid language sql stable security definer as $$select organization_id from profiles where id=auth.uid()$$;
 create function is_org_admin() returns boolean language sql stable security definer as $$select exists(select 1 from user_roles where user_id=auth.uid() and role='agency_admin' and organization_id=current_org())$$;
 create function is_superadmin() returns boolean language sql stable as $$select false$$;
 create table developments(id uuid primary key,organization_id uuid,name text,assigned_to uuid,deleted_at timestamptz);
 create function can_access_development(uuid,boolean default false) returns boolean language sql stable security definer as $$select exists(select 1 from developments where id=$1 and deleted_at is null and organization_id=current_org() and (assigned_to=auth.uid() or is_org_admin()))$$;
 create table properties(id uuid primary key,organization_id uuid,reference text,assigned_to uuid,status text,development_id uuid,cloned_from_property_id uuid,deleted_at timestamptz,deleted_by uuid,pre_delete_status text,created_by uuid,updated_by uuid,market text,publish_status text,published_at timestamptz);
 create table property_images(id uuid,property_id uuid,position int,created_at timestamptz);
 create table portal_publications(property_id uuid,portal_key text,enabled boolean,status text,primary key(property_id,portal_key));
 create table portal_listings(property_id uuid,portal text,status text);
 create table storia_development_units(id uuid,property_id uuid,development_id uuid);
 create table unit_queues(development_id uuid,operation text,property_id uuid);
 create function queue_storia_development(uuid,text,uuid default null,uuid default null) returns void language sql as $$insert into unit_queues values($1,$2,$4)$$;
 create table notifications(organization_id uuid,user_id uuid,type text,title text,body text,link text);
 create table audit_logs(organization_id uuid,actor_id uuid,action text,entity text,entity_id uuid,old_values jsonb,new_values jsonb);
 create schema net;create table kicks(n int);create function net.http_post(url text,headers jsonb,body jsonb) returns bigint language sql as $$insert into kicks values(1) returning 1::bigint$$;
 create function cron_nonce_issue(text) returns text language sql as $$select 'fake'$$;
 create sequence property_reference_seq;create function next_property_reference() returns text language sql as $$select 'HB-'||nextval('property_reference_seq')$$;
 grant usage on schema auth to authenticated;grant select,insert,update on properties,portal_publications to authenticated;grant select,update on developments to authenticated;grant select on profiles,organizations,property_images to authenticated;grant usage on sequence property_reference_seq to authenticated;
 alter table properties enable row level security;create policy own_properties on properties for all to authenticated using(organization_id=current_org() and (assigned_to=auth.uid() or is_org_admin())) with check(organization_id=current_org());
 insert into organizations values('${id(1)}'),('${id(2)}');insert into profiles values('${id(10)}','${id(1)}'),('${id(11)}','${id(1)}'),('${id(12)}','${id(1)}'),('${id(20)}','${id(2)}');insert into user_roles values('${id(12)}','agency_admin','${id(1)}');
 insert into developments values('${id(30)}','${id(1)}','MRM','${id(10)}',null);
 insert into properties(id,organization_id,reference,assigned_to,status,development_id,cloned_from_property_id,publish_status,published_at) values
 ('${id(40)}','${id(1)}','HB-1126','${id(10)}','active',null,null,'published',now()),
 ('${id(41)}','${id(1)}','HB-1390','${id(10)}','active','${id(30)}','${id(40)}','published',now()),
 ('${id(42)}','${id(1)}','HB-1391','${id(10)}','active','${id(30)}','${id(40)}','published',now());
 insert into portal_publications select '${id(41)}',p,true,'published' from unnest(array['storia','imove','agency_site']) p;
 insert into portal_publications values('${id(40)}','storia',true,'published');
 insert into storia_development_units values('${id(71)}','${id(41)}','${id(30)}');
 `);
 const deletion=readFileSync('drizzle/migrations/0095_property_soft_delete.sql','utf8');
 for(const fn of ['guard_property_soft_delete','delete_property']){
  const begin=deletion.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`);const end=deletion.indexOf('END $$;',begin);if(begin<0||end<0)throw new Error('Missing actual delete function');await db.exec(deletion.slice(begin,end+7));
 }
 await db.exec('create trigger properties_guard_soft_delete before update on properties for each row execute function guard_property_soft_delete();');
 for(const f of ['0303_ans6_clone_keeps_publish_status.sql','0304_ans7_development_clone_jobs.sql','0306_development_unit_operations.sql','0307_development_operation_enqueue_guard.sql','0308_development_operation_results.sql'])await db.exec(readFileSync('drizzle/migrations/'+f,'utf8'));
 await db.exec('create trigger development_unit_storia_change after update on properties for each row execute function development_unit_storia_change();');
});
afterAll(async()=>{await db.close();});

let jobId='';let original='';
it('pornește doar jobul, nu retrage sincron și nu modifică originalul',async()=>{
 await as(null);original=JSON.stringify((await db.query('select * from properties where id=$1',[id(40)])).rows);
 jobId=await start('withdraw');await as(null);
 expect((await db.query('select development_withdrawn_at from properties where id=$1',[id(41)])).rows[0]).toEqual({development_withdrawn_at:null});
 expect((await db.query('select total,processed,status,operation from development_clone_jobs where id=$1',[jobId])).rows[0]).toEqual({total:1,processed:0,status:'queued',operation:'withdraw'});
 expect((await db.query('select * from kicks')).rows).toHaveLength(1);
});
it('Retrage setează marcajul, debifează toate portalurile doar pe copie și notifică',async()=>{
 const j=await claim();await runUnitOperationOnce(j,workerDb,deps);await as(null);
 const p=(await db.query<{development_withdrawn_at:string;development_id:string}>('select development_withdrawn_at,development_id from properties where id=$1',[id(41)])).rows[0];
 expect(p?.development_withdrawn_at).toBeTruthy();expect(p?.development_id).toBe(id(30));
 expect((await db.query('select * from portal_publications where property_id=$1 and enabled',[id(41)])).rows).toEqual([]);
 expect(JSON.stringify((await db.query('select * from properties where id=$1',[id(40)])).rows)).toBe(original);
 expect((await db.query('select enabled from portal_publications where property_id=$1',[id(40)])).rows[0]).toEqual({enabled:true});
 expect((await db.query<{body:string}>('select body from notifications')).rows[0]?.body).toContain('1 unități procesate, 0 eșuate');
 expect((await db.query('select operation from unit_queues')).rows).toContainEqual({operation:'unit_withdraw'});
});
it('marcajul blochează republicarea automată și nu poate fi șters direct',async()=>{
 await as(null);await expect(db.query("update portal_publications set enabled=true where property_id=$1",[id(41)])).rejects.toThrow('Folosește Republică');
 await as(10);await expect(db.query('update properties set development_withdrawn_at=null where id=$1',[id(41)])).rejects.toThrow('Folosește operația');
});
it('clonarea unei unități retrase creează o copie independentă fără marcaj și păstrează publicarea din ans6',async()=>{
 await as(null);await db.query('insert into developments values($1,$2,$3,$4,null)',[id(31),id(1),'Alt ansamblu',id(10)]);
 await as(10);const r=await call<{copies:{copy_id:string}[]}>('clone_properties_to_development',[id(31),[id(41)]]);const copy=r.copies[0];if(!copy)throw new Error('Missing copy');
 expect((await db.query('select development_withdrawn_at,publish_status from properties where id=$1',[copy.copy_id])).rows[0]).toEqual({development_withdrawn_at:null,publish_status:'published'});
});
it('Republică șterge marcajul și readuce Storia, feed-urile și site-ul agenției',async()=>{
 await start('republish');const j=await claim();await runUnitOperationOnce(j,workerDb,deps);await as(null);
 expect((await db.query('select development_withdrawn_at from properties where id=$1',[id(41)])).rows[0]).toEqual({development_withdrawn_at:null});
 expect((await db.query<{portal_key:string}>('select portal_key from portal_publications where property_id=$1 and enabled order by portal_key',[id(41)])).rows.map(p=>p.portal_key)).toEqual(['agency_site','imove','storia']);
});
it('scoaterea folosește ștergerea existentă numai pentru copiile selectate și reia fără ștergere dublă',async()=>{
 await start('remove');const j=await claim();const pending=await workerDb.step(j.id);expect(pending?.propertyId).toBe(id(41));
 expect(await workerDb.step(j.id)).toEqual(pending);
 await runUnitOperationOnce(j,workerDb,deps);await as(null);
 expect((await db.query<{deleted_at:string}>('select deleted_at from properties where id=$1',[id(41)])).rows[0]?.deleted_at).toBeTruthy();
 expect((await db.query('select deleted_at from properties where id=$1',[id(42)])).rows[0]).toEqual({deleted_at:null});
 expect((await db.query('select * from audit_logs')).rows).toHaveLength(1);
 expect(JSON.stringify((await db.query('select * from properties where id=$1',[id(40)])).rows)).toBe(original);
});
it('refuză fără drepturi, originalele, alte agenții și joburile fabricate; RLS permite administratorul agenției',async()=>{
 await as(11);await expect(call('start_development_unit_operation',[id(30),[id(42)],'withdraw'])).rejects.toThrow('Nu ai drepturi');
 expect((await db.query('select * from development_clone_jobs')).rows).toEqual([]);
 await as(20);expect((await db.query('select * from development_clone_jobs')).rows).toEqual([]);
 await as(10);await expect(call('start_development_unit_operation',[id(30),[id(40)],'remove'])).rejects.toThrow('Unele copii');
 await expect(db.query("insert into development_clone_jobs(organization_id,development_id,requested_by,property_ids,total,operation) values($1,$2,$3,$4,1,'withdraw')",[id(1),id(30),id(10),[id(40)]])).rejects.toThrow('Folosește operația');
 await as(12);expect((await db.query('select * from development_clone_jobs')).rows).toHaveLength(3);
});
it('reverifică drepturile la reluare și trimite motivul eșecului',async()=>{
 const jid=await start('withdraw',[id(42)]);const j=await claim();await workerDb.step(jid);await as(null);
 await db.query('update developments set assigned_to=$1 where id=$2',[id(11),id(30)]);
 await runUnitOperationOnce(j,workerDb,deps);await as(null);
 expect((await db.query<{body:string}>('select body from notifications where body like $1',['%Nu mai ai drepturi%'])).rows[0]?.body).toContain('0 unități procesate, 1 eșuate');
});
it('erorile de portal se păstrează în rezultat și în notificarea finală',async()=>{
 await as(null);await db.query('update developments set assigned_to=$1 where id=$2',[id(10),id(30)]);
 const jid=await start('withdraw',[id(42)]);const j=await claim();
 await runUnitOperationOnce(j,workerDb,{...deps,applySelection:async()=>[{portalId:'storia',ok:false,message:'Conexiune indisponibilă'},{portalId:'agency_site',ok:true,message:null}]});await as(null);
 expect((await db.query<{result:{failed:{reason:string}[]}}> ('select result from development_clone_jobs where id=$1',[jid])).rows[0]?.result.failed).toHaveLength(1);
 expect((await db.query<{body:string}>('select body from notifications where body like $1',['%Conexiune indisponibilă%'])).rows[0]?.body).toContain('0 unități procesate, 1 eșuate');
});