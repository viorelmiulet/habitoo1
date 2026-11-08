import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { generateExtensionToken, serveExtension, sha256Hex, type ExtensionStore } from "./core";
import {
  checkSourceHandler, completeImagesHandler, createPropertyHandler, normalizeSourceUrl, uploadUrlsHandler, validateImageFile,
  MAX_EXTENSION_IMAGE_BYTES, type ExtPropertyStore,
} from "./properties";
import { mapPropertyToFeed, type PropertyRow } from "@/lib/site-feed/mapper";
import { mapPartnerListing } from "@/lib/partner-api/schema";
import { kyeroDocument, kyeroProperties } from "@/lib/portals/bazaruldecase/kyero";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const SOURCE = "https://www.olx.ro/d/oferta/apartament-2-camere-IDabc.html";
let pg: PGlite;
let token = "";
const auth: ExtensionStore = {
  token: async (h) => (h === (await sha256Hex(token)) ? { id: "t1", user_id: USER, organization_id: ORG, token_hash: h, revoked_at: null } : null),
  account: async () => ({ is_active: true, full_name: "Ana", role: "agent", profile_org_id: ORG, org: { id: ORG, name: "A", logo_url: null, status: "active", archived_at: null, suspended_reason: null } }),
  rate: async () => ({ limit: 60, remaining: 59, reset: 9e9, allowed: true }), touch: async () => {}, revoke: async () => {},
};
let imageCount = 0;
const signed: string[] = [];
const store: ExtPropertyStore = {
  createProperty: async (a) => (await pg.query<{ r: never }>("SELECT public.extension_create_property($1,$2,$3,$4,$5,$6,$7) r",
    [a.user, a.org, a.key, a.hash, JSON.stringify(a.property), JSON.stringify(a.owner), JSON.stringify(a.source)])).rows[0].r,
  findSource: async (org, n) => {
    const r = await pg.query<{ id: string; title: string }>("SELECT p.id,p.title FROM property_capture_sources s JOIN properties p ON p.id=s.property_id WHERE s.organization_id=$1 AND s.normalized_url=$2 ORDER BY s.created_at LIMIT 1", [org, n]);
    return r.rows[0] ? { ...r.rows[0], agent: "Ana" } : null;
  },
  propertyAccess: async () => ({ imageCount }),
  signUploads: async (paths) => { signed.push(...paths); return paths.map((path) => ({ path, upload_url: "https://x/" + path, token: "t" })); },
  completeImages: async ({ paths }) => ({ added: paths.length, rejected: [] }),
  localities: async () => [],
};
const req = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://crm.habitoo.ro/api/public/extension/v1${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const body = (over: Record<string, unknown> = {}) => ({
  title: "Apartament 2 camere", description: "Luminos", property_type: "apartment", transaction: "sale", price: 95000, currency: "EUR",
  usable_surface: 54, rooms: 2, floor: 3, building_floors: 8, layout: "decomandat", features: ["lift", "Aer condiționat"],
  locality: { name: "Cluj-Napoca", county: "Cluj" }, zone: "Mănăștur",
  owner: { name: "Ion Popescu", phone: "0722 123 456", email: "ion@example.com" },
  source: { url: SOURCE + "?utm_source=fb&fbclid=XYZ#galerie", site: "olx.ro", captured_at: "2026-11-08T10:00:00Z" }, ...over,
});
const create = (key: string, b = body()) => serveExtension(req("/properties", b, { "Idempotency-Key": key }), auth, createPropertyHandler(req("/properties", b, { "Idempotency-Key": key }), store));
const count = async (t: string) => Number((await pg.query<{ n: number }>(`SELECT count(*)::int n FROM ${t}`)).rows[0].n);

