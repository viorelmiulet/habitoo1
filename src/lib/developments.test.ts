import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
let db:PGlite;
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function current_org() returns uuid language sql stable as $$select nullif(current_setting('test.org',true),'')::uuid$$;
 create function is_superadmin() returns boolean language sql stable as $$select coalesce(current_setting('test.super',true),'false')='true'$$;
 create type app_role as enum ('superadmin','agency_admin','agent');
 create function has_role(uuid,app_role) returns boolean language sql stable as $$select $2='agency_admin' and coalesce(current_setting('test.admin',true),'false')='true'$$;
 create table organizations(id uuid primary key);create table profiles(id uuid primary key,organization_id uuid,is_active boolean);
 create table properties(id uuid primary key,organization_id uuid,assigned_to uuid,deleted_at timestamptz,status text,for_sale boolean,sale_price numeric,sale_currency text,currency text,for_rent boolean,rent_price numeric,rent_currency text);
 grant usage on schema auth to authenticated;grant select,update on properties to authenticated;grant select on profiles,organizations to authenticated;
 alter table properties enable row level security;create policy own_properties on properties to authenticated using(organization_id=current_org() and assigned_to=auth.uid()) with check(organization_id=current_org());`);
 for(const file of ['0292_ans1_developments.sql','0293_ans1_gallery_and_guards.sql','0294_ans1_batch_summaries.sql'])await db.exec(readFileSync(`drizzle/migrations/${file}`,'utf8'));
 await db.query('insert into organizations values($1),($2)',[id(1),id(2)]);
 await db.query('insert into profiles values($1,$2,true),($3,$4,true),($5,$2,true)',[id(10),id(1),id(20),id(2),id(11)]);
 await db.exec(`set test.uid='${id(10)}';set test.org='${id(1)}';`);
 await db.query("insert into developments(id,organization_id,name,assigned_to) values($1,$2,'Ansamblu A',$3)",[id(30),id(1),id(10)]);
 for(const [n,status,price] of [[40,'active',100000],[41,'active',150000],[42,'sold',50000]] as const)await db.query('insert into properties(id,organization_id,assigned_to,status,for_sale,sale_price,currency) values($1,$2,$3,$4,true,$5,\'EUR\')',[id(n),id(1),id(10),status,price]);
 await db.exec('set role authenticated');
});
afterAll(async()=>{await db.close();});
it('agentul din altă agenție nu vede și nu editează ansamblul',async()=>{
 await db.exec(`set test.uid='${id(20)}';set test.org='${id(2)}'`);
 expect((await db.query('select id from developments')).rows).toHaveLength(0);
 expect((await db.query("update developments set name='Furat' returning id")).rows).toHaveLength(0);
 await expect(db.query('select attach_development_units($1,$2)',[id(30),[id(40)]])).rejects.toThrow('Acces refuzat');
 await db.exec(`set test.uid='${id(10)}';set test.org='${id(1)}'`);
});
it('agentul atribuit vede și editează ansamblul',async()=>{
 expect((await db.query('select id from developments')).rows).toHaveLength(1);
 expect((await db.query("update developments set developer_name='Dezvoltator' where id=$1 returning developer_name",[id(30)])).rows).toEqual([{developer_name:'Dezvoltator'}]);
});
it('atașarea a două proprietăți setează development_id și primary',async()=>{
 await db.query('select attach_development_units($1,$2)',[id(30),[id(40),id(41)]]);
 expect((await db.query('select development_id,market from properties where id=any($1) order by id',[[id(40),id(41)]])).rows).toEqual([{development_id:id(30),market:'primary'},{development_id:id(30),market:'primary'}]);
});
it('intervalul este min/max doar din unitățile active și se actualizează la schimbarea prețului',async()=>{
 await db.query('select attach_development_units($1,$2)',[id(30),[id(42)]]);
 const summary=async()=>(await db.query<{s:{price_from:number;price_to:number;active:number;total:number}}>('select development_unit_summary($1) s',[id(30)])).rows[0]?.s;
 expect(await summary()).toEqual({active:2,total:3,price_from:100000,price_to:150000,currency:'EUR',transaction:'sale'});
 await db.query('update properties set sale_price=175000 where id=$1',[id(41)]);
 expect((await summary())?.price_to).toBe(175000);
});
it('scoaterea dezleagă proprietatea fără ștergere',async()=>{
 await db.query('select attach_development_units($1,$2,true)',[id(30),[id(41)]]);
 expect((await db.query('select development_id,deleted_at,market from properties where id=$1',[id(41)])).rows).toEqual([{development_id:null,deleted_at:null,market:'primary'}]);
});
it('monede diferite nu sunt amestecate într-un interval',async()=>{
 await db.query('update properties set sale_currency=\'RON\' where id=$1',[id(40)]);
 await db.query('select attach_development_units($1,$2)',[id(30),[id(41)]]);
 const r=await db.query<{s:{price_from:number|null;price_to:number|null;currency:string|null}}>('select development_unit_summary($1) s',[id(30)]);
 expect(r.rows[0]?.s).toMatchObject({price_from:null,price_to:null,currency:null});
 await db.query('update properties set sale_currency=\'EUR\' where id=$1',[id(40)]);
});
it('fără vânzări active, intervalul folosește chiria unităților active',async()=>{
 await db.query('update properties set for_sale=false,for_rent=true,rent_price=600,rent_currency=\'EUR\' where id=any($1)',[[id(40),id(41)]]);
 const r=await db.query<{s:unknown}>('select development_unit_summary($1) s',[id(30)]);
 expect(r.rows[0]?.s).toMatchObject({price_from:600,price_to:600,currency:'EUR',transaction:'rent'});
 await db.query('update properties set for_sale=true where id=any($1)',[[id(40),id(41)]]);
});
it('încărcarea în lot nu dezvăluie ansambluri inaccesibile',async()=>{
 await db.exec(`set test.uid='${id(20)}';set test.org='${id(2)}'`);
 expect((await db.query<{s:unknown}>('select development_summaries($1) s',[[id(30)]])).rows[0]?.s).toEqual({});
 await db.exec(`set test.uid='${id(10)}';set test.org='${id(1)}'`);
});
it('agentul cu unități atribuite vede ansamblul dar nu îl editează',async()=>{
 await db.exec('reset role');await db.query('update properties set assigned_to=$1 where id=$2',[id(11),id(40)]);await db.exec(`set role authenticated;set test.uid='${id(11)}'`);
 expect((await db.query('select id from developments')).rows).toHaveLength(1);
 expect((await db.query("update developments set name='Schimbat' returning id")).rows).toHaveLength(0);
 await db.exec(`set test.uid='${id(10)}'`);
});
it('ștergerea logică dezleagă toate unitățile și păstrează proprietățile',async()=>{
 await db.query('select delete_development($1)',[id(30)]);
 expect((await db.query('select id from developments')).rows).toHaveLength(0);
 await db.exec('reset role');
 expect((await db.query('select id from properties where development_id is not null')).rows).toHaveLength(0);
 expect((await db.query('select id from properties where deleted_at is null')).rows).toHaveLength(3);
 expect((await db.query('select id from developments where deleted_at is not null')).rows).toHaveLength(1);
});
