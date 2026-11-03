import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { encryptPii } from "./crypto.server";
import { maskedContactIdentity, identityPartyValues } from "./contact-identity.server";
import type { Database } from "@/integrations/supabase/types";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const org = "33333333-3333-4333-8333-333333333333";
const otherOrg = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
const migration = readFileSync("drizzle/migrations/0231_contracts_c1_number_assignment_identities.sql", "utf8");
beforeAll(async () => {
  vi.stubEnv("CONTRACT_PII_KEY", "test-only-contract-key-not-a-real-secret");
  db = new PGlite();
  await db.exec(`CREATE SCHEMA auth;
    CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
    CREATE FUNCTION public.current_org() RETURNS uuid LANGUAGE sql AS $$SELECT '${org}'::uuid$$;
    CREATE FUNCTION public.is_superadmin() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.super',true),'')='true'$$;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid);
    CREATE TABLE user_roles(user_id uuid,organization_id uuid,role text);
    CREATE FUNCTION public.is_org_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND organization_id=public.current_org() AND role='agency_admin')$$;
    CREATE TABLE contacts(id uuid PRIMARY KEY,organization_id uuid,assigned_to uuid);
    CREATE TABLE contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,created_by uuid,created_at timestamptz DEFAULT now(),body text DEFAULT '',data jsonb DEFAULT '{}');
    CREATE TABLE contract_parties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contract_id uuid,organization_id uuid);
    ALTER TABLE contracts ENABLE ROW LEVEL SECURITY; ALTER TABLE contract_parties ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON contracts,contract_parties TO authenticated;
    CREATE POLICY contracts_select ON contracts FOR SELECT TO authenticated USING(false);
    CREATE POLICY contracts_insert ON contracts FOR INSERT TO authenticated WITH CHECK(false);
    CREATE POLICY contracts_update ON contracts FOR UPDATE TO authenticated USING(false);
    CREATE POLICY contracts_delete ON contracts FOR DELETE TO authenticated USING(false);
    CREATE POLICY parties_insert ON contract_parties FOR INSERT TO authenticated WITH CHECK(false);
    CREATE FUNCTION can_access_contract(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    CREATE POLICY parties_select ON contract_parties FOR SELECT TO authenticated USING(can_access_contract(contract_id));
    INSERT INTO organizations VALUES('${org}'),('${otherOrg}');
    INSERT INTO profiles VALUES('${a}','${org}'),('${b}','${org}');
    SELECT set_config('test.uid','${a}',false);`);
  await db.exec(migration);
});
afterAll(async () => { await db.close(); vi.unstubAllEnvs(); });

it("generates CT-2026-0001, advances per agency and resolves the contract variable", async () => {
  const y = new Date().toLocaleString("en", {timeZone:"Europe/Bucharest",year:"numeric"});
  const rows = await db.query<{ number: string; data: {contractNumber:string}; body:string; assigned_to:string }>(`INSERT INTO contracts(organization_id,created_by,body) VALUES('${org}','${a}','Număr {{contract.numar}}'),('${org}','${a}','Număr {{contract.numar}}') RETURNING *`);
  expect(rows.rows.map(r=>r.number)).toEqual([`CT-${y}-0001`,`CT-${y}-0002`]);
  expect(rows.rows[0]?.body).toBe(`Număr CT-${y}-0001`);
  expect(rows.rows[0]?.data.contractNumber).toBe(`CT-${y}-0001`);
  expect(rows.rows[0]?.assigned_to).toBe(a);
  const separate = await db.query<{number:string}>(`INSERT INTO contracts(organization_id,created_by) VALUES('${otherOrg}','${a}') RETURNING number`);
  expect(separate.rows[0]?.number).toBe(`CT-${y}-0001`);
});

