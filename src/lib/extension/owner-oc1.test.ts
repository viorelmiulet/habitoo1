import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createPropertyHandler, type ExtPropertyStore } from "./properties";
import type { ExtContext } from "./core";

const org = "22222222-2222-4222-8222-222222222222";
const user = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
const scalar = async (sql: string, args: unknown[] = []) => (await db.query<{ v: unknown }>(sql, args)).rows[0]?.v;
const attach = (id: string, phone: string | null, organization = org) => scalar("SELECT attach_import_owner($1,$2,$3,$4,'Hartă','Homezz.ro') v", [id, organization, user, JSON.stringify({ phone })]);
const property = async (organization = org) => {
  const id = crypto.randomUUID();
  await db.query("INSERT INTO properties(id,organization_id) VALUES($1,$2)", [id, organization]);
  return id;
};

beforeAll(async () => {
  db = new PGlite();
  const old = readFileSync("src/lib/extension/properties.test.ts", "utf8");
  const setup = old.split("  await pg.exec(`")[1]?.split("`);")[0];
  if (!setup) throw new Error("Missing fixture schema");
  await db.exec(setup.replace("created_at timestamptz DEFAULT clock_timestamp()", "gdpr_consent boolean DEFAULT false, created_at timestamptz DEFAULT clock_timestamp()")
    .replace("publish_status text DEFAULT 'unpublished'", "publish_status text DEFAULT 'unpublished', floor_label text, internal_notes text, collaboration_opted_out boolean"));
  await db.exec(`CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${user}'::uuid $$;
    CREATE FUNCTION current_org() RETURNS uuid LANGUAGE sql AS $$ SELECT '${org}'::uuid $$;
    CREATE TABLE profiles(id uuid,organization_id uuid,is_active bool,full_name text);
    CREATE TABLE listings(id uuid,source text,external_id text,is_owner bool,phone text,raw_data jsonb,title text,description text,price numeric,currency text,transaction_type text,property_type text,surface numeric,rooms int,floor_num int,floor text,city text,county text,zone text,neighborhood text,url text);
    CREATE TABLE property_images(organization_id uuid,property_id uuid,url text,storage_path text,position int,is_primary bool,created_by uuid);
    CREATE TABLE private_listing_imports(organization_id uuid,source text,external_id text,listing_id uuid,property_id uuid,imported_by uuid,consent_at timestamptz);
    INSERT INTO profiles VALUES('${user}','${org}',true,'Agent test');`);
  await db.exec(readFileSync("drizzle/migrations/0263_extension_property_capture.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0282_import_owner_contact.sql", "utf8"));
});
afterAll(async () => { await db.close(); });

describe("OC1 — owner contact", () => {
  it("normalizes Romanian mobile and landline formats and rejects invalid numbers", async () => {
    for (const input of ["0722 123 456", "+40 722-123-456", "0040722123456", "722123456"])
      expect(await scalar("SELECT ro_phone_key($1) v", [input])).toBe("+40722123456");
    expect(await scalar("SELECT ro_phone_key('021 123 4567') v")).toBe("+40211234567");
    expect(await scalar("SELECT ro_phone_key('07xx123456') v")).toBeNull();
  });
  it("reuses the same phone in the agency and does not grant consent", async () => {
    const first = await attach(await property(), "0722123456");
    expect(await attach(await property(), "+40 722 123 456")).toBe(first);
    expect(await scalar("SELECT count(*)::int v FROM contacts WHERE phone='+40722123456'")).toBe(1);
    const contact = (await db.query("SELECT * FROM contacts WHERE id=$1", [first])).rows[0];
    expect(contact).toMatchObject({ phone: "+40722123456", first_name: "Proprietar", last_name: "Homezz.ro", type: "owner", source: "Hartă Homezz.ro", assigned_to: user, gdpr_consent: false });
  });
  it("does not reuse another agency's contact", async () => {
    const other = crypto.randomUUID();
    expect(await attach(await property(other), "0722123456", other)).not.toBe(await attach(await property(), "0722123456"));
  });
  it("never overwrites an already selected owner or creates an extra contact", async () => {
    const id = await property(); const first = await attach(id, "0722123456");
    const before = await scalar("SELECT count(*)::int v FROM contacts");
    expect(await attach(id, "0733999888")).toBe(first);
    expect(await scalar("SELECT owner_contact_id v FROM properties WHERE id=$1", [id])).toBe(first);
    expect(await scalar("SELECT count(*)::int v FROM contacts")).toBe(before);
  });
  it("old extension payload without owner phone still creates a draft", async () => {
    const store = { createProperty: async (a: Parameters<ExtPropertyStore["createProperty"]>[0]) =>
      await scalar("SELECT extension_create_property($1,$2,$3,$4,$5,$6,$7) v", [a.user,a.org,a.key,a.hash,JSON.stringify(a.property),JSON.stringify(a.owner),JSON.stringify(a.source)]) } as ExtPropertyStore;
    const request = new Request("https://crm.habitoo.ro/api/public/extension/v1/properties", { method: "POST", headers: { "Idempotency-Key": "legacy-oc1" }, body: JSON.stringify({ title: "Legacy", source: { url: "https://olx.ro/d/oferta/test" } }) });
    const res = await createPropertyHandler(request,store)({ token: { user_id: user, organization_id: org }, requestId: "oc1" } as ExtContext);
    expect(res.status).toBe(201);
    const result = await res.json() as { id: string };
    expect((await db.query("SELECT status,owner_contact_id FROM properties WHERE id=$1", [result.id])).rows[0]).toMatchObject({ status: "draft", owner_contact_id: null });
  });
  it("extension and MAP imports use the same contact and retain draft behavior", async () => {
    const captured = await scalar("SELECT extension_create_property($1,$2,'new-oc1','hash','{}',$3,$4) v", [user,org,JSON.stringify({ name: "Ion Popescu", phone: "0744555666" }),JSON.stringify({ site: "OLX", url: "https://olx.ro/test", normalized_url: "https://olx.ro/test" })]) as { contact_id: string };
    const listing = crypto.randomUUID(); const id = crypto.randomUUID();
    await db.query("INSERT INTO listings(id,source,external_id,is_owner,phone,raw_data) VALUES($1,'homezz','oc1-map',true,NULL,$2)", [listing,JSON.stringify({ owner: { phone: "+40744555666", name: "Ion" } })]);
    expect(await scalar("SELECT import_private_listing($1,$2,'[]',true) v", [listing,id])).toMatchObject({ propertyId: id, created: true });
    expect((await db.query("SELECT owner_contact_id,status FROM properties WHERE id=$1", [id])).rows[0]).toMatchObject({ owner_contact_id: captured.contact_id, status: "draft" });
    expect(await scalar("SELECT source v FROM contacts WHERE id=$1", [captured.contact_id])).toBe("Captură OLX");
    expect(await scalar("SELECT import_private_listing($1,$2,'[]',true) v", [listing,crypto.randomUUID()])).toMatchObject({ propertyId: id, created: false });
  });
  it("a map listing without owner data does not invent a contact", async () => {
    const listing = crypto.randomUUID(); const id = crypto.randomUUID();
    await db.query("INSERT INTO listings(id,source,external_id,is_owner) VALUES($1,'storia','no-phone',true)", [listing]);
    await scalar("SELECT import_private_listing($1,$2,'[]',true) v", [listing,id]);
    expect(await scalar("SELECT owner_contact_id v FROM properties WHERE id=$1", [id])).toBeNull();
  });
});