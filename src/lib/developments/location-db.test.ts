import {beforeAll,afterAll,it,expect} from 'vitest';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
let db:PGlite;const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const as=async(uid:number,org:number)=>db.exec(`reset role;set test.uid='${id(uid)}';set test.org='${id(org)}';set role authenticated;`);
const LOC='county,city,county_siruta_code,uat_siruta_code,locality_siruta_code,district,street,street_number,address,lat,lng,location_precise,postal_code,postal_code_source,postal_code_resolved_at,postal_code_resolved_from';
const row=async(n:number|string)=>{await db.exec('reset role');return (await db.query<Record<string,unknown>>(`select ${LOC},sale_price from properties where id=$1`,[typeof n==='number'?id(n):n])).rows[0]!;};
const migration=readdirSync('drizzle/migrations').find(f=>f.endsWith('_development_units_location.sql'))!;
beforeAll(async()=>{db=new PGlite();await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema cron;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function current_org() returns uuid language sql stable as $$select nullif(current_setting('test.org',true),'')::uuid$$;
create function is_superadmin() returns boolean language sql stable as $$select false$$;create type app_role as enum('superadmin','agency_admin','agent');create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
create sequence property_reference_seq start 5000;create function next_property_reference() returns text language sql security definer as $$select 'HB-'||nextval('property_reference_seq')$$;
create table organizations(id uuid primary key);create table profiles(id uuid primary key,organization_id uuid,is_active boolean);
create table ro_localities(siruta_code integer primary key,postal_code text);insert into ro_localities values(179258,'077040'),(1,'12345');
create table properties(id uuid primary key default gen_random_uuid(),organization_id uuid,reference text,external_id text,source text,title text,assigned_to uuid,deleted_at timestamptz,deleted_by uuid,pre_delete_status text,status text,for_sale boolean,sale_price numeric,sale_currency text,currency text,for_rent boolean,rent_price numeric,rent_currency text,rooms int,features text[],created_at timestamptz default now(),updated_at timestamptz default now(),created_by uuid,updated_by uuid,publish_status text default 'unpublished',published_at timestamptz,archived_at timestamptz,archived_by uuid,pre_archive_status text,
 county text,city text,county_siruta_code int,uat_siruta_code int,locality_siruta_code int,district text,street text,street_number text,address text,lat double precision,lng double precision,location_precise boolean default false,postal_code text,postal_code_source text,postal_code_resolved_at timestamptz,postal_code_resolved_from text,address_building text);
create table property_images(id uuid primary key default gen_random_uuid(),organization_id uuid,property_id uuid,url text,position int,is_primary boolean,is_confidential boolean,include_in_publish boolean,alt text,width int,height int,storage_path text,source_url text,created_at timestamptz default now(),created_by uuid,updated_by uuid);
create table portal_connections(id uuid primary key,organization_id uuid,portal text,status text,portal_credentials_encrypted text);create table portal_publications(property_id uuid,portal_key text,enabled boolean);create table portal_listings(property_id uuid,portal text,external_id text);create table portal_publish_jobs(status text,contact_update_requested_by uuid);
create function portal_publish_arm() returns void language sql as $$select$$;create function portal_publish_kick() returns void language sql as $$select$$;
grant usage on schema auth to authenticated;grant select,insert,update on properties,property_images to authenticated;grant select on organizations,profiles,portal_publications,portal_listings to authenticated;
alter table properties enable row level security;create policy p_sel on properties for select to authenticated using (organization_id=current_org() and assigned_to=auth.uid());create policy p_ins on properties for insert to authenticated with check (organization_id=current_org());create policy p_upd on properties for update to authenticated using (organization_id=current_org() and assigned_to=auth.uid());
alter table property_images enable row level security;create policy i_all on property_images for all to authenticated using (organization_id=current_org()) with check (organization_id=current_org());`);
for(const f of ['0292_ans1_developments.sql','0293_ans1_gallery_and_guards.sql','0294_ans1_batch_summaries.sql','0295_ans2_storia_primary_market.sql','0296_ans2_storia_selection_guards.sql','0297_ans2_storia_cleanup_tracking.sql','0300_ans4_storia_clone_not_move.sql','0301_ans4_storia_clone_public_url.sql','0302_ans5_clone_properties_to_development.sql','0303_ans6_clone_keeps_publish_status.sql',migration])await db.exec(readFileSync('drizzle/migrations/'+f,'utf8'));
await db.exec(`grant update on developments to authenticated;
insert into organizations values('${id(1)}');insert into profiles values('${id(10)}','${id(1)}',true),('${id(11)}','${id(1)}',true);
insert into developments(id,organization_id,name,assigned_to,status,county,city,locality_siruta_code,district,street,street_number,address,lat,lng,location_precise) values('${id(30)}','${id(1)}','MRM','${id(10)}','active','Ilfov','Chiajna',179258,'Militari','','','',44.4,25.9,false),('${id(31)}','${id(1)}','Incomplet','${id(10)}','active','Ilfov',null,null,null,null,null,null,null,null,false);
insert into properties(id,organization_id,reference,title,assigned_to,status,for_sale,sale_price,rooms,features,market,county,city,locality_siruta_code,street,street_number,lat,lng,postal_code,postal_code_source,address_building) values
('${id(40)}','${id(1)}','HB-1','Original','${id(10)}','active',true,1,2,'{}','secondary','Cluj','Cluj-Napoca',1,'Strada X','5',46.7,23.6,'400001','manual','B1'),
('${id(41)}','${id(1)}','HB-2','Identic','${id(10)}','active',true,1,2,'{}','secondary','Ilfov','Chiajna',179258,null,null,44.4,25.9,'077041','manual',null),
('${id(42)}','${id(1)}','HB-3','Fără ansamblu','${id(10)}','active',true,1,2,'{}','secondary','Cluj','Cluj-Napoca',1,'Strada Y','1',46.7,23.6,null,null,null);`);
});afterAll(async()=>db.close());
const clone=async(o:number)=>{await as(10,1);const {rows:[r]}=await db.query<{r:{copies:{copy_id:string}[]}}>('select clone_properties_to_development($1,$2) r',[id(30),[id(o)]]);return r!.r.copies[0]!.copy_id;};
let copy='';
it('copia preia locația ansamblului, originalul rămâne neschimbat, codul poștal devine al localității',async()=>{
 const before=await row(40);copy=await clone(40);expect(await row(40)).toEqual(before);
 expect(await row(copy)).toMatchObject({county:'Ilfov',city:'Chiajna',locality_siruta_code:179258,district:'Militari',street:null,street_number:null,address:null,lat:44.4,lng:25.9,postal_code:'077040',postal_code_source:'approximate',postal_code_resolved_at:null,postal_code_resolved_from:null});
 await db.exec('reset role');expect((await db.query('select address_building from properties where id=$1',[copy])).rows[0]).toEqual({address_building:'B1'});
});
it('locație identică: codul poștal rămâne neatins',async()=>{const c=await clone(41);expect(await row(c)).toMatchObject({postal_code:'077041',postal_code_source:'manual'});});
it('UPDATE cu altă locație rămâne pe ansamblu; UPDATE doar pe preț nu aliniază',async()=>{
 await as(10,1);await db.exec(`update properties set city='Iași',lat=1,lng=2 where id='${copy}'`);expect(await row(copy)).toMatchObject({city:'Chiajna',lat:44.4,lng:25.9});
 await db.exec(`reset role;alter table properties disable trigger properties_a_development_location;update properties set city='Altă' where id='${copy}';alter table properties enable trigger properties_a_development_location;`);
 await as(10,1);await db.exec(`update properties set sale_price=99 where id='${copy}'`);expect(await row(copy)).toMatchObject({city:'Altă',sale_price:'99'});
});
it('funcția de aliniere: întoarce numărul, a doua rulare 0, refuzată pentru authenticated',async()=>{
 await db.exec('reset role');expect((await db.query<{n:number}>('select align_development_units_location($1) n',[id(30)])).rows[0]!.n).toBe(1);
 expect((await db.query<{n:number}>('select align_development_units_location($1) n',[id(30)])).rows[0]!.n).toBe(0);
 await as(10,1);await expect(db.query('select align_development_units_location($1)',[id(30)])).rejects.toThrow(/permission/);
});
it('schimbarea ansamblului se propagă, inclusiv la alt agent; unitatea ștearsă e sărită și se aliniază la restaurare',async()=>{
 await db.exec(`reset role;update properties set assigned_to='${id(11)}' where id='${copy}';`);
 const other=id(44);await db.exec(`insert into properties(id,organization_id,title,assigned_to,development_id,city) values('${other}','${id(1)}','U','${id(10)}','${id(30)}','X')`);await db.exec(`reset role;set habitoo.property_soft_delete='on';update properties set deleted_at=now() where id='${other}';reset habitoo.property_soft_delete;`);
 await as(10,1);await db.exec(`update developments set city='Roșu',lat=44.5 where id='${id(30)}'`);
 expect(await row(copy)).toMatchObject({city:'Roșu',lat:44.5});expect(await row(other)).toMatchObject({city:'Chiajna'});
 await db.exec(`set habitoo.property_soft_delete='on';update properties set deleted_at=null where id='${other}';reset habitoo.property_soft_delete;`);expect(await row(other)).toMatchObject({city:'Roșu',lat:44.5});
});
it('ansamblu incomplet: unitatea își păstrează locația; la completare o preia',async()=>{
 await db.exec(`reset role;update properties set development_id='${id(31)}' where id='${id(42)}'`);expect(await row(42)).toMatchObject({city:'Cluj-Napoca',street:'Strada Y'});
 await db.exec(`update developments set city='Chiajna',lat=1,lng=2 where id='${id(31)}'`);expect(await row(42)).toMatchObject({county:'Ilfov',city:'Chiajna',street:null,lat:1,lng:2});
});
it('scoasă din ansamblu păstrează locația; anunț fără ansamblu neafectat',async()=>{
 await db.exec(`reset role;update properties set development_id=null where id='${id(42)}';update developments set city='Alt oraș' where id='${id(31)}'`);expect(await row(42)).toMatchObject({city:'Chiajna'});
 await db.exec(`insert into properties(id,organization_id,title,city,lat) values('${id(43)}','${id(1)}','Liber','Brașov',3)`);expect(await row(43)).toMatchObject({city:'Brașov',lat:3});
});
