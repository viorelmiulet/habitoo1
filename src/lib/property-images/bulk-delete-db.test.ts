import { beforeAll, it, expect, describe } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { bulkDeletePropertyImages } from "./bulk-delete";

let db: PGlite;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function as(uid: number) { await db.exec(`reset role;set test.uid='${id(uid)}';set role authenticated;`); }
async function del(uid: number, prop: number, imgs: number[]) {
  await as(uid);
  try { return (await db.query<{ r: string[] }>("select delete_property_images($1,$2) r", [id(prop), imgs.map(id)])).rows[0]?.r; }
  finally { await db.exec("reset role"); }
}
const images = async (prop: number) => (await db.query<{ id: string; position: number; is_primary: boolean }>(
  "select id,position,is_primary from property_images where property_id=$1 order by position", [id(prop)])).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
  create role authenticated;create role anon;create role service_role;create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  create table profiles(id uuid primary key,organization_id uuid);
  create table user_roles(user_id uuid,role text,organization_id uuid);
  create function current_org() returns uuid language sql stable security definer as $$select organization_id from profiles where id=auth.uid()$$;
  create function is_org_admin() returns boolean language sql stable security definer as $$select exists(select 1 from user_roles where user_id=auth.uid() and role='agency_admin' and organization_id=current_org())$$;
  create function is_superadmin() returns boolean language sql stable as $$select false$$;
  create table properties(id uuid primary key,organization_id uuid,assigned_to uuid,deleted_at timestamptz,publish_status text);
  create table property_images(id uuid primary key,organization_id uuid,property_id uuid,storage_path text,position int,is_primary boolean default false,created_at timestamptz default now());
  create table audit_logs(organization_id uuid,actor_id uuid,action text,entity text,entity_id uuid,new_values jsonb);
  grant usage on schema auth to authenticated;
  `);
  await db.exec(readFileSync("drizzle/migrations/0229_property_images_primary_is_first.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0323_bulk_delete_property_images.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
  await db.exec(`
  insert into profiles values('${id(10)}','${id(1)}'),('${id(11)}','${id(1)}'),('${id(20)}','${id(2)}');
  insert into properties values('${id(40)}','${id(1)}','${id(10)}',null,'published'),('${id(41)}','${id(1)}','${id(11)}',null,null),('${id(50)}','${id(2)}','${id(20)}',null,null);
  insert into property_images(id,organization_id,property_id,storage_path,position) select ('00000000-0000-4000-8000-'||lpad((100+g)::text,12,'0'))::uuid,'${id(1)}','${id(40)}','org1/p40/'||g||'.jpg',g from generate_series(0,4) g;
  insert into property_images(id,organization_id,property_id,storage_path,position) values('${id(200)}','${id(1)}','${id(41)}','org1/p41/0.jpg',0),('${id(300)}','${id(2)}','${id(50)}','org2/p50/0.jpg',0);
  `);
});

describe("ștergerea mai multor fotografii", () => {
  it("refuză agentul pe anunțul altui agent", async () => {
    await expect(del(10, 41, [200])).rejects.toThrow(/drept/);
    expect(await images(41)).toHaveLength(1);
  });
  it("refuză agentul pe anunțul altei agenții", async () => {
    await expect(del(10, 50, [300])).rejects.toThrow(/drept/);
    expect(await images(50)).toHaveLength(1);
  });
  it("refuză în întregime poze amestecate din două proprietăți", async () => {
    await expect(del(10, 40, [101, 200])).rejects.toThrow(/aceluiași anunț/);
    expect(await images(40)).toHaveLength(5);
    expect(await images(41)).toHaveLength(1);
  });
  it("șterge mai multe poze, reatribuie principala, renumerotează și scrie auditul", async () => {
    const paths = await del(10, 40, [100, 102, 103]);
    expect([...(paths ?? [])].sort()).toEqual(["org1/p40/0.jpg", "org1/p40/2.jpg", "org1/p40/3.jpg"]);
    const rest = await images(40);
    expect(rest.map((r) => r.id)).toEqual([id(101), id(104)]);
    expect(rest.map((r) => r.position)).toEqual([0, 1]);
    expect(rest.map((r) => r.is_primary)).toEqual([true, false]);
    const audit = (await db.query<{ actor_id: string; entity_id: string; new_values: { deleted_count: number } }>("select * from audit_logs where action='property_images.bulk_delete'")).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actor_id).toBe(id(10));
    expect(audit[0]?.entity_id).toBe(id(40));
    expect(audit[0]?.new_values.deleted_count).toBe(3);
  });
});

describe("după ștergere", () => {
  const ports = (publishStatus: string | null, calls: string[]) => ({
    deleteRows: async () => ["a.jpg", "b.jpg"],
    removeFiles: async (p: string[]) => { calls.push(`files:${p.length}`); },
    loadProperty: async () => ({ organizationId: id(1), publishStatus }),
    enqueuePortalUpdates: async (_o: string, prop: string) => { calls.push(`portals:${prop}`); },
  });
  it("anunțul publicat primește actualizarea pe portaluri", async () => {
    const calls: string[] = [];
    const r = await bulkDeletePropertyImages(ports("published", calls), id(40), [id(1), id(2)]);
    expect(r).toMatchObject({ deleted: 2, portalsQueued: true });
    expect(calls).toEqual(["files:2", `portals:${id(40)}`]);
  });
  it("anunțul nepublicat nu pune nimic în coada portalurilor", async () => {
    const calls: string[] = [];
    const r = await bulkDeletePropertyImages(ports("draft", calls), id(40), [id(1)]);
    expect(r.portalsQueued).toBe(false);
    expect(calls).toEqual(["files:2"]);
  });
  it("un refuz pe server nu șterge fișiere și nu atinge portalurile", async () => {
    const calls: string[] = [];
    await expect(bulkDeletePropertyImages({ ...ports("published", calls), deleteRows: async () => { throw new Error("refuzat"); } }, id(40), [id(1)])).rejects.toThrow("refuzat");
    expect(calls).toEqual([]);
  });
});
