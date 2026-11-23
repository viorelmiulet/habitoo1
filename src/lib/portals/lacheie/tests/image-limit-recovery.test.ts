import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { recoverLaCheieImageLimitJobs } from "../recovery.server";

const org = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const message = "Oferta are 45 imagini publicabile, iar La Cheie acceptă maximum 30.";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE properties(id uuid PRIMARY KEY, organization_id uuid, status text DEFAULT 'active', publish_status text DEFAULT 'published', deleted_at timestamptz);
    CREATE TABLE portal_publications(organization_id uuid,property_id uuid,portal_key text,enabled boolean);
    CREATE TABLE portal_operation_logs(organization_id uuid,property_id uuid,portal text,success boolean,error_code text,error_message text);
    CREATE TABLE portal_publish_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid,property_id uuid,portal_key text,
      enabled boolean,promoted boolean,sync_existing boolean,requested_by uuid,superadmin boolean,operation text,status text DEFAULT 'queued',
      created_at timestamptz DEFAULT now(),next_attempt_at timestamptz DEFAULT now(),cancelled_at timestamptz,result_message text);
    CREATE UNIQUE INDEX active_pair ON portal_publish_jobs(property_id,portal_key) WHERE status IN ('queued','running');
    CREATE TABLE arms(n integer);
    CREATE FUNCTION portal_publish_arm() RETURNS void LANGUAGE plpgsql AS $$ BEGIN INSERT INTO arms VALUES(1); END $$;
  `);
  await db.exec(readFileSync("drizzle/migrations/0324_lacheie_image_limit_recovery.sql", "utf8"));
  return db;
}
async function fail(db: PGlite, n: number, portal = "lacheie", code = "VALIDATION_ERROR") {
  await db.query("INSERT INTO properties(id,organization_id) VALUES($1,$2)", [id(n), org]);
  await db.query(`INSERT INTO portal_publish_jobs(organization_id,property_id,portal_key,enabled,sync_existing,requested_by,superadmin,operation,status,result_message,created_at)
    VALUES($1,$2,$3,true,true,$4,false,'apply','error',$5,now()-interval '1 day')`, [org,id(n),portal,actor,message]);
  await db.query("INSERT INTO portal_operation_logs VALUES($1,$2,$3,false,$4,$5)", [org,id(n),portal,code,message]);
}
const run = async (db: PGlite, defer: boolean) => (await db.query<{ n: number }>("SELECT requeue_lacheie_image_limit_jobs($1) n", [defer])).rows[0]?.n;

describe("La Cheie — reluarea blocajelor istorice", () => {
  it("eroarea VALIDATION_ERROR intră o singură dată în coadă, fără să atingă alte portaluri", async () => {
    const db = await setup();
    try {
      await fail(db,1); await fail(db,2,"homepitch"); await fail(db,3,"lacheie","HTTP_ERROR");
      expect(await run(db,true)).toBe(1);
      expect(await run(db,true)).toBe(0);
      const rows = (await db.query<{ property_id: string; portal_key: string; next: string; requested_by: string; operation: string }>(
        "SELECT property_id,portal_key,next_attempt_at::text next,requested_by,operation FROM portal_publish_jobs WHERE status='queued'",
      )).rows;
      expect(rows).toEqual([{ property_id:id(1),portal_key:"lacheie",next:"infinity",requested_by:actor,operation:"apply" }]);
      expect((await db.query("SELECT * FROM arms")).rows).toHaveLength(0);
      expect(await run(db,false)).toBe(1);
      expect(await run(db,false)).toBe(0);
      expect((await db.query("SELECT * FROM arms")).rows).toHaveLength(1);
      expect((await db.query("SELECT * FROM portal_publish_jobs WHERE status='error'")).rows).toHaveLength(3);
    } finally { await db.close(); }
  });
  it("nu reia anunțuri retrase, șterse, debifate, anulate sau cu operații mai noi", async () => {
    const db = await setup();
    try {
      for (let n=1;n<=5;n++) await fail(db,n);
      await db.query("UPDATE properties SET status='sold' WHERE id=$1",[id(1)]);
      await db.query("UPDATE properties SET deleted_at=now() WHERE id=$1",[id(2)]);
      await db.query("INSERT INTO portal_publications VALUES($1,$2,'lacheie',false)",[org,id(3)]);
      await db.query("UPDATE portal_publish_jobs SET cancelled_at=now() WHERE property_id=$1",[id(4)]);
      await db.query("INSERT INTO portal_publish_jobs(organization_id,property_id,portal_key,status,enabled,created_at) VALUES($1,$2,'lacheie','done',true,now())",[org,id(5)]);
      expect(await run(db,true)).toBe(0);
    } finally { await db.close(); }
  });
  it("funcția de recuperare nu este accesibilă utilizatorilor obișnuiți", async () => {
    const db = await setup();
    try {
      await db.exec("SET ROLE authenticated");
      await expect(db.query("SELECT requeue_lacheie_image_limit_jobs(true)")).rejects.toThrow(/permission denied/);
    } finally { await db.close(); }
  });
  it("versiunea corectată deblochează prin RPC, fără apeluri directe către portal", async () => {
    const calls: unknown[] = [];
    const result = await recoverLaCheieImageLimitJobs({ rpc: async (name,args) => { calls.push([name,args]); return {data:2,error:null}; } });
    expect(result).toBe(2);
    expect(calls).toEqual([["requeue_lacheie_image_limit_jobs",{_defer:false}]]);
  });
});