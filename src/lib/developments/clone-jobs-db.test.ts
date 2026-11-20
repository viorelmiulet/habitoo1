import {beforeAll,afterAll,it,expect} from 'vitest';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
let db:PGlite;const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const as=async(uid:number,org:number)=>db.exec(`reset role;set test.uid='${id(uid)}';set test.org='${id(org)}';set role authenticated;`);
const svc=async()=>db.exec(`reset role;set test.uid='';set test.org='';`);
beforeAll(async()=>{db=new PGlite();await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema cron;
create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('test.uid',true),''),nullif(current_setting('request.jwt.claim.sub',true),''))::uuid$$;
create function current_org() returns uuid language plpgsql stable security definer as $$begin return coalesce(nullif(current_setting('test.org',true),'')::uuid,(select organization_id from profiles where id=auth.uid()));end$$;create function is_org_admin() returns boolean language sql stable as $$select false$$;create table private_listing_imports(property_id uuid,organization_id uuid,imported_by uuid);create table notifications(id uuid primary key default gen_random_uuid(),organization_id uuid,user_id uuid,type text,title text,body text,link text);create schema net;create table kicks(n int);create function net.http_post(url text,headers jsonb,body jsonb) returns bigint language sql as $$insert into kicks values(1) returning 1::bigint$$;create function cron_nonce_issue(text) returns text language sql as $$select 'n'$$;grant insert on kicks to authenticated;grant usage on schema net to authenticated;
create function is_superadmin() returns boolean language sql stable as $$select false$$;create type app_role as enum('superadmin','agency_admin','agent');create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
create sequence property_reference_seq start 5000;create function next_property_reference() returns text language sql security definer as $$select 'HB-'||nextval('property_reference_seq')$$;
create table organizations(id uuid primary key);create table profiles(id uuid primary key,organization_id uuid,is_active boolean);
create table properties(id uuid primary key default gen_random_uuid(),organization_id uuid,reference text,external_id text,source text,title text,assigned_to uuid,deleted_at timestamptz,deleted_by uuid,pre_delete_status text,status text,for_sale boolean,sale_price numeric,sale_currency text,currency text,for_rent boolean,rent_price numeric,rent_currency text,rooms int,features text[],created_at timestamptz default now(),updated_at timestamptz default now(),created_by uuid,updated_by uuid,publish_status text default 'unpublished',published_at timestamptz,archived_at timestamptz,archived_by uuid,pre_archive_status text);
create table property_images(id uuid primary key default gen_random_uuid(),organization_id uuid,property_id uuid,url text,position int,is_primary boolean,is_confidential boolean,include_in_publish boolean,alt text,width int,height int,storage_path text,source_url text,created_at timestamptz default now(),created_by uuid,updated_by uuid);
create table portal_connections(id uuid primary key,organization_id uuid,portal text,status text,portal_credentials_encrypted text);create table portal_publications(property_id uuid,portal_key text,enabled boolean);create table portal_listings(property_id uuid,portal text,external_id text);create table portal_publish_jobs(status text,contact_update_requested_by uuid);
create function portal_publish_arm() returns void language sql as $$select$$;create function portal_publish_kick() returns void language sql as $$select$$;
grant usage on schema auth to authenticated;grant select,insert,update on properties,property_images to authenticated;grant select on organizations,profiles,portal_publications,portal_listings to authenticated;
alter table properties enable row level security;create policy p_sel on properties for select to authenticated using (organization_id=current_org() and assigned_to=auth.uid());create policy p_ins on properties for insert to authenticated with check (organization_id=current_org());create policy p_upd on properties for update to authenticated using (organization_id=current_org());
alter table property_images enable row level security;create policy i_all on property_images for all to authenticated using (organization_id=current_org()) with check (organization_id=current_org());`);
for(const f of ['0292_ans1_developments.sql','0293_ans1_gallery_and_guards.sql','0294_ans1_batch_summaries.sql','0295_ans2_storia_primary_market.sql','0296_ans2_storia_selection_guards.sql','0297_ans2_storia_cleanup_tracking.sql','0300_ans4_storia_clone_not_move.sql','0301_ans4_storia_clone_public_url.sql','0302_ans5_clone_properties_to_development.sql','0303_ans6_clone_keeps_publish_status.sql','0304_ans7_development_clone_jobs.sql','0305_ans7_clone_kick_grant.sql'])await db.exec(readFileSync('drizzle/migrations/'+f,'utf8'));
await db.exec(`insert into organizations values('${id(1)}'),('${id(2)}');insert into profiles values('${id(10)}','${id(1)}',true),('${id(11)}','${id(1)}',true),('${id(20)}','${id(2)}',true);
insert into developments(id,organization_id,name,assigned_to,status) values('${id(30)}','${id(1)}','Parcul Verde','${id(10)}','active');
insert into properties(id,organization_id,reference,title,assigned_to,status,market,publish_status) select ('00000000-0000-4000-8000-'||lpad((100+g)::text,12,'0'))::uuid,'${id(1)}','HB-'||(100+g),'A'||g,'${id(10)}','active','secondary','published' from generate_series(1,12) g;
insert into property_images(organization_id,property_id,url,position,is_primary,is_confidential,include_in_publish,storage_path) values('${id(1)}','${id(101)}','x',0,true,false,true,'${id(1)}/${id(101)}/a.jpg');`);
});afterAll(async()=>db.close());
const ids=Array.from({length:12},(_,i)=>id(101+i));let jobId='';
const step=async()=>(await db.query<{r:{index:number;copies:{copy_id:string}[];files:unknown[]}|null}>('select development_clone_job_step($1) r',[jobId])).rows[0]!.r;
it('pornirea creează doar jobul, fără clonare sincronă, și trezește worker-ul',async()=>{
 await as(10,1);const {rows:[r]}=await db.query<{j:string}>('select start_development_clone_job($1,$2) j',[id(30),ids]);jobId=r!.j;
 const {rows:[j]}=await db.query<Record<string,unknown>>('select status,total,processed,requested_by from development_clone_jobs where id=$1',[jobId]);
 expect(j).toEqual({status:'queued',total:12,processed:0,requested_by:id(10)});
 await svc();expect((await db.query('select 1 from properties where development_id is not null')).rows).toHaveLength(0);
 expect((await db.query('select 1 from kicks')).rows).toHaveLength(1);
});
it('worker: rulează ca cel care a cerut, reia elementul în curs fără dubluri și notifică la final',async()=>{
 await svc();await db.query('select * from claim_development_clone_job(120)');
 const a=await step();expect(a!.index).toBe(0);expect(a!.files).toHaveLength(1);
 const again=await step();expect(again).toEqual(a); // întrerupere înainte de commit: același element, fără clonă nouă
 expect((await db.query('select 1 from properties where development_id=$1',[id(30)])).rows).toHaveLength(1);
 const {rows:[c]}=await db.query<{created_by:string}>('select created_by from properties where id=$1',[a!.copies[0]!.copy_id]);expect(c!.created_by).toBe(id(10));
 await db.query('select development_clone_job_advance($1,0,$2,1)',[jobId,JSON.stringify([{copy_id:'x',portal:'p',reason:'fără slot'}])]);
 await db.query('select development_clone_job_advance($1,0,$2,1)',[jobId,'[]']); // dublu commit ignorat
 for(let i=1;i<12;i++){const it2=await step();await db.query('select development_clone_job_advance($1,$2,$3,0)',[jobId,it2!.index,'[]']);}
 expect(await step()).toBeNull();
 await db.query('select development_clone_job_finish($1,null)',[jobId]);
 const {rows:[j]}=await db.query<{status:string;processed:number;result:{copies:unknown[];photoErrors:number}}>('select status,processed,result from development_clone_jobs where id=$1',[jobId]);
 expect(j!.status).toBe('done');expect(j!.processed).toBe(12);expect(j!.result.copies).toHaveLength(12);expect(j!.result.photoErrors).toBe(1);
 expect((await db.query('select 1 from properties where development_id=$1',[id(30)])).rows).toHaveLength(12);
 const {rows:[n]}=await db.query<{user_id:string;body:string;link:string}>('select user_id,body,link from notifications');
 expect(n).toEqual({user_id:id(10),body:'Alocarea la ansamblul Parcul Verde s-a terminat: 12 copii create, 0 sărite. 1 portaluri nebifate. Erori la 1 poze.',link:`/app/developments/${id(30)}?tab=units`});
});
it('un job nou pentru aceleași anunțuri le sare ca „deja în ansamblu"',async()=>{
 await as(10,1);const {rows:[r]}=await db.query<{j:string}>('select start_development_clone_job($1,$2) j',[id(30),[id(101)]]);jobId=r!.j;
 await svc();await db.query('select * from claim_development_clone_job(120)');const s=await step() as unknown as {skipped:{reason:string}[]};
 expect(s.skipped[0]!.reason).toBe('deja în ansamblu');
});
it('eșecul trimite notificarea cu motivul',async()=>{
 await svc();await db.query('select development_clone_job_finish($1,$2)',[jobId,'Nu ai drepturi']);
 const {rows}=await db.query<{body:string}>("select body from notifications where body like '%eșuat%'");expect(rows[0]!.body).toContain('a eșuat: Nu ai drepturi');
});
it('alt agent sau altă agenție nu poate porni sau vedea joburile',async()=>{
 await as(20,2);await expect(db.query('select start_development_clone_job($1,$2)',[id(30),[id(101)]])).rejects.toThrow('Nu ai drepturi');
 expect((await db.query('select * from development_clone_jobs')).rows).toEqual([]);
 await as(11,1);await expect(db.query('select start_development_clone_job($1,$2)',[id(30),[id(101)]])).rejects.toThrow('Nu ai drepturi');
 expect((await db.query('select * from development_clone_jobs')).rows).toEqual([]);
 await as(10,1);expect((await db.query('select * from development_clone_jobs')).rows).toHaveLength(2);
});
