import { beforeAll, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { agenciesInScope, agencyInactiveReason, agencyInactivitySql } from "./agency-stats-scope";

let db: PGlite;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = Date.parse("2026-11-20T05:20:00Z");
const orgs = [
  { id: id(1), name: "A", status: "active", subscription_expires_at: null },
  { id: id(2), name: "S", status: "suspended", subscription_expires_at: null },
  { id: id(3), name: "E", status: "active", subscription_expires_at: "2026-11-19T05:20:00Z" },
  { id: id(4), name: "C", status: "cancelled", subscription_expires_at: null },
];
const migration = readFileSync("drizzle/migrations/0291_sa2_active_agency_statistics.sql", "utf8");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function public.is_superadmin() returns boolean language sql as $$select coalesce(current_setting('test.superadmin',true),'false')='true'$$;
    create table organizations(id uuid,name text,plan text,status text,is_trial boolean,is_demo boolean,max_users int,
      subscription_expires_at timestamptz,created_at timestamptz default now(),ai_enabled boolean,archived_at timestamptz);
    create table profiles(id uuid,organization_id uuid,is_active boolean,full_name text);
    create table auth.users(id uuid,last_sign_in_at timestamptz);
    create table properties(id uuid,organization_id uuid,assigned_to uuid,status text,deleted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
    create table portal_publications(property_id uuid,organization_id uuid,enabled boolean,status text);
    create table leads(organization_id uuid,assigned_to uuid,deleted_at timestamptz,stage text,created_at timestamptz default now());
    create table requests(organization_id uuid,status text);
    create table contacts(organization_id uuid);
    create table portal_integrations(organization_id uuid,portal_key text,enabled boolean);
    create table extension_tokens(organization_id uuid,revoked_at timestamptz);
    create table property_capture_sources(organization_id uuid,created_at timestamptz);
    create table ai_credit_ledger(organization_id uuid,month_start date,status text,credits int);
    create table user_roles(user_id uuid,role text);
    create table activities(organization_id uuid,assigned_to uuid,created_at timestamptz);
  `);
  await db.exec(migration);
  for (const [index, org] of orgs.entries()) {
    await db.query("insert into organizations(id,name,status,subscription_expires_at) values($1,$2,$3,$4)", [org.id, org.name, org.status, org.subscription_expires_at]);
    await db.query("insert into profiles values($1,$2,true,$3)", [id(10 + index), org.id, org.name]);
    await db.query("insert into leads(organization_id,stage) values($1,'new')", [org.id]);
    for (let p = 0; p <= index; p++) {
      const propId = id(100 + index * 10 + p);
      await db.query("insert into properties(id,organization_id,status) values($1,$2,'active')", [propId, org.id]);
      await db.query("insert into portal_publications values($1,$2,true,'synced')", [propId, org.id]);
    }
  }
  await db.query("insert into organizations(id,name,status,is_demo) values($1,'Demo','active',true)", [id(5)]);
  await db.query("insert into organizations(id,name,status,archived_at) values($1,'Arhivată','active',now())", [id(6)]);
  await db.exec("set test.superadmin='true'");
});
afterAll(async () => { await db.close(); });
async function rpc<T>(fn: string, args = "") {
  const result = await db.query<{ result: T }>(`select public.${fn}(${args}) result`);
  return result.rows[0]?.result;
}

it("regula SQL aplicată este generată din aceeași definiție ca TS", () => {
  expect(migration.startsWith(agencyInactivitySql())).toBe(true);
});
it("Active conține doar A; toate totalurile exclud S, E și C", async () => {
  expect(agenciesInScope(orgs, "active", false, now).map((o) => o.name)).toEqual(["A"]);
  expect((await rpc<{ name: string }[]>("superadmin_agency_stats"))?.map((o) => o.name)).toEqual(["A"]);
  expect(await rpc("superadmin_platform_totals")).toEqual({ agencies_active: 1, agencies_trial: 0, agencies_suspended: 0,
    agencies_new_30d: 1, users_active: 1, listings_active: 1, listings_published: 1, leads_30d: 1 });
});
it("Inactive conține S, E, C cu motivul corect și fără statistici de utilizare", async () => {
  expect(agenciesInScope(orgs, "inactive", false, now).map((o) => [o.name, agencyInactiveReason(o, now)]))
    .toEqual([["S", "suspended"], ["E", "expired"], ["C", "cancelled"]]);
  const rows = await rpc<{ name: string; inactive_reason: string; listings_total: number; users_total: number; listings_active?: number }[]>("superadmin_inactive_agencies");
  expect(rows?.map((o) => [o.name, o.inactive_reason, o.listings_total, o.users_total]))
    .toEqual([["C", "cancelled", 4, 1], ["E", "expired", 3, 1], ["S", "suspended", 2, 1]]);
  expect(rows?.every((o) => o.listings_active === undefined)).toBe(true);
});
it("trialul expirat și grația sunt inactive; termenul exact nu este încă trecut", async () => {
  const exp = { status: "trial", subscription_expires_at: "2026-11-19T05:20:00Z" };
  expect(agencyInactiveReason(exp, now)).toBe("expired");
  expect(agencyInactiveReason({ ...exp, subscription_expires_at: new Date(now).toISOString() }, now)).toBe(null);
  const r = await db.query<{ reason: string }>("select agency_stats_inactive_reason('trial',$1,$2) reason", [exp.subscription_expires_at, new Date(now).toISOString()]);
  expect(r.rows[0]?.reason).toBe("expired");
});
it("demo este exclusă implicit și arhivatele nu reapar cu demo activat", async () => {
  expect((await rpc<{ name: string }[]>("superadmin_agency_stats", "true"))?.map((o) => o.name)).toEqual(["A", "Demo"]);
  expect(agenciesInScope([...orgs, { ...orgs[0], name: "Demo", is_demo: true }, { ...orgs[0], name: "Arhivată", archived_at: "2026-11-01" }], "active", false, now).map((o) => o.name)).toEqual(["A"]);
});
it("panoul de agenți întoarce gol pentru toate agențiile inactive", async () => {
  for (const org of orgs.slice(1)) expect(await rpc("superadmin_agency_agent_stats", `'${org.id}'`)).toEqual([]);
  expect((await rpc<unknown[]>("superadmin_agency_agent_stats", `'${id(1)}'`))?.length).toBe(2);
});
it("toate cele patru RPC-uri refuză non-superadmin", async () => {
  await db.exec("set test.superadmin='false'");
  try {
    for (const fn of ["superadmin_agency_stats", "superadmin_platform_totals", "superadmin_inactive_agencies", "superadmin_agency_agent_stats"])
      await expect(rpc(fn, fn === "superadmin_agency_agent_stats" ? `'${id(1)}'` : "")).rejects.toThrow("Acces refuzat");
  } finally { await db.exec("set test.superadmin='true'"); }
});