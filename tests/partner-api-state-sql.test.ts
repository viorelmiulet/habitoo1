import { beforeAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let pg: PGlite;
const org = "00000000-0000-4000-8000-000000000001", p1 = "00000000-0000-4000-8000-000000000101", p2 = "00000000-0000-4000-8000-000000000102";
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE TABLE dynamic_feed_portals(slug text PRIMARY KEY, active boolean, integration_mode text);
    CREATE TABLE properties(id uuid PRIMARY KEY, organization_id uuid, title text);
    CREATE TABLE property_images(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE portal_publications(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE portal_connections(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE profiles(id uuid PRIMARY KEY, organization_id uuid);
    INSERT INTO dynamic_feed_portals VALUES ('exempluimob', true, 'api');`);
  await pg.exec(readFileSync("drizzle/migrations/0251_partner_api_read_state.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
});
const apply = (agencies: unknown[], listings: unknown[]) => pg.query("SELECT partner_api_apply_sync('exempluimob',$1,$2,'[]')", [JSON.stringify(agencies), JSON.stringify(listings)]);
const listing = (id: string, visible: boolean) => ({ property_id: id, organization_id: org, agent_id: null, content_hash: "h", visible, payload: { id } });

it("aplică activarea, anunțurile și retragerea în ordine, fără retrageri pentru anunțuri nevăzute", async () => {
  await apply([{ organization_id: org, active: true }], [listing(p1, true), listing(p2, false)]);
  await apply([], [listing(p1, false)]);
  await apply([{ organization_id: org, active: false }], []);
  const ev = await pg.query<{ type: string }>("SELECT type FROM partner_api_events ORDER BY seq");
  expect(ev.rows.map(r => r.type)).toEqual(["agency.activated", "listing.upserted", "listing.withdrawn", "agency.deactivated"]);
  const st = await pg.query<{ property_id: string; visible: boolean; withdrawn: boolean }>("SELECT property_id, visible, withdrawn_at IS NOT NULL AS withdrawn FROM partner_api_listing_state");
  expect(st.rows).toEqual([{ property_id: p1, visible: false, withdrawn: true }]);
});
it("salvarea unui anunț pune agenția în coadă, o singură dată", async () => {
  await pg.exec(`INSERT INTO properties VALUES ('${p1}','${org}','a'); UPDATE properties SET title='b';`);
  const q = await pg.query<{ organization_id: string }>("SELECT * FROM partner_api_take_sync_queue(10) AS organization_id");
  expect(q.rows.map(r => Object.values(r)[0])).toEqual([org]);
});
it("lease-ul permite un singur job simultan", async () => {
  const r = await pg.query<{ a: boolean; b: boolean }>("SELECT partner_api_sync_lease_acquire(gen_random_uuid(),60) a, partner_api_sync_lease_acquire(gen_random_uuid(),60) b");
  expect(r.rows[0]).toEqual({ a: true, b: false });
});
