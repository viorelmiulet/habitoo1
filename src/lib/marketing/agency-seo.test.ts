import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { agencySlug, agentSlug, agencyIndexable, agencyJsonLd, buildAgencySitemapXml, dedupeOffers } from "./agency-seo";
import { publicGraphJsonLd } from "@/components/marketing/structured-data";

describe("slug-uri profil", () => {
  it("agenție: nume, apoi nume-localitate, fără diacritice", () => {
    expect(agencySlug({ id: "a", name: "Casa Țării Imobiliare", city: "Brașov" }, new Set())).toBe("casa-tarii-imobiliare");
    expect(agencySlug({ id: "a", name: "Casa Țării Imobiliare", city: "Brașov" }, new Set(["casa-tarii-imobiliare"]))).toBe("casa-tarii-imobiliare-brasov");
  });
  it("agent unic în agenție", () => {
    expect(agentSlug("Ion Popescu", new Set())).toBe("ion-popescu");
    expect(agentSlug("Ion Popescu", new Set(["ion-popescu"]))).toBe("ion-popescu-2");
  });
});

describe("indexare", () => {
  it("noindex pentru inactiv sau fără oferte", () => {
    expect(agencyIndexable({ currentAccess: true, offerCount: 3 })).toBe(true);
    expect(agencyIndexable({ currentAccess: false, offerCount: 3 })).toBe(false);
    expect(agencyIndexable({ currentAccess: true, offerCount: 0 })).toBe(false);
  });
  it("copia nu apare lângă original", () => {
    expect(dedupeOffers([{ slug: "orig" }, { slug: "copie", originalSlug: "orig" }]).map(o => o.slug)).toEqual(["orig"]);
  });
});

describe("JSON-LD plat", () => {
  it("RealEstateAgent, ItemList, BreadcrumbList, fără agenți", () => {
    const a = { name: "MG", slug: "mg", description: null, logoUrl: null, city: "București", phone: null, email: null, website: null };
    const g = publicGraphJsonLd([...agencyJsonLd(a, [{ slug: "o1", title: "Ap" }])])["@graph"] as Record<string, unknown>[];
    for (const n of g) { expect(Array.isArray(n)).toBe(false); expect(n["@type"]).toBeTruthy(); }
    const types = g.map(n => n["@type"]);
    expect(types).toEqual(expect.arrayContaining(["RealEstateAgent", "ItemList", "BreadcrumbList"]));
    expect(types).not.toContain("Person");
    expect(JSON.stringify(g)).not.toMatch(/employee|"Person"/);
  });
});

describe("sitemap-agentii.xml", () => {
  it("URL absolut și lastmod", () => {
    expect(buildAgencySitemapXml([{ path: "/agentii/mg", lastmod: "2026-11-01T10:00:00Z" }])).toContain("<loc>https://www.habitoo.ro/agentii/mg</loc><lastmod>2026-11-01T10:00:00.000Z</lastmod>");
  });
});

