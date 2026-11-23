import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { agencyDescriptionStatsSchema } from "./agency-description";

describe("agregatul complet și public al agenției", () => {
  it("citește peste 1000 de oferte, izolează agențiile, exclude ciorne/copii și nu expune persoane", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role;
        create table organizations(id uuid primary key, public_slug text, public_hidden_by_admin boolean default false);
        create table properties(id uuid primary key default gen_random_uuid(), organization_id uuid, property_type text default 'apartment',
          transaction_kind text default 'sale', rooms int default 2, price numeric default 100000, currency text default 'EUR', city text default 'Brașov', district text default 'Tractorul',
          development_id uuid, public_slug text, publish_status text default 'published', deleted_at timestamptz, archived_at timestamptz,
          status text default 'active', cloned_from_property_id uuid, owner_name text default 'SECRET', private_notes text default 'SECRET');
        create table developments(id uuid primary key, organization_id uuid, name text, deleted_at timestamptz);
        create function public_agency_page(_slug text) returns table(id uuid) language sql stable as $$
          select id from organizations where public_slug=lower(_slug) and not public_hidden_by_admin $$;
        insert into organizations values('00000000-0000-0000-0000-000000000001','a',false),('00000000-0000-0000-0000-000000000002','b',false),('00000000-0000-0000-0000-000000000003','hidden',true);`);
      const original = readFileSync("drizzle/migrations/0311_seo3_agency_profiles.sql", "utf8");
      const listable = original.match(/CREATE OR REPLACE FUNCTION public\.public_offer_listable[\s\S]*?\$\$;/)?.[0];
      if (!listable) throw new Error("Missing public eligibility function");
      await db.exec(listable);
      await db.exec(readFileSync("drizzle/migrations/0328_agency_public_description_statistics.sql", "utf8"));
      await db.exec(`insert into properties(organization_id,public_slug) select '00000000-0000-0000-0000-000000000001','offer-'||n from generate_series(1,1100) n;
        insert into properties(organization_id,public_slug,transaction_kind,city) values('00000000-0000-0000-0000-000000000002','other','rent','Cluj');
        insert into properties(organization_id,public_slug,publish_status) values('00000000-0000-0000-0000-000000000001','draft','unpublished');
        insert into properties(organization_id,public_slug,cloned_from_property_id) select organization_id,'copy',id from properties where public_slug='offer-1';
        insert into developments values('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','Ansamblu A',null);
        update properties set development_id='00000000-0000-0000-0000-000000000011' where public_slug='offer-1';`);
      const read = async (slug: string) => (await db.query<{ data: unknown }>("select public_agency_description_stats($1) data", [slug])).rows[0]?.data;
      const a = agencyDescriptionStatsSchema.parse(await read("a"));
      expect(a.total).toBe(1100); expect(a.sale).toBe(1100); expect(a.rent).toBe(0);
      expect(a.types).toEqual([{ value: "apartment", count: 1100 }]);
      expect(a.places).toEqual([{ value: "Brașov — Tractorul", count: 1100 }]);
      expect(a.developments).toEqual(["Ansamblu A"]);
      expect(JSON.stringify(a)).not.toMatch(/SECRET|owner|private_notes|Cluj/);
      expect(agencyDescriptionStatsSchema.parse(await read("b")).total).toBe(1);
      expect(await read("hidden")).toBeNull();
      await db.exec("update properties set publish_status='unpublished' where public_slug='offer-1'");
      // Its copy becomes eligible when the original is no longer public.
      expect(agencyDescriptionStatsSchema.parse(await read("a")).total).toBe(1100);
      await db.exec("update properties set publish_status='unpublished' where public_slug='offer-2'");
      expect(agencyDescriptionStatsSchema.parse(await read("a")).total).toBe(1099);
    } finally { await db.close(); }
  });
});