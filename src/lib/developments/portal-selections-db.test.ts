import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {runDevelopmentPortalJob,type DevelopmentPortalJob,type DevelopmentPortalJobDb,type DevelopmentPortalItem} from './portal-jobs';
let db:PGlite;
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function as(uid:number|null){await db.exec(`reset role;set request.jwt.claim.sub='';set request.jwt.claims='{}';set test.uid='${uid===null?'':id(uid)}';${uid===null?'':'set role authenticated;'}`);}
async function call<T>(name:string,args:unknown[]=[]) {const r=await db.query<{r:T}>(`select ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) r`,args);const row=r.rows[0];if(!row)throw new Error('Missing RPC result');return row.r;}
const worker:DevelopmentPortalJobDb={step:async j=>{await as(null);return call<DevelopmentPortalItem|null>('development_portal_job_step',[j]);},advance:async(j,i,r)=>{await as(null);await call('development_portal_job_advance',[j,i,r]);},release:async j=>{await as(null);await call('development_portal_job_release',[j]);},finish:async(j,r)=>{await as(null);await call('development_portal_job_finish',[j,r]);}};
async function toggle(key:string,enabled:boolean){await as(10);await db.query('insert into development_portal_selections(development_id,portal_key,enabled) values($1,$2,$3) on conflict(development_id,portal_key) do update set enabled=excluded.enabled',[id(30),key,enabled]);}
const apply=vi.fn(async(j:DevelopmentPortalJob,item:DevelopmentPortalItem)=>{await as(null);await db.query('insert into portal_publications(property_id,portal_key,enabled,status) values($1,$2,$3,$4) on conflict(property_id,portal_key) do update set enabled=excluded.enabled,status=excluded.status',[item.propertyId,j.portal_key,j.enabled,j.enabled?'published':'disabled']);return [{ok:true,message:null}];});
async function drain(){for(let i=0;i<10;i++){await as(null);const r=await db.query<DevelopmentPortalJob>('select * from claim_development_portal_job()');const j=r.rows[0];if(!j)return;await runDevelopmentPortalJob(j,worker,apply);}throw new Error('Job did not drain');}
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
 create table developments(id uuid primary key,organization_id uuid,name text,assigned_to uuid,deleted_at timestamptz,status text default 'active');
 create function can_access_development(uuid,boolean default false) returns boolean language sql stable security definer as $$select exists(select 1 from developments where id=$1 and deleted_at is null and organization_id=current_org() and (assigned_to=auth.uid() or is_org_admin()))$$;
 create table properties(id uuid primary key,organization_id uuid,reference text,assigned_to uuid,status text,development_id uuid,cloned_from_property_id uuid,deleted_at timestamptz,deleted_by uuid,pre_delete_status text,created_by uuid,updated_by uuid,market text,publish_status text,published_at timestamptz);
 create table property_images(id uuid,property_id uuid,position int,created_at timestamptz);
 create table portal_publications(property_id uuid,portal_key text,enabled boolean,status text,primary key(property_id,portal_key));
 create table portal_listings(property_id uuid,portal text,status text);
 create table portal_connections(id uuid primary key,organization_id uuid,portal text,portal_credentials_encrypted text,status text);
 create table development_portal_publications(development_id uuid,organization_id uuid,portal text default 'storia',desired_active boolean,connection_id uuid,updated_at timestamptz default now(),unique(development_id,portal));
 create table sync_requests(org uuid);create function partner_api_enqueue_sync(uuid[]) returns void language sql as $$insert into sync_requests select unnest($1)$$;
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
 insert into developments(id,organization_id,name,assigned_to) values('${id(30)}','${id(1)}','MRM','${id(10)}');
 insert into portal_connections values('${id(80)}','${id(1)}','storia_developer','encrypted','connected');
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
 const request=readFileSync('drizzle/migrations/0300_ans4_storia_clone_not_move.sql','utf8');await db.exec(request.slice(0,request.indexOf('CREATE OR REPLACE FUNCTION public.claim_storia')));
 await db.exec("create function has_role(uuid,text) returns boolean language sql stable security definer as $$select exists(select 1 from user_roles where user_id=$1 and role=$2)$$;");
 const access=readFileSync('drizzle/migrations/0292_ans1_developments.sql','utf8');const accessStart=access.indexOf('CREATE FUNCTION public.can_access_development');const accessEnd=access.indexOf('REVOKE ALL ON FUNCTION public.can_access_development',accessStart);
 await db.exec(access.slice(accessStart,accessEnd).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 await db.exec(readFileSync('drizzle/migrations/0309_development_portal_selections.sql','utf8'));
});
afterAll(async()=>{await db.close();});