describe("DB: profiluri publice", () => {
  it("slug-uri, agenție ascunsă, oferte fără copii, sitemap și coadă", async () => {
    const db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table organizations(id uuid primary key, name text, city text, public_slug text, public_description text, logo_path text, phone text, email text,
        material_phone text, material_email text, material_website text, public_hidden_by_admin boolean default false, is_demo boolean default false, status text default 'active',
        archived_at timestamptz, subscription_expires_at timestamptz, created_at timestamptz default now());
      create table profiles(id uuid primary key, organization_id uuid, full_name text, job_title text, public_bio text, phone text, public_show_phone boolean default false,
        avatar_url text, is_active boolean default true, public_slug text, created_at timestamptz default now());
      create table properties(id uuid primary key default gen_random_uuid(), organization_id uuid, assigned_to uuid, reference text, title text default 'T', price numeric, currency text default 'EUR',
        transaction_kind text default 'sale', property_type text, rooms int, surface numeric, district text, city text,
        publish_status text default 'unpublished', status text default 'active', deleted_at timestamptz, archived_at timestamptz, cloned_from_property_id uuid, updated_at timestamptz default now());
      create table property_images(id uuid primary key default gen_random_uuid(), property_id uuid, include_in_publish boolean, is_confidential boolean, is_primary boolean, position int);
      create function public_partner_eligible(o organizations) returns boolean language sql as $$ select not coalesce(o.is_demo,false) and not coalesce(o.public_hidden_by_admin,false) $$;
      create function public_partner_current_access(o organizations) returns boolean language sql as $$ select o.archived_at is null and o.status in ('active','trial') $$;`);
    await db.exec(readFileSync("drizzle/migrations/0310_seo1_offer_slugs.sql", "utf8").replace(/ALTER TABLE public\.properties (DIS|EN)ABLE TRIGGER USER;/g, ""));
    await db.exec(readFileSync("drizzle/migrations/0311_seo3_agency_profiles.sql", "utf8").replace(/ALTER TABLE public\.\w+ (DIS|EN)ABLE TRIGGER USER;/g, "").replace(/--> statement-breakpoint/g, ""));
    const O1 = "00000000-0000-4000-8000-000000000001", O2 = "00000000-0000-4000-8000-000000000002", O3 = "00000000-0000-4000-8000-000000000003";
    await db.exec(`insert into organizations(id,name,city) values('${O1}','Casa Bună','București'),('${O2}','Casa Bună','Cluj'),('${O3}','Ascunsă',null);
      update organizations set public_hidden_by_admin = true where id='${O3}';
      insert into profiles(id,organization_id,full_name) values('00000000-0000-4000-8000-0000000000a1','${O1}','Ion Pop'),('00000000-0000-4000-8000-0000000000a2','${O1}','Ion Pop'),('00000000-0000-4000-8000-0000000000a3','${O3}','X Y');`);
    const slugs = (await db.query<{ public_slug: string }>("select public_slug from organizations order by id")).rows.map(r => r.public_slug);
    expect(slugs).toEqual(["casa-buna", "casa-buna-cluj", "ascunsa"]);
    await db.exec(`update organizations set name='Alt nume' where id='${O1}'`);
    expect((await db.query<{ s: string }>(`select public_slug s from organizations where id='${O1}'`)).rows[0]!.s).toBe("casa-buna");
    expect((await db.query<{ s: string }>("select public_slug s from profiles where organization_id=$1 order by id", [O1])).rows.map(r => r.s)).toEqual(["ion-pop", "ion-pop-2"]);

    expect((await db.query("select * from public_agency_page('ascunsa')")).rows).toHaveLength(0);
    let page = (await db.query<{ offer_count: string }>("select offer_count from public_agency_page('casa-buna')")).rows[0]!;
    expect(Number(page.offer_count)).toBe(0);
    expect((await db.query("select * from public_agency_sitemap()")).rows).toHaveLength(0);

    await db.exec(`insert into properties(id,organization_id,assigned_to,reference,property_type,city,publish_status) values('00000000-0000-4000-8000-000000000010','${O1}','00000000-0000-4000-8000-0000000000a1','HB-1','apartment','București','published');
      insert into properties(organization_id,assigned_to,reference,property_type,city,publish_status,cloned_from_property_id) values('${O1}','00000000-0000-4000-8000-0000000000a1','HB-2','apartment','București','published','00000000-0000-4000-8000-000000000010');`);
    const offers = (await db.query<{ slug: string; total: string }>("select slug,total from public_agency_offers('casa-buna')")).rows;
    expect(offers.map(o => o.slug)).toEqual(["apartament-bucuresti-hb-1"]); expect(Number(offers[0]!.total)).toBe(1);
    expect((await db.query("select * from public_agency_offers('casa-buna','ion-pop')")).rows).toHaveLength(1);
    expect((await db.query("select * from public_agency_offers('casa-buna','ion-pop-2')")).rows).toHaveLength(0);
    const site = (await db.query<{ path: string }>("select path from public_agency_sitemap()")).rows.map(r => r.path);
    expect(site).toEqual(["/agentii/casa-buna", "/agentii/casa-buna/ion-pop"]);
    const q = (await db.query<{ url: string }>("select url from seo_indexnow_offer_queue where url like '%/agentii/%' order by url")).rows.map(r => r.url);
    expect(q).toEqual(["https://www.habitoo.ro/agentii/casa-buna", "https://www.habitoo.ro/agentii/casa-buna/ion-pop"]);

    await db.exec(`update organizations set status='suspended' where id='${O1}'`);
    page = (await db.query<{ offer_count: string; current_access: boolean; phone: string | null }>("select * from public_agency_page('casa-buna')")).rows[0]! as never;
    expect((page as unknown as { current_access: boolean }).current_access).toBe(false);
    expect((await db.query("select * from public_agency_sitemap()")).rows).toHaveLength(0);
    await db.close();
  });
});
