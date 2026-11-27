import {beforeAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
let db:PGlite;
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ORG=id(1),OTHER=id(2),ADMIN=id(10),AGENT=id(11),SUPER=id(12),DEV=id(30);
async function as(uid:string|null){await db.exec(`reset role;set test.uid='${uid??''}';${uid?'set role authenticated;':''}`);}
async function fails(sql:string,params:unknown[]=[]){let err:unknown=null;try{await db.query(sql,params);}catch(e){err=e;}await as(null);return err;}
const insertDev=(n:number)=>db.query('insert into developments(id,organization_id,name,assigned_to) values($1,$2,$3,$4)',[id(100+n),ORG,'D',AGENT]);
beforeAll(async()=>{
 db=new PGlite();await db.exec(`
 create role authenticated;create role anon;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create type app_role as enum('superadmin','agency_admin','agent');
 create table organizations(id uuid primary key);create table profiles(id uuid primary key,organization_id uuid);
 create table user_roles(user_id uuid,role app_role,organization_id uuid);
 create function current_org() returns uuid language sql stable security definer as $$select organization_id from profiles where id=auth.uid()$$;
 create function has_role(uuid,app_role) returns boolean language sql stable security definer as $$select exists(select 1 from user_roles where user_id=$1 and role=$2)$$;
 create function is_superadmin() returns boolean language sql stable security definer as $$select has_role(auth.uid(),'superadmin')$$;
 create table audit_logs(id serial,organization_id uuid,actor_id uuid,action text,entity text,entity_id uuid,old_values jsonb,new_values jsonb,created_by uuid);
 create table developments(id uuid primary key,organization_id uuid,name text,assigned_to uuid);
 grant select,insert on developments to authenticated;alter table developments enable row level security;
 create policy developments_read on developments for select to authenticated using(true);
 create policy developments_insert on developments for insert to authenticated with check(true);
 create table development_portal_selections(development_id uuid,portal_key text,enabled boolean,primary key(development_id,portal_key));
 grant select,insert,update on development_portal_selections to authenticated;
 grant usage on schema public to authenticated;
 insert into organizations values('${ORG}'),('${OTHER}');
 insert into profiles values('${ADMIN}','${ORG}'),('${AGENT}','${ORG}'),('${SUPER}','${OTHER}'),('${id(13)}','${ORG}');
 insert into user_roles values('${ADMIN}','agency_admin','${ORG}'),('${AGENT}','agent','${ORG}'),('${SUPER}','superadmin',null),('${id(13)}','agent','${ORG}');
 insert into developments values('${DEV}','${ORG}','Existent','${AGENT}');`);
 await db.exec(readFileSync('drizzle/migrations/0353_agent_development_permissions.sql','utf8').replace(/--> statement-breakpoint/g,''));
});
it('agentul fără rând sau cu can_create=false nu poate crea, nici prin inserare directă',async()=>{
 await as(AGENT);expect(await fails('insert into developments(id,organization_id,name,assigned_to) values($1,$2,$3,$4)',[id(101),ORG,'D',AGENT])).toBeTruthy();
 await as(ADMIN);await db.query('insert into agent_development_permissions(organization_id,user_id,can_create) values($1,$2,false)',[ORG,AGENT]);
 await as(AGENT);expect(await fails('insert into developments(id,organization_id,name,assigned_to) values($1,$2,$3,$4)',[id(102),ORG,'D',AGENT])).toBeTruthy();
});
it('cu can_create=true agentul poate crea; administratorul poate fără setări',async()=>{
 await as(ADMIN);await db.query('update agent_development_permissions set can_create=true where user_id=$1',[AGENT]);
 await as(AGENT);await insertDev(3);
 await as(ADMIN);await db.query('insert into developments(id,organization_id,name,assigned_to) values($1,$2,$3,$4)',[id(104),ORG,'D',id(13)]);
 await as(null);expect((await db.query('select count(*)::int n from developments')).rows[0]).toEqual({n:3});
});
it('doar administratorul și superadminul modifică; agentul își citește drepturile; modificarea este auditată',async()=>{
 await as(AGENT);expect(await fails('update agent_development_permissions set can_create=false where user_id=$1 returning 1',[AGENT]).then(async e=>e)).toBeFalsy();
 await as(null);expect((await db.query('select can_create from agent_development_permissions where user_id=$1',[AGENT])).rows[0]).toEqual({can_create:true});
 await as(AGENT);expect(await fails('insert into agent_development_permissions(organization_id,user_id,can_create) values($1,$2,true)',[ORG,id(13)])).toBeTruthy();
 await as(AGENT);expect((await db.query('select can_create from agent_development_permissions where user_id=$1',[AGENT])).rows).toEqual([{can_create:true}]);
 await as(SUPER);await db.query('insert into agent_development_permissions(organization_id,user_id,allowed_portals) values($1,$2,$3)',[ORG,id(13),['b','a','a']]);
 await as(null);expect((await db.query('select allowed_portals from agent_development_permissions where user_id=$1',[id(13)])).rows[0]).toEqual({allowed_portals:['a','b']});
 expect((await db.query("select count(*)::int n from audit_logs where entity='agent_development_permissions'")).rows[0]).toEqual({n:3});
});
it('agentul activează direct doar portalurile permise și poate debifa orice; administratorul activează orice',async()=>{
 await as(ADMIN);await db.query("update agent_development_permissions set allowed_portals='{clickimob}' where user_id=$1",[AGENT]);
 await db.query("insert into development_portal_selections values($1,'imobli',true)",[DEV]);
 await as(AGENT);expect(await fails("insert into development_portal_selections values($1,'storia',true)",[DEV])).toBeTruthy();
 await as(AGENT);await db.query("insert into development_portal_selections values($1,'clickimob',true)",[DEV]);
 await db.query("update development_portal_selections set enabled=false where portal_key='imobli'");
 expect(await fails("update development_portal_selections set enabled=true where portal_key='imobli'")).toBeTruthy();
 await as(null);expect((await db.query('select portal_key,enabled from development_portal_selections order by portal_key')).rows).toEqual([{portal_key:'clickimob',enabled:true},{portal_key:'imobli',enabled:false}]);
});
