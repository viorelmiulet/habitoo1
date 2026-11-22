import { beforeAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Agent ascuns de SuperAdmin: fără pagină (404), listă, sitemap, avatar sau IndexNow.
let db: PGlite;
const ORG = "00000000-0000-4000-8000-000000000001";
const HID = "00000000-0000-4000-8000-000000000010";
const VIS = "00000000-0000-4000-8000-000000000011";
const SA = "00000000-0000-4000-8000-000000000099";
const P1 = "00000000-0000-4000-8000-000000000101";
const P2 = "00000000-0000-4000-8000-000000000102";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role authenticated; create role service_role; create schema auth;
    create table jwt(uid uuid); insert into jwt values(null);
    create function auth.uid() returns uuid language sql as 'select uid from public.jwt';
    create table user_roles(user_id uuid, role text);
    create function is_superadmin() returns boolean language sql as $$ select exists(select 1 from user_roles where user_id = auth.uid() and role='superadmin') $$;
    create table organizations(id uuid primary key, name text, public_slug text);
    create table profiles(id uuid primary key, organization_id uuid, full_name text, public_slug text, job_title text, public_bio text, phone text,
      public_show_phone boolean default false, avatar_url text, is_active boolean default true);
    create table properties(id uuid primary key, organization_id uuid, assigned_to uuid, public_slug text, publish_status text, status text,
      deleted_at timestamptz, archived_at timestamptz, updated_at timestamptz default now());
    create table seo_indexnow_offer_queue(url text primary key, enqueued_at timestamptz default now());
    create function public_partner_eligible(o organizations) returns boolean language sql as 'select true';
    create function public_partner_current_access(o organizations) returns boolean language sql as 'select true';
    create function public_offer_listable(_id uuid) returns boolean language sql as $$ select exists(select 1 from properties where id=_id and publish_status='published') $$;
    grant all on all tables in schema public to authenticated, service_role;
    insert into organizations values('${ORG}','EXPERT REAL ESTATE S.R.L.','expert');
    insert into profiles(id,organization_id,full_name,public_slug,avatar_url) values('${HID}','${ORG}','Viorel M','viorel-m','a.jpg'),('${VIS}','${ORG}','Ana Pop','ana-pop','b.jpg');
    insert into user_roles values('${SA}','superadmin');`);
  await db.exec(readFileSync("drizzle/migrations/0316_agent_public_profile_hidden.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
  await db.exec(readFileSync("drizzle/migrations/0317_agency_profiles_without_agents.sql", "utf8").replace(/--> statement-breakpoint/g, "").replace(/GRANT EXECUTE[^;]*;/g, ""));
  await db.exec(`create trigger t_profiles after insert or update on properties for each row execute function properties_indexnow_profiles();
    insert into properties(id,organization_id,assigned_to,public_slug,publish_status,status) values
      ('${P1}','${ORG}','${HID}','apartament-1','published','active'),('${P2}','${ORG}','${VIS}','apartament-2','published','active');
    update profiles set public_profile_hidden = true where id='${HID}';
    delete from seo_indexnow_offer_queue;`);
});

const rows = async <T,>(sql: string) => (await db.query<T>(sql)).rows;

describe("profil public ascuns", () => {
  it("pagina agentului ascuns nu returnează nimic (404)", async () => {
    expect(await rows(`select * from public_agent_page('expert','viorel-m')`)).toHaveLength(0);
    expect(await rows(`select * from public_agent_page('expert','ana-pop')`)).toHaveLength(1);
  });
  it("lipsește din lista agenției (și din JSON-LD-ul construit din ea)", async () => {
    const list = await rows<{ slug: string }>(`select slug from public_agency_agent_list('expert')`);
    expect(list.map(r => r.slug)).toEqual(["ana-pop"]);
  });
  it("sitemap-ul are doar agenția, fără pagini de agent", async () => {
    const paths = (await rows<{ path: string }>(`select path from public_agency_sitemap()`)).map(r => r.path);
    expect(paths).toContain("/agentii/expert");
    expect(paths).toEqual(["/agentii/expert"]);
  });
  it("poza nu mai e servită public", async () => {
    expect((await rows<{ p: string | null }>(`select public_agent_avatar_path('expert','viorel-m') p`))[0]?.p).toBeNull();
  });
  it("ofertele lui rămân listabile, iar IndexNow primește oferta și agenția, nu profilul lui", async () => {
    expect((await rows<{ l: boolean }>(`select public_offer_listable('${P1}') l`))[0]?.l).toBe(true);
    await db.exec(`update properties set status='reserved' where id='${P1}'`);
    const urls = (await rows<{ url: string }>(`select url from seo_indexnow_offer_queue`)).map(r => r.url);
    expect(urls).toContain("https://www.habitoo.ro/agentii/expert");
    expect(urls.some(u => u.endsWith("/viorel-m"))).toBe(false);
  });
  it("ascunderea scoate din coadă adresa profilului deja pusă acolo", async () => {
    await db.exec(`update profiles set public_profile_hidden=false where id='${HID}';
      insert into seo_indexnow_offer_queue(url) values('https://www.habitoo.ro/agentii/expert/viorel-m');
      update profiles set public_profile_hidden=true where id='${HID}'`);
    expect(await rows(`select 1 from seo_indexnow_offer_queue where url like '%/viorel-m'`)).toHaveLength(0);
  });
  it("doar SuperAdmin poate schimba câmpul", async () => {
    await db.exec(`update jwt set uid='${VIS}'`);
    await expect(db.exec(`update profiles set public_profile_hidden=false where id='${HID}'`)).rejects.toThrow(/Doar SuperAdmin/);
    await expect(db.exec(`update profiles set public_profile_hidden=true where id='${VIS}'`)).rejects.toThrow(/Doar SuperAdmin/);
    await db.exec(`update jwt set uid='${SA}'`);
    await db.exec(`update profiles set public_profile_hidden=true where id='${VIS}'; update profiles set public_profile_hidden=false where id='${VIS}'`);
    await db.exec(`update jwt set uid=null`);
  });
});

describe("agentul pe pagina ofertei", () => {
  it("agent vizibil: nume, poză și telefon doar dacă e public", async () => {
    let r = (await rows<{ full_name: string | null; phone: string | null; has_avatar: boolean; agency_slug: string }>(`select * from public_offer_agent('${P2}')`))[0]!;
    expect(r).toMatchObject({ full_name: "Ana Pop", phone: null, has_avatar: true, agency_slug: "expert" });
    await db.exec(`update profiles set phone='0722 000 000', public_show_phone=true where id='${VIS}'`);
    r = (await rows<typeof r>(`select * from public_offer_agent('${P2}')`))[0]!;
    expect(r.phone).toBe("0722 000 000");
    expect(Object.keys(r)).not.toContain("email");
  });
  it("agent ascuns sau inactiv: doar agenția", async () => {
    const r = (await rows<{ full_name: string | null; agent_slug: string | null; has_avatar: boolean; agency_slug: string }>(`select * from public_offer_agent('${P1}')`))[0]!;
    expect(r).toMatchObject({ full_name: null, agent_slug: null, has_avatar: false, agency_slug: "expert" });
    await db.exec(`update profiles set is_active=false where id='${VIS}'`);
    expect((await rows<{ full_name: string | null }>(`select full_name from public_offer_agent('${P2}')`))[0]!.full_name).toBeNull();
    expect((await rows<{ p: string | null }>(`select public_agent_avatar_path('expert','ana-pop') p`))[0]?.p).toBeNull();
    await db.exec(`update profiles set is_active=true where id='${VIS}'`);
  });
  it("coada IndexNow nu mai primește adrese de agent", async () => {
    await db.exec(`update properties set status='negotiation' where id='${P2}'`);
    const urls = (await rows<{ url: string }>(`select url from seo_indexnow_offer_queue`)).map(r => r.url);
    expect(urls).toContain("https://www.habitoo.ro/agentii/expert");
    expect(urls.some(u => /\/agentii\/[^/]+\/[^/]+$/.test(u))).toBe(false);
  });
});
