import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {runDevelopmentPortalJob,applyDevelopmentPortalChanges,type DevelopmentPortalJob,type DevelopmentPortalJobDb,type DevelopmentPortalItem} from './portal-jobs';
let db:PGlite;
let migrationJobBefore:unknown;let migrationJobAfter:unknown;
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
 await db.query("insert into development_portal_jobs(id,organization_id,development_id,portal_key,enabled,requested_by,property_ids,total,status,processed,attempts,current_item,locked_until) values($1,$2,$3,'imove',true,$4,$5,2,'running',0,1,$6,now()+interval '2 minutes')",[id(90),id(1),id(30),id(10),[id(41),id(42)],JSON.stringify({index:0,propertyId:id(41),portals:['imove'],skip:false})]);
 migrationJobBefore=(await db.query('select to_jsonb(j) job from development_portal_jobs j where id=$1',[id(90)])).rows[0];
 await db.exec(readFileSync('drizzle/migrations/0346_development_portal_batch.sql','utf8'));
 migrationJobAfter=(await db.query("select to_jsonb(j)-'changes'-'batch_transaction' job from development_portal_jobs j where id=$1",[id(90)])).rows[0];
 await db.query('delete from development_portal_jobs where id=$1',[id(90)]);
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

type Change={portal_key:string;enabled:boolean};
async function batch(changes:Change[],eligible:string[]=['clickimob','imobli','storia']){
 await as(null);return safeCall<{ok:boolean;jobId:string|null;changes:Change[]}>('set_development_portal_selections',[id(30),id(10),JSON.stringify(changes),eligible]);
}
async function safeCall<T>(name:string,args:unknown[]){await db.exec('savepoint expected_call');try{const r=await call<T>(name,args);await db.exec('release savepoint expected_call');return r;}catch(e){await db.exec('rollback to savepoint expected_call;release savepoint expected_call');throw e;}}
async function isolated(run:()=>Promise<void>){await as(null);await db.exec('begin');try{await run();}finally{await db.exec('rollback');await as(null);}}
async function snapshots(){await as(null);return {
 selections:(await db.query('select * from development_portal_selections order by portal_key')).rows,
 jobs:(await db.query('select * from development_portal_jobs order by id')).rows,
 queues:(await db.query('select * from unit_queues')).rows,
 };}
