import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { contractNumberVariables, documentText, printedContractNumber } from "./numbering";
import { renderTemplate } from "./templates";

const user = "11111111-1111-4111-8111-111111111111";
const org = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE SCHEMA auth; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${user}'::uuid$$;
    CREATE FUNCTION current_org() RETURNS uuid LANGUAGE sql AS $$SELECT '${org}'::uuid$$;
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE user_roles(user_id uuid,organization_id uuid,role text);
    CREATE TABLE contract_number_counters(organization_id uuid,year integer,last_number bigint,PRIMARY KEY(organization_id,year));
    CREATE TABLE contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,kind text,number text,assigned_to uuid,created_by uuid,body text DEFAULT '',data jsonb DEFAULT '{}');
    CREATE FUNCTION contracts_c1_number() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
    CREATE TRIGGER contracts_c1_number BEFORE INSERT ON contracts FOR EACH ROW EXECUTE FUNCTION contracts_c1_number();
    INSERT INTO organizations VALUES('${org}'),('${other}');
    INSERT INTO user_roles VALUES('${user}','${org}','agency_admin');`);
  await db.exec(readFileSync("drizzle/migrations/0232_contracts_c2_document_number_series.sql", "utf8"));
});
afterAll(async () => { await db.close(); });
type Row = { doc_series: string | null; doc_number: number | null; number: string; body: string; data: Record<string, string> };
const create = (kind: string, organization = org) => db.query<Row>(`INSERT INTO contracts(organization_id,created_by,kind,body) VALUES('${organization}','${user}','${kind}','{{contract.serie}}|{{contract.numar}}|{{contract.numar_intern}}') RETURNING *`);

it("applies chosen series and start separately for each numbered kind", async () => {
  await db.exec(`SELECT save_contract_number_series('commission','CM',150); SELECT save_contract_number_series('viewing','VZ',250); SELECT save_contract_number_series('exclusive_representation','EX',350);`);
  const c = (await create("commission")).rows[0];
  const v = (await create("viewing")).rows[0];
  const e = (await create("exclusive_representation")).rows[0];
  expect([c?.doc_series,c?.doc_number,v?.doc_series,v?.doc_number,e?.doc_series,e?.doc_number]).toEqual(["CM",150,"VZ",250,"EX",350]);
  expect(c?.body).toBe(`CM|150|${c?.number}`);
  expect(c?.data.contractNumber).toBe("150");
  expect(printedContractNumber(c?.doc_series,c?.doc_number)).toBe("seria CM nr. 150");
});
it("two simultaneous creations receive different consecutive numbers", async () => {
  const rows = await Promise.all([create("commission"),create("commission")]);
  expect(rows.map((r) => r.rows[0]?.doc_number).sort()).toEqual([151,152]);
  expect(new Set(rows.map((r) => r.rows[0]?.number)).size).toBe(2);
});
it("rental and loan for use do not consume printed numbers and have empty variables", async () => {
  const before = await db.query("SELECT * FROM contract_number_series ORDER BY kind");
  for (const kind of ["rent_agreement","loan_for_use"]) {
    const row = (await create(kind)).rows[0];
    expect(row?.doc_number).toBeNull(); expect(row?.doc_series).toBeNull();
    expect(row?.body).toBe(`||${row?.number}`);
    expect(renderTemplate("{{contract.serie}}|{{contract.numar}}",contractNumberVariables(kind))).toBe("|");
  }
  expect((await db.query("SELECT * FROM contract_number_series ORDER BY kind")).rows).toEqual(before.rows);
});
it("cannot reset below or to a used number, including when returning to a previous series", async () => {
  await expect(db.exec("SELECT save_contract_number_series('commission','CM',150)")).rejects.toThrow("mai mare decât 152");
  await expect(db.exec("SELECT save_contract_number_series('commission','CM',152)")).rejects.toThrow("mai mare decât 152");
  await db.exec("SELECT save_contract_number_series('commission','NEW',10)");
  expect((await create("commission")).rows[0]?.doc_number).toBe(10);
  await expect(db.exec("SELECT save_contract_number_series('commission','CM',1)")).rejects.toThrow("mai mare decât 152");
});
it("unconfigured agency starts at 1 without series independently for each kind", async () => {
  for (const kind of ["commission","viewing","exclusive_representation"]) {
    const row = (await create(kind,other)).rows[0];
    expect(row?.doc_series).toBe(""); expect(row?.doc_number).toBe(1);
  }
  expect((await create("viewing",other)).rows[0]?.doc_number).toBe(2);
});
it("only agency admin can configure series; agents cannot write settings directly", async () => {
  await db.exec(`DELETE FROM user_roles;`);
  await expect(db.exec("SELECT save_contract_number_series('viewing','OTHER',1)")).rejects.toThrow("Doar administratorul");
  await db.exec("GRANT USAGE ON SCHEMA auth,public TO authenticated; SET ROLE authenticated;");
  expect((await db.query("SELECT * FROM contract_number_series")).rows.every((r) => r.organization_id === org)).toBe(true);
  await expect(db.exec("UPDATE contract_number_series SET next_number=1")).rejects.toThrow("permission denied");
  await db.exec("RESET ROLE");
});
it("document output removes the internal identifier and printed identity is immutable", async () => {
  const row = (await create("commission")).rows[0];
  expect(documentText(`Contract ${row?.number} · seria NEW nr. 11`,row?.number)).toBe("Contract  · seria NEW nr. 11");
  await expect(db.exec("UPDATE contracts SET doc_number=999 WHERE kind='commission'")).rejects.toThrow("nu pot fi modificate");
});