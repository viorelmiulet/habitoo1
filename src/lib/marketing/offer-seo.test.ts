import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { offerSlug, offerCanonicalUrl, isOfferIndexable, buildOfferSitemapXml, buildRootSitemapIndexXml, offerSitemapPages } from "./offer-seo";
import { flushOfferIndexNow } from "./indexnow.server";
import { shouldTagNoindex } from "@/lib/host-policy";

const ok = { publishStatus: "published", status: "active", deletedAt: null, archivedAt: null, agencyHidden: false, slug: "casa-hb-1" };

describe("slug ofertă", () => {
  it("format, fără diacritice", () => {
    expect(offerSlug({ propertyType: "apartment", rooms: 2, district: "Militari", city: "București", reference: "HB-1126" })).toBe("apartament-2-camere-militari-bucuresti-hb-1126");
  });
  it("câmpuri lipsă omise", () => {
    expect(offerSlug({ propertyType: "land", rooms: null, district: null, city: "Chiajna", reference: "HB-1200" })).toBe("teren-chiajna-hb-1200");
  });
  it("max 90: scurtează zona, apoi localitatea, referința întreagă", () => {
    const s = offerSlug({ propertyType: "apartment", rooms: 3, district: "Zona foarte lunga ".repeat(5), city: "Localitate lunga ".repeat(4), reference: "HB-99999" });
    expect(s.length).toBeLessThanOrEqual(90); expect(s.endsWith("-hb-99999")).toBe(true); expect(s).toContain("localitate");
  });
});

describe("indexare și canonical", () => {
  it("eligibil vs neeligibil", () => {
    expect(isOfferIndexable(ok)).toBe(true);
    expect(isOfferIndexable({ ...ok, agencyHidden: true })).toBe(false);
    expect(isOfferIndexable({ ...ok, status: "archived" })).toBe(false);
    expect(isOfferIndexable({ ...ok, deletedAt: "2026-01-01" })).toBe(false);
  });
  it("copia: canonical spre original eligibil, altfel propriu", () => {
    expect(offerCanonicalUrl("copie-hb-2", ok)).toBe("https://www.habitoo.ro/oferta/casa-hb-1");
    expect(offerCanonicalUrl("copie-hb-2", { ...ok, agencyHidden: true })).toBe("https://www.habitoo.ro/oferta/copie-hb-2");
    expect(offerCanonicalUrl("copie-hb-2", null)).toBe("https://www.habitoo.ro/oferta/copie-hb-2");
  });
  it("noindex prin antet doar pe /oferta/{uuid}", () => {
    const h = new Response("x", { headers: { "content-type": "text/html" } });
    expect(shouldTagNoindex(new Request("https://www.habitoo.ro/oferta/3faff5fa-37c1-4663-9a55-70523ec68598"), h)).toBe(true);
    expect(shouldTagNoindex(new Request("https://www.habitoo.ro/oferta/casa-hb-1"), h)).toBe(false);
  });
});

describe("sitemap oferte", () => {
  it("conținut cu lastmod și index paginat peste 45.000", () => {
    const xml = buildOfferSitemapXml([{ slug: "casa-hb-1", lastmod: "2026-11-01T10:00:00Z" }]);
    expect(xml).toContain("<loc>https://www.habitoo.ro/oferta/casa-hb-1</loc><lastmod>2026-11-01T10:00:00.000Z</lastmod>");
    expect(offerSitemapPages(90001)).toBe(3);
    const idx = buildRootSitemapIndexXml(90001);
    expect(idx).toContain("<loc>https://www.habitoo.ro/sitemap-pages.xml</loc>");
    expect(idx).toContain("<loc>https://www.habitoo.ro/sitemap-oferte.xml?pagina=3</loc>");
  });
});

