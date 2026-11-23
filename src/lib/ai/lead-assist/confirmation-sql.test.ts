import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = "Vreau să cumpăr 2 camere în Brașov. Buget 80.000 EUR.";
const changes = [
  { field: "kind", value: "buy", evidence: "Vreau să cumpăr 2 camere în Brașov." },
  { field: "budget_max", value: 80000, evidence: "Buget 80.000 EUR." },
  { field: "currency", value: "EUR", evidence: "Buget 80.000 EUR." },
  { field: "rooms_min", value: 2, evidence: "Vreau să cumpăr 2 camere în Brașov." },
  { field: "cities", value: ["Brașov"], evidence: "Vreau să cumpăr 2 camere în Brașov." },
];
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create function current_org() returns uuid language sql as $$ select nullif(current_setting('test.org',true),'')::uuid $$;
    create function is_org_admin() returns boolean language sql as $$ select current_setting('test.admin',true)='true' $$;
    create function is_superadmin() returns boolean language sql as $$ select false $$;
    create table organizations(id uuid primary key, ai_enabled boolean default true, status text default 'active');
    create table organization_ai_features(organization_id uuid,feature_key text,enabled boolean);
    create table leads(id uuid primary key,organization_id uuid,name text,assigned_to uuid,created_by uuid,deleted_at timestamptz,contact_id uuid,request_id uuid);
    create table portal_messages(id uuid primary key,organization_id uuid,lead_id uuid,body text,direction text);
    create table ai_credit_costs(action text primary key,credits int, constraint ai_credit_costs_action_check check(action in ('text_fast')));
    create table requests(id uuid primary key default gen_random_uuid(),organization_id uuid,contact_id uuid,assigned_to uuid,created_by uuid,updated_by uuid,
      kind text not null default 'buy',title text,source text,budget_min numeric,budget_max numeric,currency text not null default 'EUR',cities text[] not null default '{}',areas text[] not null default '{}',
      rooms_min numeric,rooms_max numeric,surface_min numeric,property_type text,wants_parking boolean,wants_balcony boolean,furnished boolean,pets_allowed boolean,term text,status text default 'active');
    create table active_match_queue(id uuid primary key default gen_random_uuid(),organization_id uuid,trigger text,request_id uuid);
    insert into organizations(id) values('${id(1)}'),('${id(2)}');
    insert into leads(id,organization_id,name,assigned_to,created_by) values('${id(10)}','${id(1)}','Client','${id(100)}','${id(100)}');
    set test.actor='${id(100)}'; set test.org='${id(1)}'; set test.admin='false';`);
  await db.exec(readFileSync("drizzle/migrations/0275_lead_ai_insights.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0329_lead_ai_confirmed_requests_and_scores.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0330_lead_ai_confirmation_defaults_and_matching.sql", "utf8"));
  const matching = readFileSync("drizzle/migrations/0276_active_match_alerts.sql", "utf8");
  const trigger = matching.match(/CREATE OR REPLACE FUNCTION public\.requests_queue_active_match[\s\S]*?CREATE TRIGGER requests_queue_active_match[\s\S]*?EXECUTE FUNCTION public\.requests_queue_active_match\(\);/)?.[0];
  if (!trigger) throw new Error("Missing existing matching trigger");
  await db.exec(trigger);
  await db.query("insert into lead_ai_insights(id,organization_id,lead_id,status,source_kind,source_text,proposed_changes,score,score_reason) values($1,$2,$3,'done','note',$4,$5,95,'Buget și vizionare')", [id(20), id(1), id(10), source, JSON.stringify(changes)]);
});
afterEach(async () => { await db.close(); });

describe("cerere numai după confirmare, cu izolare și potriviri", () => {
  it("nu există cerere înainte de confirmare; confirmarea este idempotentă și pornește potrivirile", async () => {
    expect((await db.query("select * from requests")).rows).toHaveLength(0);
    const fields = changes.map(c => c.field);
    const first = (await db.query<{ result: string }>("select confirm_lead_ai_request($1,$2) result", [id(20), fields])).rows[0]?.result;
    expect(first).toBeTruthy();
    const second = (await db.query<{ result: string }>("select confirm_lead_ai_request($1,$2) result", [id(20), fields])).rows[0]?.result;
    expect(second).toBe(first);
    expect((await db.query("select organization_id,assigned_to,budget_max,currency,cities from requests")).rows).toEqual([{ organization_id: id(1), assigned_to: id(100), budget_max: "80000", currency: "EUR", cities: ["Brașov"] }]);
    expect((await db.query("select * from active_match_queue")).rows).toHaveLength(1);
  });
  it("se salvează doar câmpurile selectate, fără câmpuri inventate sau buget fără monedă", async () => {
    await expect(db.query("select confirm_lead_ai_request($1,$2)", [id(20), ["kind", "budget_max"]])).rejects.toThrow("moneda");
    await db.query("select confirm_lead_ai_request($1,$2)", [id(20), ["kind", "rooms_min"]]);
    expect((await db.query("select budget_max,rooms_min,currency from requests")).rows).toEqual([{ budget_max: null, rooms_min: "2", currency: "EUR" }]);
  });
  it("alt agent, altă agenție și AI dezactivat nu pot confirma", async () => {
    await db.exec(`set test.actor='${id(101)}'`);
    await expect(db.query("select confirm_lead_ai_request($1,$2)", [id(20), ["kind"]])).rejects.toThrow("Lead-ul nu este disponibil");
    await db.exec(`set test.actor='${id(100)}'; set test.org='${id(2)}'`);
    await expect(db.query("select confirm_lead_ai_request($1,$2)", [id(20), ["kind"]])).rejects.toThrow("Lead-ul nu este disponibil");
    await db.exec(`set test.org='${id(1)}'; update organizations set ai_enabled=false where id='${id(1)}'`);
    await expect(db.query("select confirm_lead_ai_request($1,$2)", [id(20), ["kind"]])).rejects.toThrow("Funcțiile AI nu sunt activate");
    expect((await db.query("select * from requests")).rows).toHaveLength(0);
  });
  it("actualizează cererea existentă, păstrează restul și repornește potrivirile", async () => {
    await db.exec(`insert into requests(id,organization_id,assigned_to,created_by,title,budget_max,cities) values('${id(30)}','${id(1)}','${id(100)}','${id(100)}','Titlu existent',70000,array['Săcele']); update leads set request_id='${id(30)}' where id='${id(10)}';`);
    await db.query("select confirm_lead_ai_request($1,$2)", [id(20), ["budget_max", "currency", "cities"]]);
    const result = (await db.query<{ title: string; budget_max: string; cities: string[] }>("select title,budget_max,cities from requests")).rows[0];
    expect(result?.title).toBe("Titlu existent"); expect(result?.budget_max).toBe("80000"); expect(result?.cities.sort()).toEqual(["Brașov", "Săcele"]);
    expect((await db.query("select * from active_match_queue")).rows).toHaveLength(2); // Existing insert + confirmed update.
  });
  it("fără fragment real sau cu interval contradictoriu nu modifică cereri", async () => {
    await db.query("update lead_ai_insights set proposed_changes=$1 where id=$2", [JSON.stringify([{ field: "kind", value: "buy", evidence: "Inventat" }]), id(20)]);
    await expect(db.query("select confirm_lead_ai_request($1,$2)", [id(20), ["kind"]])).rejects.toThrow("dovadă");
    expect((await db.query("select * from requests")).rows).toHaveLength(0);
  });
});