it("restarts at 0001 in a new year without changing prior-year counters", async () => {
  // Replace only the clock expression; execute the exact production trigger body.
  const definition = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.contracts_c1_number()"),migration.indexOf("REVOKE ALL ON FUNCTION public.contracts_c1_number()"));
  await db.exec(definition.replace("extract(year FROM now() AT TIME ZONE 'Europe/Bucharest')::integer", "2027"));
  const row=await db.query<{number:string}>(`INSERT INTO contracts(organization_id,created_by) VALUES('${org}','${a}') RETURNING number`);
  expect(row.rows[0]?.number).toBe("CT-2027-0001");
  const previous=await db.query<{last_number:number}>(`SELECT last_number FROM contract_number_counters WHERE organization_id='${org}' AND year=2026`);
  expect(Number(previous.rows[0]?.last_number)).toBe(2);
  await db.exec(definition);
});

it("simultaneous creates have distinct consecutive numbers", async () => {
  const results=await Promise.all(Array.from({length:12},()=>db.query<{number:string}>(`INSERT INTO contracts(organization_id,created_by) VALUES('${org}','${a}') RETURNING number`)));
  const values=results.map(r=>r.rows[0]?.number);
  expect(new Set(values).size).toBe(12);
  expect(values.map(v=>Number(v?.split('-')[2])).sort((a,b)=>a-b)).toEqual(Array.from({length:12},(_,i)=>i+3));
});

it("agent reads only created or assigned contracts and their parties; admin/superadmin retain access", async () => {
  await db.exec(`INSERT INTO contracts(organization_id,created_by,assigned_to) VALUES('${org}','${b}','${b}'),('${org}','${b}','${a}'); INSERT INTO contract_parties(contract_id,organization_id) SELECT id,organization_id FROM contracts; SET ROLE authenticated;`);
  const own=await db.query<{created_by:string;assigned_to:string;organization_id:string}>("SELECT * FROM contracts");
  expect(own.rows.length).toBe(16);
  expect(own.rows.every(r=>r.organization_id===org && (r.created_by===a||r.assigned_to===a))).toBe(true);
  const parties=await db.query("SELECT * FROM contract_parties"); expect(parties.rows.length).toBe(16);
  await db.exec(`RESET ROLE; INSERT INTO user_roles VALUES('${a}','${org}','agency_admin'); SET ROLE authenticated;`);
  expect((await db.query("SELECT * FROM contracts")).rows.length).toBe(17);
  await db.exec("SELECT set_config('test.super','true',false)");
  expect((await db.query("SELECT * FROM contracts")).rows.length).toBe(18);
  await db.exec("RESET ROLE; SELECT set_config('test.super','false',false); DELETE FROM user_roles WHERE user_id='"+a+"';");
});

it("identity RLS excludes another agent's client, allows responsible agent and agency admin", async () => {
  await db.exec(`INSERT INTO contacts VALUES('${a}','${org}','${a}'),('${b}','${org}','${b}'); INSERT INTO contact_identities(contact_id,full_name) VALUES('${a}','Client propriu'),('${b}','Alt client'); SET ROLE authenticated;`);
  expect((await db.query<{contact_id:string}>("SELECT contact_id FROM contact_identities")).rows.map(r=>r.contact_id)).toEqual([a]);
  await db.exec(`RESET ROLE; INSERT INTO user_roles VALUES('${a}','${org}','agency_admin'); SET ROLE authenticated;`);
  expect((await db.query("SELECT * FROM contact_identities")).rows.length).toBe(2);
  await db.exec("RESET ROLE");
});

it("contact identity DTO masks CNP and removes encrypted identity fields; server copy uses original", () => {
  const row={id:a,contact_id:a,doc_type:"ci",full_name:"Client Test",cnp_enc:encryptPii("1960101123456"),id_series_enc:encryptPii("AB"),id_number_enc:encryptPii("123456")} as Database["public"]["Tables"]["contact_identities"]["Row"];
  const dto=maskedContactIdentity(row);
  expect(dto.cnp).toBe("•••••••••3456");
  expect(dto).not.toHaveProperty("cnp_enc");
  expect(dto.idSeries).toBe("••"); expect(dto.idNumber).toBe("••••");
  expect(JSON.stringify(dto)).not.toContain("1960101123456");
  expect(identityPartyValues(row).cnp).toBe("1960101123456");
});