it('migrarea preia numai portalurile bifate ale unităților, fără operații la lansare',async()=>{
 await as(null);
 expect((await db.query('select portal_key,enabled from development_portal_selections order by portal_key')).rows).toEqual([{portal_key:'agency_site',enabled:true},{portal_key:'imove',enabled:true},{portal_key:'storia',enabled:true}]);
 expect((await db.query('select * from development_portal_jobs')).rows).toEqual([]);
 expect((await db.query('select * from kicks')).rows).toEqual([]);
});
it('debifarea pornește doar jobul, retrage acel portal de pe toate unitățile și notifică o singură dată',async()=>{
 await toggle('imove',false);await as(null);
 expect((await db.query('select enabled from portal_publications where property_id=$1 and portal_key=$2',[id(41),'imove'])).rows[0]).toEqual({enabled:true});
 expect((await db.query('select total,processed,status from development_portal_jobs')).rows[0]).toEqual({total:2,processed:0,status:'queued'});
 await drain();await as(null);
 expect((await db.query("select * from portal_publications where property_id=any($1) and portal_key='imove' and enabled",[[id(41),id(42)]])).rows).toEqual([]);
 expect((await db.query('select enabled from portal_publications where property_id=$1',[id(40)])).rows[0]).toEqual({enabled:true});
 expect((await db.query<{body:string}>('select body from notifications')).rows[0]?.body).toContain('2 unități procesate, 0 sărite, 0 eșuate');
 await drain();expect((await db.query('select * from notifications')).rows).toHaveLength(1);
});
it('bifarea sare peste unitățile retrase manual inclusiv la reluarea elementului persistent',async()=>{
 await toggle('imove',true);await as(null);const j=(await db.query<DevelopmentPortalJob>('select * from claim_development_portal_job()')).rows[0];if(!j)throw new Error('Missing job');
 await worker.step(j.id);await as(null);await db.exec("set habitoo.development_operation='on'");await db.query('update properties set development_withdrawn_at=now() where id=$1',[id(41)]);await db.exec("set habitoo.development_operation='off'");
 apply.mockClear();await runDevelopmentPortalJob(j,worker,apply);await drain();await as(null);
 expect(apply.mock.calls.map(c=>c[1].propertyId)).toEqual([id(42)]);
 expect((await db.query<{development_withdrawn_at:string|null}>('select development_withdrawn_at from properties where id=$1',[id(41)])).rows[0]?.development_withdrawn_at).toBeTruthy();
 expect((await db.query<{body:string}>('select body from notifications order by body')).rows.some(r=>r.body.includes('1 unități procesate, 1 sărite, 0 eșuate'))).toBe(true);
});
it('Storia checkbox și butoanele vechi păstrează fluxul părintelui fără dublare de job',async()=>{
 await toggle('storia',false);await as(null);
 expect((await db.query("select operation from unit_queues where operation='withdraw'")).rows).toHaveLength(1);
 expect((await db.query("select * from development_portal_jobs where portal_key='storia'")).rows).toHaveLength(1);
 await drain();await as(10);await call('request_storia_development',[id(30),false]);await as(null);
 expect((await db.query("select enabled from development_portal_selections where portal_key='storia'")).rows[0]).toEqual({enabled:true});
 await drain();
});
it('RLS refuză alt agent și altă agenție, permite administratorul, blochează metadata falsă',async()=>{
 await as(11);expect((await db.query('select * from development_portal_selections')).rows).toEqual([]);await expect(db.query('insert into development_portal_selections values($1,$2,true,null,now())',[id(30),'clickimob'])).rejects.toThrow();
 await as(20);expect((await db.query('select * from development_portal_jobs')).rows).toEqual([]);
 await as(12);expect((await db.query('select * from development_portal_selections')).rows).toHaveLength(3);
 await db.query('update development_portal_selections set updated_by=$1 where development_id=$2',[id(20),id(30)]);
 expect((await db.query('select distinct updated_by from development_portal_selections')).rows).toEqual([{updated_by:id(12)}]);
});
it('agentul cu acces doar la unitate vede selecțiile, dar nu poate modifica portalurile ansamblului',async()=>{
 await as(null);await db.query('update properties set assigned_to=$1 where id=$2',[id(11),id(42)]);
 await as(11);expect((await db.query('select * from development_portal_selections')).rows).toHaveLength(3);
 expect(await call<boolean>('can_access_development',[id(30),true])).toBe(false);
 await expect(db.query("insert into development_portal_selections(development_id,portal_key,enabled) values($1,'cauta',true)",[id(30)])).rejects.toThrow();
 await as(null);await db.query('update properties set assigned_to=$1 where id=$2',[id(10),id(42)]);
});
it('copiile noi nu pot bifa un portal neales și clonarea păstrează originalul',async()=>{
 await as(null);await db.query('insert into properties(id,organization_id,reference,assigned_to,status,publish_status) values($1,$2,$3,$4,$5,$6)',[id(43),id(1),'HB-100',''+id(10),'active','published']);
 await as(10);const r=await call<{copies:{copy_id:string}[]}>('clone_properties_to_development',[id(30),[id(43)]]);expect(r.copies).toHaveLength(1);
 const copy=r.copies[0];if(!copy)throw new Error('Missing copy');
 expect((await db.query('select * from portal_publications where property_id=$1',[copy.copy_id])).rows).toEqual([]);
 await as(null);await expect(db.query("insert into portal_publications values($1,'clickimob',true,'published')",[id(42)])).rejects.toThrow('Portalul nu este bifat');
 expect((await db.query('select development_id from properties where id=$1',[id(40)])).rows[0]).toEqual({development_id:null});
});