beforeAll(async () => {
  token = generateExtensionToken();
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TYPE transaction_kind AS ENUM('sale','rent');
    CREATE SEQUENCE property_reference_seq; CREATE FUNCTION next_property_reference() RETURNS text LANGUAGE sql AS $$ SELECT 'HB-'||nextval('property_reference_seq') $$;
    CREATE TABLE contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, first_name text NOT NULL, last_name text NOT NULL DEFAULT '', phone text, email text, type text, source text, assigned_to uuid, created_by uuid, created_at timestamptz DEFAULT clock_timestamp());
    CREATE TABLE properties(id uuid PRIMARY KEY, organization_id uuid, assigned_to uuid, created_by uuid, reference text, title text, description text, status text, property_type text NOT NULL DEFAULT 'apartment', transaction_kind transaction_kind, for_sale bool, for_rent bool, price numeric, currency text, sale_price numeric, sale_currency text, rent_price numeric, rent_currency text, surface numeric, usable_surface numeric, built_surface numeric, land_surface numeric, rooms int, bathrooms int, floor int, building_floors int, build_year int, layout text, comfort text, heating text, finish_state text, city text, county text, county_siruta_code int, uat_siruta_code int, locality_siruta_code int, district text, address text, owner_contact_id uuid, additional_spaces text[], kitchen_features text[], metering text[], appliances text[], building_amenities text[], street_arrangement text[], views text[], misc_features text[], cooling_systems text[], features text[] DEFAULT '{}', publish_status text DEFAULT 'unpublished');
    CREATE TABLE activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, property_id uuid, contact_id uuid, kind text, status text, done bool, title text, description text, starts_at timestamptz, assigned_to uuid, created_by uuid);`);
  await pg.exec(readFileSync("drizzle/migrations/0263_extension_property_capture.sql", "utf8"));
});
afterAll(async () => { await pg.close(); });

describe("E2 — import cu extensia Chrome", () => {
  let firstId = "";
  it("import complet → proprietate nepublicată, contact legat și activitate", async () => {
    const res = await create("key-1");
    expect(res.status).toBe(201);
    const json = await res.json() as { id: string; url: string };
    firstId = json.id;
    expect(json.url).toMatch(new RegExp(`/app/properties/${json.id}$`));
    const p = (await pg.query<Record<string, unknown>>("SELECT * FROM properties WHERE id=$1", [json.id])).rows[0];
    expect(p).toMatchObject({ status: "draft", publish_status: "unpublished", assigned_to: USER, created_by: USER, organization_id: ORG, layout: "Decomandat", rooms: 2, city: "Cluj-Napoca", district: "Mănăștur" });
    expect(p.misc_features ?? p.building_amenities).toBeDefined();
    const c = (await pg.query<Record<string, unknown>>("SELECT * FROM contacts WHERE id=$1", [p.owner_contact_id])).rows[0];
    expect(c).toMatchObject({ organization_id: ORG, first_name: "Ion", last_name: "Popescu", phone: "+40722123456", type: "owner" });
    const a = (await pg.query<Record<string, unknown>>("SELECT * FROM activities WHERE property_id=$1", [json.id])).rows;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ title: "Importat cu extensia Chrome din olx.ro", contact_id: c.id });
  });
  it("același Idempotency-Key → o singură proprietate", async () => {
    const before = await count("properties");
    const res = await create("key-1");
    expect(res.status).toBe(200);
    expect((await res.json() as { id: string }).id).toBe(firstId);
    expect(await count("properties")).toBe(before);
    expect((await create("key-1", body({ title: "Alt titlu" }))).status).toBe(409);
  });
  it("același telefon (alt format) → același contact", async () => {
    const res = await create("key-2", body({ owner: { name: "Ion P.", phone: "+40 722-123-456" }, source: { url: "https://storia.ro/x", site: "storia.ro" } }));
    const id = (await res.json() as { id: string }).id;
    const rows = (await pg.query<{ owner_contact_id: string }>("SELECT owner_contact_id FROM properties WHERE id IN ($1,$2)", [firstId, id])).rows;
    expect(new Set(rows.map((r) => r.owner_contact_id)).size).toBe(1);
    expect(Number((await pg.query<{ n: number }>("SELECT count(*)::int n FROM contacts WHERE phone='+40722123456'")).rows[0].n)).toBe(1);
  });
  it("același URL, cu sau fără utm/fbclid/# → check-source o găsește", async () => {
    expect(normalizeSourceUrl(SOURCE + "?utm_medium=x#a")).toBe(normalizeSourceUrl(SOURCE));
    for (const url of [SOURCE, SOURCE + "?utm_campaign=z", SOURCE + "#poze", SOURCE.replace("www.", "")]) {
      const r = req("/properties/check-source", { url });
      const res = await serveExtension(r, auth, checkSourceHandler(r, store));
      const j = await res.json() as { exists: boolean; property: { id: string; agent: string; url: string } };
      expect(j.exists).toBe(true);
      expect(j.property.id).toBe(firstId);
    }
    const r = req("/properties/check-source", { url: "https://www.olx.ro/d/oferta/alt-anunt.html" });
    expect((await (await serveExtension(r, auth, checkSourceHandler(r, store))).json() as { exists: boolean }).exists).toBe(false);
  });
  it("poze peste limite → refuzate", async () => {
    const up = async (b: unknown) => { const r = req(`/properties/${firstId}/images/upload-urls`, b); return serveExtension(r, auth, uploadUrlsHandler(r, store, firstId)); };
    expect((await up({ count: 31, types: Array(31).fill("image/jpeg") })).status).toBe(422);
    expect((await up({ count: 1, types: ["image/gif"] })).status).toBe(422);
    imageCount = 29;
    expect((await up({ count: 2, types: ["image/jpeg", "image/png"] })).status).toBe(422);
    imageCount = 0;
    const ok = await up({ count: 2, types: ["image/jpeg", "image/webp"] });
    expect(ok.status).toBe(200);
    expect(validateImageFile(new Uint8Array(MAX_EXTENSION_IMAGE_BYTES + 1).fill(0xff))).toEqual({ error: "Fotografia depășește 10 MB." });
    expect(validateImageFile(new TextEncoder().encode("GIF89a........"))).toHaveProperty("error");
    expect(validateImageFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ type: "image/jpeg" });
    const done = async (paths: unknown) => { const r = req(`/properties/${firstId}/images/complete`, { paths }); return serveExtension(r, auth, completeImagesHandler(r, store, firstId)); };
    expect((await done([`${ORG}/${firstId}/../../alt.jpg`])).status).toBe(422);
    expect((await done(Array.from({ length: 31 }, (_, i) => `${ORG}/${firstId}/ext-${crypto.randomUUID()}.jpg${i}`))).status).toBe(422);
    expect((await done(signed.slice(-2))).status).toBe(200);
  });
  it("sursa nu apare în feedul site-ului, Partner API sau portaluri (Kyero)", async () => {
    const row = (await pg.query<PropertyRow>("SELECT * FROM properties WHERE id=$1", [firstId])).rows[0];
    const asPublished = { ...row, status: "active", publish_status: "published", features: [] } as PropertyRow;
    const out = JSON.stringify([
      mapPropertyToFeed(asPublished, { baseUrl: "https://www.habitoo.ro" }),
      mapPartnerListing(asPublished, [], "https://www.habitoo.ro"),
      kyeroDocument(kyeroProperties({ property: asPublished, images: [], agent: null, coords: null } as never).xml),
    ]);
    expect(out).not.toContain("olx");
    expect(out).not.toContain("IDabc");
    expect(Object.keys(row)).not.toContain("source_url");
  });
});
