import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const ADMIN = "11111111-1111-4111-8111-111111111111";
let pg: PGlite;
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const sql = fn === "outreach_unsubscribe" ? "select outreach_unsubscribe($1,$2,$3) r" : "select outreach_unsubscribe_preview($1,$2) r";
      const params = fn === "outreach_unsubscribe" ? [args._token, args._ip, args._channel] : [args._token, args._ip];
      const res = await pg.query<{ r: unknown }>(sql, params);
      return { data: res.rows[0]?.r, error: null };
    },
  }),
}));
process.env.SUPABASE_URL = "http://x"; process.env.SUPABASE_PUBLISHABLE_KEY = "k";
const { Route } = await import("@/routes/api/public/outreach/unsubscribe");
const post = (token: string, ip = "1.1.1.1") => (Route.options.server!.handlers as any).POST({ request: new Request(`http://x/api/public/outreach/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "cf-connecting-ip": ip } }) }) as Promise<Response>;
const state = async () => (await pg.query<{ email: string; status: string }>("select email,status::text from outreach_recipients order by email,list_id")).rows;
const audits = async () => Number((await pg.query<{ c: number }>("select count(*)::int c from audit_logs where action='outreach.unsubscribe'")).rows[0].c);
let token = "";

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TYPE app_role AS ENUM ('superadmin'); CREATE TABLE user_roles(user_id uuid,role app_role); INSERT INTO user_roles VALUES ('${ADMIN}','superadmin');
    CREATE FUNCTION has_role(_user_id uuid,_role app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(), actor_id uuid,action text,entity text,entity_id uuid,old_values jsonb,new_values jsonb);
    SET test.uid='${ADMIN}';`);
  await pg.exec(readFileSync("drizzle/migrations/0265_outreach_recipient_lists.sql", "utf8"));
  await pg.query("select outreach_import('A',$1)", [JSON.stringify([{ email: "office@agentie.ro" }, { email: "other@agentie.ro" }])]);
  await pg.exec(readFileSync("drizzle/migrations/0266_outreach_unsubscribe.sql", "utf8"));
  await pg.query("select outreach_import('B',$1)", [JSON.stringify([{ email: "office@agentie.ro" }])]);
  token = (await pg.query<{ t: string }>("select unsubscribe_token t from outreach_recipients where email='office@agentie.ro' order by created_at limit 1")).rows[0].t;
});
afterAll(async () => { await pg.close(); });

describe("Outreach unsubscribe", () => {
  it("generates unique 64-char URL-safe tokens for existing and imported rows", async () => {
    const rows = (await pg.query<{ t: string }>("select unsubscribe_token t from outreach_recipients")).rows;
    expect(rows).toHaveLength(3);
    rows.forEach((r) => expect(r.t).toMatch(/^[A-Za-z0-9_-]{64}$/));
    expect(new Set(rows.map((r) => r.t)).size).toBe(3);
  });
  it("GET preview masks the email and does not unsubscribe", async () => {
    const { data } = await (await import("@supabase/supabase-js")).createClient("", "").rpc("outreach_unsubscribe_preview", { _token: token, _ip: "9.9.9.9" }) as { data: { status: string; masked_email: string } };
    expect(data).toEqual({ status: "ok", masked_email: "of***@agentie.ro" });
    expect((await state()).every((r) => r.status === "pending")).toBe(true);
    expect(await pg.query("select 1 from outreach_suppressions")).toMatchObject({ rows: [] });
  });
  it("invalid or malformed token returns 404 and changes nothing", async () => {
    expect((await post("x".repeat(64))).status).toBe(404);
    expect((await post("bad")).status).toBe(404);
    expect((await state()).every((r) => r.status === "pending")).toBe(true);
    expect(await audits()).toBe(0);
  });
  it("valid token unsubscribes the email across all lists with suppression and audit", async () => {
    expect((await post(token)).status).toBe(200);
    expect(await state()).toEqual([{ email: "office@agentie.ro", status: "unsubscribed" }, { email: "office@agentie.ro", status: "unsubscribed" }, { email: "other@agentie.ro", status: "pending" }]);
    expect((await pg.query("select reason from outreach_suppressions where email='office@agentie.ro'")).rows).toEqual([{ reason: "unsubscribe_link" }]);
    expect(await audits()).toBe(1);
  });
  it("repeated call is idempotent", async () => {
    const before = await state();
    expect((await post(token)).status).toBe(200);
    expect(await state()).toEqual(before);
    expect((await pg.query("select count(*)::int c from outreach_suppressions")).rows).toEqual([{ c: 1 }]);
  });
  it("rate-limits by IP", async () => {
    for (let i = 0; i < 30; i++) await post("bad".padEnd(64, "z"), "5.5.5.5");
    expect((await post(token, "5.5.5.5")).status).toBe(429);
  });
});