const batchChanges:Change[]=[{portal_key:'clickimob',enabled:true},{portal_key:'imobli',enabled:true},{portal_key:'imove',enabled:false}];
it('migrarea păstrează integral jobul aflat în lucru înaintea aplicării ei',()=>{
 expect(migrationJobBefore).toBeDefined();expect(migrationJobAfter).toEqual(migrationJobBefore);
});
async function seedBatch(){await as(null);await db.exec('alter table development_portal_selections disable trigger development_portal_selection_changed');await as(10);await db.query("update development_portal_selections set enabled=true where development_id=$1 and portal_key='imove'",[id(30)]);await as(null);await db.exec('alter table development_portal_selections enable trigger development_portal_selection_changed');await db.exec("set habitoo.development_operation='on'");await db.query('update properties set development_withdrawn_at=null where development_id=$1',[id(30)]);await db.exec("set habitoo.development_operation='off'");}
const batchApply=vi.fn(async(input:Parameters<Parameters<typeof applyDevelopmentPortalChanges>[2]>[0])=>{
 await as(null);for(const s of input.data.selections)await db.query('insert into portal_publications(property_id,portal_key,enabled,status) values($1,$2,$3,$4) on conflict(property_id,portal_key) do update set enabled=excluded.enabled,status=excluded.status',[input.data.propertyId,s.portalId,s.enabled,s.enabled?'published':'disabled']);
 return {results:input.data.selections.map(s=>({portalId:s.portalId,ok:true,message:null}))};
});
async function drainBatch(){for(let i=0;i<20;i++){await as(null);const j=(await db.query<DevelopmentPortalJob>('select * from claim_development_portal_job()')).rows[0];if(!j)return;await runDevelopmentPortalJob(j,worker,(job,item)=>applyDevelopmentPortalChanges(job,item,batchApply));}throw new Error('Batch did not drain');}
it('trei modificări salvează trei selecții și un singur job, cu totalul unităților și o notificare',async()=>isolated(async()=>{
 await seedBatch();const before=await snapshots();await as(null);const unitCount=(await db.query<{n:number}>('select count(*)::int n from properties where development_id=$1 and deleted_at is null',[id(30)])).rows[0]?.n;
 const r=await batch(batchChanges);expect(r.changes).toEqual(batchChanges);expect(r.jobId).toBeTruthy();
 const after=await snapshots();expect(after.jobs).toHaveLength(before.jobs.length+1);
 expect((await db.query('select changes,total from development_portal_jobs where id=$1',[r.jobId])).rows[0]).toEqual({changes:batchChanges,total:unitCount});
 expect((await db.query('select portal_key,enabled from development_portal_selections where portal_key=any($1) order by portal_key',[batchChanges.map(c=>c.portal_key)])).rows).toEqual([{portal_key:'clickimob',enabled:true},{portal_key:'imobli',enabled:true},{portal_key:'imove',enabled:false}]);
 const notificationsBefore=(await db.query('select * from notifications')).rows.length;batchApply.mockClear();
 const j=(await db.query<DevelopmentPortalJob>('select * from claim_development_portal_job()')).rows[0];if(!j)throw new Error('Missing batch');
 await runDevelopmentPortalJob(j,worker,(job,item)=>applyDevelopmentPortalChanges(job,item,batchApply));
 await as(null);expect((await db.query('select processed from development_portal_jobs where id=$1',[r.jobId])).rows[0]).toEqual({processed:1});
 expect(batchApply.mock.calls.flatMap(([v])=>v.data.selections)).toEqual([{portalId:'clickimob',enabled:true},{portalId:'imobli',enabled:true},{portalId:'imove',enabled:false}]);
 await drainBatch();await as(null);const notes=(await db.query<{body:string}>('select body from notifications')).rows;expect(notes).toHaveLength(notificationsBefore+1);expect(notes.at(-1)?.body).toContain('clickimob, imobli, imove');await drainBatch();expect((await db.query('select * from notifications')).rows).toHaveLength(notificationsBefore+1);
}));
it('portalul neeligibil și Storia fără cont anulează toate selecțiile și jobul',async()=>isolated(async()=>{
 const before=await snapshots();await expect(batch([{portal_key:'clickimob',enabled:true},{portal_key:'bad-portal',enabled:true}])).rejects.toThrow('bad-portal: Portalul nu este eligibil');
 expect(await snapshots()).toEqual(before);
 await as(null);await db.exec("update portal_connections set status='disconnected';alter table development_portal_selections disable trigger development_portal_selection_changed");await as(10);await db.exec("update development_portal_selections set enabled=false where portal_key='storia'");await as(null);await db.exec('alter table development_portal_selections enable trigger development_portal_selection_changed');
 const disconnected=await snapshots();await expect(batch([{portal_key:'clickimob',enabled:true},{portal_key:'storia',enabled:true}])).rejects.toThrow('storia: Conectează contul dezvoltator Storia');expect(await snapshots()).toEqual(disconnected);
}));
it('o operație activă refuză întregul lot, inclusiv un lot fără efect',async()=>isolated(async()=>{
 await batch([{portal_key:'clickimob',enabled:true}]);const before=await snapshots();await expect(batch([{portal_key:'imobli',enabled:true}])).rejects.toThrow('O operație este deja în curs pentru acest ansamblu.');await expect(batch([{portal_key:'clickimob',enabled:true}])).rejects.toThrow('O operație este deja în curs');expect(await snapshots()).toEqual(before);
}));
it('modificările fără efect nu scriu selecții și nu creează job, inclusiv o debifare nesalvată',async()=>isolated(async()=>{
 const before=await snapshots();const r=await batch([{portal_key:'storia',enabled:true},{portal_key:'never-selected',enabled:false}]);expect(r).toEqual({ok:true,jobId:null,changes:[]});expect(await snapshots()).toEqual(before);
}));
it('lotul cu Storia solicită fluxul existent exact o dată',async()=>isolated(async()=>{
 const before=await snapshots();await batch([{portal_key:'clickimob',enabled:true},{portal_key:'storia',enabled:false}]);const after=await snapshots();expect(after.jobs).toHaveLength(before.jobs.length+1);expect(after.queues).toHaveLength(before.queues.length+1);expect(after.queues.at(-1)).toMatchObject({development_id:id(30),operation:'withdraw'});
}));
it('unitatea retrasă sare bifările, dar aplică debifarea',async()=>isolated(async()=>{
 await seedBatch();await as(null);await db.exec("set habitoo.development_operation='on'");await db.query('update properties set development_withdrawn_at=now() where id=$1',[id(41)]);await db.exec("set habitoo.development_operation='off'");await batch(batchChanges);
 await as(null);const j=(await db.query<DevelopmentPortalJob>('select * from claim_development_portal_job()')).rows[0];if(!j)throw new Error('Missing job');const item=await worker.step(j.id);expect(item).toMatchObject({propertyId:id(41),skip:false,changes:[{portal_key:'imove',enabled:false}]});batchApply.mockClear();await runDevelopmentPortalJob(j,worker,(job,i)=>applyDevelopmentPortalChanges(job,i,batchApply));expect(batchApply.mock.calls.flatMap(([v])=>v.data.selections)).toEqual([{portalId:'imove',enabled:false}]);
}));
it('workerul nou reia un job vechi în lucru, cu current_item fără listă',async()=>isolated(async()=>{
 await toggle('imove',false);await as(null);const j=(await db.query<DevelopmentPortalJob>('select * from claim_development_portal_job()')).rows[0];if(!j)throw new Error('Missing legacy job');expect(j.changes).toBeNull();
 await db.query('update development_portal_jobs set current_item=$2 where id=$1',[j.id,JSON.stringify({index:0,propertyId:id(41),reference:'HB-1390',portals:['imove'],skip:false})]);
 batchApply.mockClear();await runDevelopmentPortalJob(j,worker,(job,i)=>applyDevelopmentPortalChanges(job,i,batchApply));await drainBatch();await as(null);expect((await db.query('select status,processed,total from development_portal_jobs where id=$1',[j.id])).rows[0]).toMatchObject({status:'done'});expect(batchApply.mock.calls.every(([v])=>v.superadmin&&v.data.selections.length===1&&v.data.selections[0]?.portalId==='imove')).toBe(true);
}));
it('RPC-ul de lot refuză authenticated/anon și reverifică accesul actorului',async()=>isolated(async()=>{
 const before=await snapshots();await as(10);await expect(safeCall('set_development_portal_selections',[id(30),id(10),JSON.stringify(batchChanges),['clickimob','imobli']])).rejects.toThrow('permission denied');await as(null);await db.exec('set role anon');await expect(safeCall('set_development_portal_selections',[id(30),id(10),'[]',[]])).rejects.toThrow('permission denied');await as(null);await expect(safeCall('set_development_portal_selections',[id(30),id(20),JSON.stringify(batchChanges),['clickimob','imobli']])).rejects.toThrow('Nu ai drepturi');expect(await snapshots()).toEqual(before);
}));
it('DB refuză un lot gol, peste 50 sau cu portal duplicat, fără nicio scriere',async()=>isolated(async()=>{
 const before=await snapshots();await expect(batch([])).rejects.toThrow('între 1 și 50');await expect(batch(Array.from({length:51},(_,i)=>({portal_key:`p-${i}`,enabled:false})))).rejects.toThrow('între 1 și 50');await expect(batch([{portal_key:'clickimob',enabled:true},{portal_key:'clickimob',enabled:false}])).rejects.toThrow('o singură dată');expect(await snapshots()).toEqual(before);
}));
it('lotul reține numai modificările efective',async()=>isolated(async()=>{
 const r=await batch([{portal_key:'storia',enabled:true},{portal_key:'clickimob',enabled:true},{portal_key:'never-selected',enabled:false}]);expect(r.changes).toEqual([{portal_key:'clickimob',enabled:true}]);await as(null);expect((await db.query('select changes from development_portal_jobs where id=$1',[r.jobId])).rows[0]).toEqual({changes:[{portal_key:'clickimob',enabled:true}]});
}));
it('pasul sare unitățile șterse, mutate sau din altă agenție',async()=>isolated(async()=>{
 const r=await batch([{portal_key:'clickimob',enabled:true}]);await as(null);const j=(await db.query<DevelopmentPortalJob>('select * from claim_development_portal_job()')).rows[0];if(!j)throw new Error('Missing job');
 for(const state of ['deleted','moved','other-org']){
  await db.exec('savepoint membership');await db.exec('alter table properties disable trigger all');
  if(state==='deleted')await db.query('update properties set deleted_at=now() where id=$1',[id(41)]);
  if(state==='moved')await db.query('update properties set development_id=null where id=$1',[id(41)]);
  if(state==='other-org')await db.query('update properties set organization_id=$2 where id=$1',[id(41),id(2)]);
  await db.exec('alter table properties enable trigger all');expect(await worker.step(j.id)).toMatchObject({propertyId:id(41),skip:true});await db.exec('rollback to savepoint membership;release savepoint membership');
 }
 expect(r.jobId).toBe(j.id);
}));
