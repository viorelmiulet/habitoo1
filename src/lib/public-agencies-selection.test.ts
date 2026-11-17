import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { toPublicPartners } from "./public-partners";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,status text DEFAULT 'active',is_demo boolean DEFAULT false,
    public_hidden_by_admin boolean DEFAULT false,archived_at timestamptz,subscription_expires_at timestamptz,is_trial boolean DEFAULT false,
    logo_path text,public_profile_enabled boolean DEFAULT true,public_slug text,public_description text,city text);
    CREATE TABLE profiles(organization_id uuid,full_name text,job_title text,public_bio text,phone text,public_show_phone boolean,is_active boolean,public_profile_enabled boolean);
    CREATE FUNCTION public.public_agency_profile(_slug text) RETURNS TABLE(id uuid,name text,description text,has_logo boolean,slug text)
    LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT id,name,public_description,logo_path IS NOT NULL,public_slug FROM organizations WHERE false $$;`);
  await db.exec(readFileSync(new URL("../../drizzle/migrations/0286_public_partners_retain_real_agencies.sql", import.meta.url), "utf8"));
  // Original profile function delegates eligibility to the replaced rule.
  await db.exec(readFileSync(new URL("../../drizzle/migrations/0119_public_agency_profiles.sql", import.meta.url), "utf8").split("CREATE OR REPLACE FUNCTION public.public_agency_profile")[1]?.split("CREATE OR REPLACE FUNCTION public.public_agency_agents")[0]?.replace(/^/, "CREATE OR REPLACE FUNCTION public.public_agency_profile") ?? "");
  await db.exec(`INSERT INTO organizations(name,status,archived_at,subscription_expires_at,is_trial,is_demo,public_hidden_by_admin,public_slug,public_description,city) VALUES
    ('Zeta activă','active',null,now()+interval '1 day',false,false,false,'zeta','Descriere','București'),
    ('Alfa activă','trial',null,now()+interval '1 day',true,false,false,'alfa','Descriere','Iași'),
    ('Beta suspendată','suspended',null,null,false,false,false,'beta','Descriere','Brașov'),
    ('Alfa arhivată','cancelled',now(),now()-interval '1 month',true,false,false,'arhivata','Descriere','Cluj'),
    ('Gamma expirată','active',null,now()-interval '1 day',true,false,false,'expirata','Descriere','Timișoara'),
    ('Demo','active',null,null,false,true,false,'demo','Descriere','București'),
    ('Ascunsă','active',null,null,false,false,true,'ascunsa','Descriere','București');
    INSERT INTO profiles SELECT id,'Agent Test',null,null,'0700000000',true,true,true FROM organizations;`);
}, 15000);
afterAll(async () => { await db.close(); });
describe("AG1 public selection", () => {
  it("includes active, suspended, archived and expired; excludes only demo/admin-hidden", async () => {
    const rows = (await db.query<{ name: string }>("SELECT * FROM public_partner_agencies()")).rows;
    expect(rows.map(r => r.name)).toEqual(['Alfa activă','Zeta activă','Alfa arhivată','Beta suspendată','Gamma expirată']);
  });
  it("preserves the access-first alphabetical RPC order without exposing status", async () => {
    const rows = (await db.query<{ id: string; name: string; has_logo: boolean; public_slug: string | null }>("SELECT * FROM public_partner_agencies()")).rows;
    const out = toPublicPartners(rows);
    expect(out.map(p => p.name)).toEqual(['Alfa activă','Zeta activă','Alfa arhivată','Beta suspendată','Gamma expirată']);
    expect(Object.keys(out[0] ?? {}).sort()).toEqual(['logoUrl','name','slug']);
  });
  it("keeps inactive opted-in profiles/cities available but removes all agent contacts", async () => {
    for (const slug of ['arhivata','beta','expirata']) {
      const rows = (await db.query<{ id: string }>("SELECT * FROM public_agency_profile($1)",[slug])).rows;
      expect(rows).toHaveLength(1);
      expect((await db.query("SELECT * FROM public_agency_agents($1)",[rows[0]?.id])).rows).toEqual([]);
      expect((await db.query<{ city: string }>("SELECT public_agency_city($1) city",[slug])).rows[0]?.city).toBeTruthy();
    }
    expect((await db.query("SELECT * FROM public_agency_agents((SELECT id FROM organizations WHERE public_slug='alfa'))")).rows).toHaveLength(1);
  });
  it("hidden/demo profiles remain unavailable and profile opt-in stays required", async () => {
    for (const slug of ['demo','ascunsa']) expect((await db.query("SELECT * FROM public_agency_profile($1)",[slug])).rows).toEqual([]);
    await db.exec("UPDATE organizations SET public_profile_enabled=false WHERE public_slug='beta'");
    expect((await db.query("SELECT * FROM public_agency_profile('beta')")).rows).toEqual([]);
    expect((await db.query("SELECT * FROM public_partner_agencies() WHERE name='Beta suspendată'")).rows).toHaveLength(1);
  });
});