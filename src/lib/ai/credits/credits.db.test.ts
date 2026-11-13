import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiCreditsExhaustedMessage, parseAiCreditError } from "./credits";

const dir = new URL("../../../../drizzle/migrations/", import.meta.url);
const migrationFile = process.env.AI_CREDITS_SQL ?? new URL(readdirSync(dir).find((f) => /_ai_credits\.sql$/.test(f))!, dir).pathname;

const org = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const property = "33333333-3333-4333-8333-333333333333";
let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${user}'::uuid$$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT coalesce(current_setting('test.role',true),'authenticated')$$;
    CREATE FUNCTION public.is_superadmin() RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.super',true)='true'$$;
    CREATE FUNCTION public.current_org() RETURNS uuid LANGUAGE sql AS $$SELECT '${org}'::uuid$$;
    CREATE TYPE org_status AS ENUM ('active','trial','suspended','cancelled','pending_approval');
    CREATE TABLE public.organizations(id uuid PRIMARY KEY, name text, plan text DEFAULT 'basic', status org_status DEFAULT 'trial', ai_enabled boolean NOT NULL DEFAULT false,
      ai_media_image_limit int, ai_media_enhance_limit int, ai_media_video_limit int);
    CREATE TABLE public.audit_logs(organization_id uuid, action text, created_at timestamptz DEFAULT now());
    CREATE TABLE public.organization_ai_features(organization_id uuid, feature_key text, enabled boolean);
    CREATE TABLE public.profiles(id uuid, organization_id uuid);
    CREATE TABLE public.properties(id uuid, organization_id uuid, deleted_at timestamptz);
    CREATE TABLE public.ai_usage_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, user_id uuid, provider text, model text, capability text, success boolean, tokens_unknown boolean);
    CREATE TABLE public.video_narrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, property_id uuid, created_by uuid, request_key uuid, text text, voice text, duration_sec numeric, model text, usage_event_id uuid, status text DEFAULT 'running', created_at timestamptz DEFAULT now());
    CREATE TABLE public.ai_media_generations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, kind text, status text, created_at timestamptz DEFAULT now(), created_by uuid);
    CREATE FUNCTION public.guard_ai_media_monthly_quota() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
    CREATE TRIGGER guard_ai_media_monthly_quota BEFORE INSERT OR UPDATE OR DELETE ON public.ai_media_generations FOR EACH ROW EXECUTE FUNCTION public.guard_ai_media_monthly_quota();
    INSERT INTO public.organizations(id,name) VALUES ('${org}','Agenția Test');
    INSERT INTO public.profiles VALUES ('${user}','${org}');
    INSERT INTO public.properties VALUES ('${property}','${org}',NULL);`);
  await db.exec(readFileSync(migrationFile, "utf8"));
  await db.exec("SET test.role='service_role'");
});
afterEach(async () => { await db.close(); });

const reserve = (action = "text_fast") =>
  db.query<{ id: string }>("select public.ai_credit_reserve($1,$2,$3) id", [org, user, action]);
const used = async () => (await db.query<{ n: number }>("select public.ai_credit_used($1, public.ai_credit_month(now())) n", [org])).rows[0].n;
async function consumeUpTo(remaining: number) {
  await db.query("update organizations set ai_bonus_credits = 0");
  await db.query("insert into ai_credit_ledger(organization_id,action,credits,status,month_start) values ($1,'text_fast',$2,'consumed',public.ai_credit_month(now()))", [org, 300 - remaining]);
}

describe("credite AI în PostgreSQL izolat", () => {
  it("folosește valorile implicite pe plan și costurile pe acțiune", async () => {
    const plans = await db.query<{ plan: string; monthly_credits: number }>("select plan, monthly_credits from ai_credit_plans order by monthly_credits");
    expect(plans.rows).toEqual([{ plan: "basic", monthly_credits: 300 }, { plan: "pro", monthly_credits: 1500 }, { plan: "unlimited", monthly_credits: 6000 }]);
    const costs = await db.query<{ action: string; credits: number }>("select action, credits from ai_credit_costs");
    expect(Object.fromEntries(costs.rows.map((r) => [r.action, r.credits]))).toEqual({ text_fast: 1, text_standard: 2, marketing_image: 10, photo_enhance: 10, photo_video: 40, ai_video_voice: 5 });
  });

  it("agenția în probă primește creditele planului, plus bonusul", async () => {
    await db.query("update organizations set plan='pro', status='trial', ai_bonus_credits=100");
    const r = await db.query<{ n: number }>("select public.ai_credit_limit($1) n", [org]);
    expect(r.rows[0].n).toBe(1600);
  });

  it("două cereri simultane cu 1 credit rămas: doar una trece", async () => {
    await consumeUpTo(1);
    const results = await Promise.allSettled([reserve(), reserve()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(parseAiCreditError(String(rejected.reason?.message))).toContain("(300/300)");
    expect(await used()).toBe(300);
  });

  it("apelul eșuat restituie creditele", async () => {
    await consumeUpTo(1);
    const { rows } = await reserve();
    await db.query("select public.ai_credit_settle($1,false)", [rows[0].id]);
    expect(await used()).toBe(299);
    await expect(reserve()).resolves.toBeDefined();
  });

  it("creditele epuizate dau mesajul cerut", async () => {
    await consumeUpTo(0);
    await expect(reserve()).rejects.toThrow(/ai_credits_exhausted:300:300:\d{4}-\d{2}-01/);
  });

  it("Studio AI rezervă la pornire și restituie la eșec", async () => {
    const { rows } = await db.query<{ id: string }>("insert into ai_media_generations(organization_id,kind,status,created_by) values ($1,'photo_video','running',$2) returning id", [org, user]);
    expect(await used()).toBe(40);
    await db.query("update ai_media_generations set status='failed' where id=$1", [rows[0].id]);
    expect(await used()).toBe(0);
    const ok = await db.query<{ id: string }>("insert into ai_media_generations(organization_id,kind,status,created_by) values ($1,'marketing_image','running',$2) returning id", [org, user]);
    await db.query("update ai_media_generations set status='succeeded' where id=$1", [ok.rows[0].id]);
    const st = await db.query<{ status: string }>("select status from ai_credit_ledger where ref=$1", [`media:${ok.rows[0].id}`]);
    expect(st.rows[0].status).toBe("consumed");
  });

  it("vocea fără rând de funcție e permisă și consumă 5 credite; cu enabled=false e blocată", async () => {
    await db.query("update organizations set ai_enabled=true");
    await db.query("select public.reserve_video_narration($1,$2,$3,gen_random_uuid(),'Un apartament luminos',$4,10,'gemini-2.5-flash-preview-tts')", [org, property, user, "female"]);
    expect(await used()).toBe(5);
    await db.query("insert into organization_ai_features values ($1,'ai_video_voice',false)", [org]);
    await expect(db.query("select public.reserve_video_narration($1,$2,$3,gen_random_uuid(),'Text',$4,10,'m')", [org, property, user, "female"])).rejects.toThrow(/nu este activată/);
  });

  it("luna se resetează la 1, ora României", async () => {
    const r = await db.query<{ d: string }>(`select to_char(public.ai_credit_month(t),'YYYY-MM-DD') d from (values ('2026-11-30T21:59:59Z'::timestamptz),('2026-11-30T22:00:00Z'::timestamptz),('2026-06-30T20:59:59Z'::timestamptz),('2026-06-30T21:00:00Z'::timestamptz)) v(t)`);
    expect(r.rows.map((x) => x.d)).toEqual(["2026-11-01", "2026-12-01", "2026-06-01", "2026-07-01"]);
    await db.query("insert into ai_credit_ledger(organization_id,action,credits,status,month_start) values ($1,'text_fast',300,'consumed',(public.ai_credit_month(now()) - interval '1 month')::date)", [org]);
    await expect(reserve()).resolves.toBeDefined();
  });

  it("agenția suspendată rămâne blocată", async () => {
    await db.query("update organizations set status='suspended'");
    await expect(reserve()).rejects.toThrow(/nu este activă/);
  });

  it("bonusul poate fi schimbat doar de SuperAdmin", async () => {
    await db.exec("SET test.role='authenticated'; SET test.super='false'");
    await expect(db.query("update organizations set ai_bonus_credits=50")).rejects.toThrow(/Doar SuperAdmin/);
    await db.exec("SET test.super='true'");
    await db.query("update organizations set ai_bonus_credits=50");
  });

  it("AI pornit implicit la agențiile noi și migrat pentru cele neoprite explicit", async () => {
    const r = await db.query<{ ai_enabled: boolean }>("select ai_enabled from organizations");
    expect(r.rows[0].ai_enabled).toBe(true);
  });
});

describe("mesajul de epuizare", () => {
  it("are formatul cerut", () => {
    expect(aiCreditsExhaustedMessage(300, 300, "2026-12-01")).toBe(
      "Ai folosit creditele AI incluse luna aceasta (300/300). Se resetează pe 1 decembrie. Administratorul agenției poate solicita credite suplimentare.",
    );
  });
});