describe("coada IndexNow (fără apeluri reale)", () => {
  const fakeDb = (rows: { url: string; enqueued_at: string }[]) => {
    const deleted: string[] = [];
    const chain: any = { select: () => chain, order: () => chain, limit: async () => ({ data: rows, error: null }), update: () => ({ eq: async () => ({}) }),
      delete: () => ({ eq: (_c: string, url: string) => ({ eq: async () => { deleted.push(url); return {}; } }) }) };
    return { deleted, db: { rpc: async () => ({ data: true, error: null }), from: () => chain } };
  };
  it("trimite lotul și golește coada la 202", async () => {
    const f = fakeDb([{ url: "https://www.habitoo.ro/oferta/casa-hb-1", enqueued_at: "t" }]); const calls: any[] = [];
    const r = await flushOfferIndexNow({ key: "k1234567", db: f.db, send: (async (_u: any, init: any) => { calls.push(JSON.parse(init.body)); return new Response(null, { status: 202 }); }) as any });
    expect(r.sent).toBe(1); expect(calls[0].urlList).toEqual(["https://www.habitoo.ro/oferta/casa-hb-1"]); expect(f.deleted).toHaveLength(1);
  });
  it("eroare IndexNow păstrează coada și nu aruncă", async () => {
    const f = fakeDb([{ url: "https://www.habitoo.ro/oferta/casa-hb-1", enqueued_at: "t" }]);
    const r = await flushOfferIndexNow({ key: "k1234567", db: f.db, send: (async () => { throw new Error("down"); }) as any });
    expect(r.sent).toBe(0); expect(f.deleted).toHaveLength(0);
  });
});

describe("DB: slug stabil, copii și coadă", () => {
  it("slug la prima publicare, stabil la editare, nou la copie, intrare în coadă", async () => {
    const db = new PGlite();
    await db.exec(`create table organizations(id uuid primary key, public_hidden_by_admin boolean default false);
      create table properties(id uuid primary key default gen_random_uuid(), organization_id uuid, reference text, property_type text, rooms int, district text, city text,
        publish_status text default 'unpublished', status text default 'active', deleted_at timestamptz, archived_at timestamptz, cloned_from_property_id uuid, updated_at timestamptz default now());
      create role anon; create role authenticated; create role service_role;`);
    const sql = readFileSync("drizzle/migrations/0310_seo1_offer_slugs.sql", "utf8").replace(/ALTER TABLE public\.properties (DIS|EN)ABLE TRIGGER USER;/g, "");
    await db.exec(sql);
    await db.exec(`insert into organizations values('00000000-0000-4000-8000-000000000001',false);
      insert into properties(id,organization_id,reference,property_type,rooms,district,city) values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','HB-1126','apartment',2,'Militari','București');`);
    const slug = async (id = "00000000-0000-4000-8000-000000000010") => (await db.query<{ public_slug: string | null }>("select public_slug from properties where id=$1", [id])).rows[0]!.public_slug;
    expect(await slug()).toBeNull();
    await db.exec(`update properties set publish_status='published'`);
    expect(await slug()).toBe("apartament-2-camere-militari-bucuresti-hb-1126");
    await db.exec(`update properties set district='Drumul Taberei', rooms=3, public_slug='altceva'`);
    expect(await slug()).toBe("apartament-2-camere-militari-bucuresti-hb-1126");
    await db.exec(`insert into properties(id,organization_id,reference,property_type,rooms,district,city,publish_status,public_slug,cloned_from_property_id) values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','HB-1390','apartment',2,'Militari','București','published','apartament-2-camere-militari-bucuresti-hb-1126','00000000-0000-4000-8000-000000000010')`);
    expect(await slug("00000000-0000-4000-8000-000000000011")).toBe("apartament-2-camere-militari-bucuresti-hb-1390");
    const site = (await db.query<{ slug: string }>("select slug from public_offer_sitemap(0,45000)")).rows.map(r => r.slug);
    expect(site).toEqual(["apartament-2-camere-militari-bucuresti-hb-1126"]);
    const q = (await db.query<{ url: string }>("select url from seo_indexnow_offer_queue order by url")).rows.map(r => r.url);
    expect(q).toContain("https://www.habitoo.ro/oferta/apartament-2-camere-militari-bucuresti-hb-1126");
    await db.close();
  });
});
