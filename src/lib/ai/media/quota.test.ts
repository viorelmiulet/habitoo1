import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_LIMITS, mediaQuotaError } from "./quota";

const org = "11111111-1111-4111-8111-111111111111";
let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${org}'::uuid$$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'authenticated'::text$$;
    CREATE FUNCTION public.is_superadmin() RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.super',true)='true'$$;
    CREATE FUNCTION public.current_org() RETURNS uuid LANGUAGE sql AS $$SELECT '${org}'::uuid$$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.ai_media_generations(id uuid DEFAULT gen_random_uuid(),organization_id uuid,kind text,status text,created_at timestamptz DEFAULT now(),created_by uuid);
    INSERT INTO public.organizations VALUES ('${org}');`);
  await db.exec(readFileSync(new URL("../../../../drizzle/migrations/0187_studio_ai_monthly_limits.sql", import.meta.url), "utf8"));
});
afterEach(async () => { await db.close(); });
async function reserve(kind = "photo_video") {
  return db.query("INSERT INTO ai_media_generations(organization_id,kind,status) VALUES ($1,$2,'running') RETURNING id", [org,kind]);
}
async function seed(kind: string, count: number, status: string, monthOffset = 0, deleted = false) {
  await db.exec("ALTER TABLE ai_media_generations DISABLE TRIGGER guard_ai_media_monthly_quota");
  await db.query(`INSERT INTO ai_media_generations(organization_id,kind,status,created_at,deleted_at)
    SELECT $1,$2,$3,(date_trunc('month',now() AT TIME ZONE 'Europe/Bucharest') + ($5::int * interval '1 month')) AT TIME ZONE 'Europe/Bucharest', CASE WHEN $6 THEN now() ELSE NULL END FROM generate_series(1,$4::int)`,[org,kind,status,count,monthOffset,deleted]);
  await db.exec("ALTER TABLE ai_media_generations ENABLE TRIGGER guard_ai_media_monthly_quota");
}
describe("actual PostgreSQL monthly quota trigger in an isolated database", () => {
  it.each([["marketing_image",50],["photo_enhance",30],["photo_video",10]] as const)("uses the %s default %i and refuses the next reservation",async(kind,limit)=>{
    expect(DEFAULT_MEDIA_LIMITS[kind]).toBe(limit);
    await seed(kind,limit,'succeeded');
    await expect(reserve(kind)).rejects.toThrow(`ai_media_limit:${kind}:${limit}:`);
  });
  it("does not count failed generations",async()=>{
    await seed('photo_video',10,'failed');
    await expect(reserve()).resolves.toBeDefined();
  });
  it("permits only one of two simultaneous reservations for the last video slot",async()=>{
    await seed('photo_video',9,'succeeded');
    const results = await Promise.allSettled([reserve(),reserve()]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    const count=await db.query<{n:number}>("select count(*)::int n from ai_media_generations where status in ('running','succeeded')");
    expect(count.rows[0].n).toBe(10);
  });
  it("releases a failed reservation without reducing successful usage",async()=>{
    await seed('photo_video',9,'succeeded');
    const result=await reserve(); const id=(result.rows[0] as {id:string}).id;
    await db.query("update ai_media_generations set status='failed' where id=$1",[id]);
    await expect(reserve()).resolves.toBeDefined();
  });
  it("ignores the previous calendar month and preserves deleted-success consumption",async()=>{
    await seed('photo_video',10,'succeeded',-1);
    await expect(reserve()).resolves.toBeDefined();
    await seed('marketing_image',50,'succeeded',0,true);
    await expect(reserve('marketing_image')).rejects.toThrow('ai_media_limit:marketing_image:50:');
  });
  it("uses the Romania midnight month boundary during both DST and standard time",async()=>{
    const result=await db.query<{local:string}>(`select to_char(date_trunc('month', t AT TIME ZONE 'Europe/Bucharest'),'YYYY-MM-DD') local from (values ('2026-10-31T21:59:59Z'::timestamptz),('2026-10-31T22:00:00Z'::timestamptz),('2026-06-30T20:59:59Z'::timestamptz),('2026-06-30T21:00:00Z'::timestamptz)) d(t)`);
    expect(result.rows.map(r=>r.local)).toEqual(['2026-10-01','2026-11-01','2026-06-01','2026-07-01']);
  });
  it("rejects limit edits by an ordinary user and allows SuperAdmin",async()=>{
    await db.exec("SET test.super='false'");
    await expect(db.query("update organizations set ai_media_video_limit=12")).rejects.toThrow('Doar SuperAdmin');
    await db.exec("SET test.super='true'");
    await db.query("update organizations set ai_media_video_limit=12");
    await seed('photo_video',11,'succeeded');
    await expect(reserve()).resolves.toBeDefined();
  });
  it("returns success-only monthly counts and configured defaults",async()=>{
    await seed('photo_video',3,'succeeded'); await seed('photo_video',2,'failed'); await reserve();
    const result=await db.query<{usage:any}>("select ai_media_monthly_usage() usage");
    expect(result.rows[0].usage.used.photo_video).toBe(3);
    expect(result.rows[0].usage.limits).toEqual(DEFAULT_MEDIA_LIMITS);
  });
});
describe("safe quota diagnostics",()=>{
  it("recognizes the database limit code",()=>{
    expect(mediaQuotaError('ai_media_limit:photo_video:10:2026-10-31 22:00:00+00:10:0')).not.toBeNull();
    expect(mediaQuotaError('unrelated')).toBeNull();
  });
});