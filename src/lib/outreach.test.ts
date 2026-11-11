import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { prepareOutreachCsv, outreachHeaders } from "./outreach";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const AGENT = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
let pg: PGlite;
const csv = (rows: string[]) => outreachHeaders.join(",") + "\n" + rows.join("\n");
async function rpc<T>(sql: string, args: unknown[] = []) { const result = await pg.query<{ result: T }>(sql, args); return result.rows[0]?.result as T; }
async function importRows(rows: unknown[], listId?: string, invalid = 0, duplicates = 0) {
  return rpc<{ list_id: string; imported: number; invalid: number; duplicates: number; suppressed: number }>("select outreach_import('Test',$1,$2,$3,$4) result", [JSON.stringify(rows), invalid, duplicates, listId ?? null]);
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TYPE app_role AS ENUM ('superadmin','agency_admin','agent');
    CREATE TABLE user_roles(user_id uuid,role app_role);
    INSERT INTO user_roles VALUES ('${ADMIN}','superadmin'),('${AGENT}','agent'),('${MANAGER}','agency_admin');
    CREATE FUNCTION has_role(_user_id uuid,_role app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(), actor_id uuid,action text,entity text,entity_id uuid,old_values jsonb,new_values jsonb);
    SET test.uid='${ADMIN}';`);
  await pg.exec(readFileSync("drizzle/migrations/0265_outreach_recipient_lists.sql", "utf8"));
});
afterAll(async () => { await pg.close(); });

describe("Outreach CSV and access", () => {
  it("normalizes email, skips invalid rows and file duplicates, handles quoted fields", () => {
    const result = prepareOutreachCsv(csv(['"Agency, A", A@Example.com ,Cluj,Cluj,,https://example.com,office,', 'B,a@example.com,,,,,,', 'C,wrong,,,,,,']));
    expect(result).toMatchObject({ invalid: 1, duplicates: 1, rows: [{ email: "a@example.com", agency_name: "Agency, A", city: "Cluj" }] });
    expect(result.rows).toHaveLength(1);
  });
  it("rejects a missing CSV header", () => { expect(() => prepareOutreachCsv("email\nx@example.com")).toThrow("Antetul CSV"); });
  it("imports with pending default, list duplicates, suppressions and one atomic audit per import", async () => {
    await pg.exec("INSERT INTO outreach_suppressions(email,reason) VALUES(' BLOCKED@Example.com ','test')");
    const prepared = prepareOutreachCsv(csv(['A,a@example.com,Cluj,Cluj,,,,', 'B,a@example.com,,,,,,', 'C,bad,,,,,,', 'D,blocked@example.com,,,,,,']));
    const first = await importRows(prepared.rows, undefined, prepared.invalid, prepared.duplicates);
    expect(first).toMatchObject({ imported: 1, duplicates: 1, invalid: 1, suppressed: 1 });
    const again = await importRows(prepared.rows, first.list_id);
    expect(again).toMatchObject({ imported: 0, duplicates: 1, suppressed: 1 });
    expect(await rpc("select status::text result from outreach_recipients where list_id=$1", [first.list_id])).toBe("pending");
    expect(await rpc("select count(*)::int result from audit_logs where action='outreach.import' and entity_id=$1", [first.list_id])).toBe(2);
  });
  it("exclusion suppresses the email globally and updates all lists, with audit", async () => {
    const first = await importRows([{ email: "exclude@example.com" }]);
    await importRows([{ email: "exclude@example.com" }]);
    const id = await rpc<string>("select id result from outreach_recipients where list_id=$1", [first.list_id]);
    await pg.query("select outreach_exclude($1)", [id]);
    expect(await rpc("select count(*)::int result from outreach_recipients where email='exclude@example.com' and status='unsubscribed'")).toBe(2);
    expect(await rpc("select count(*)::int result from outreach_suppressions where email='exclude@example.com'")).toBe(1);
    expect(await rpc("select count(*)::int result from audit_logs where action='outreach.exclude' and entity_id=$1", [id])).toBe(1);
    expect(await importRows([{ email: " EXCLUDE@EXAMPLE.COM " }])).toMatchObject({ imported: 0, suppressed: 1 });
  });
  it("returns complete counts and paginated filtered recipients", async () => {
    const result = await importRows(Array.from({ length: 30 }, (_, i) => ({ email: `page${i}@example.com`, agency_name: `Agency ${i}`, city: i < 26 ? "Cluj" : "București" })));
    const detail = await rpc<{ total: number; rows: unknown[]; cities: string[] }>("select outreach_list_detail($1,'','pending','Cluj',2) result", [result.list_id]);
    expect(detail.total).toBe(26); expect(detail.rows).toHaveLength(2); expect(detail.cities).toEqual(["București", "Cluj"]);
    const search = await rpc<{ total: number }>("select outreach_list_detail($1,'page29@','','',1) result", [result.list_id]);
    expect(search.total).toBe(1);
    const lists = await rpc<Array<{ id: string; total: number; counts: { pending: number } }>>("select outreach_list_summaries() result");
    expect(lists.find(l => l.id === result.list_id)).toMatchObject({ total: 30, counts: { pending: 30 } });
  });
  it.each([[AGENT,"agent"],[MANAGER,"agency_admin"]])("denies %s reads, writes, import and exclusion server-side", async (uid) => {
    await pg.exec(`SET test.uid='${uid}'; SET ROLE authenticated;`);
    try {
      for (const table of ["outreach_lists", "outreach_recipients", "outreach_suppressions"]) expect(await rpc(`select count(*)::int result from ${table}`)).toBe(0);
      await expect(pg.exec("INSERT INTO outreach_lists(name) VALUES('Forbidden')")).rejects.toThrow();
      await expect(pg.exec("INSERT INTO outreach_recipients(list_id,email) VALUES(gen_random_uuid(),'forbidden@example.com')")).rejects.toThrow();
      await expect(pg.exec("INSERT INTO outreach_suppressions(email) VALUES('forbidden@example.com')")).rejects.toThrow();
      for (const table of ["outreach_lists", "outreach_recipients", "outreach_suppressions"]) {
        const updated = await pg.query(`UPDATE ${table} SET created_at=now() RETURNING *`);
        const deleted = await pg.query(`DELETE FROM ${table} RETURNING *`);
        expect(updated.rows).toHaveLength(0);
        expect(deleted.rows).toHaveLength(0);
      }
      await expect(importRows([{ email: "forbidden@example.com" }])).rejects.toThrow("Forbidden");
      await expect(pg.exec("select outreach_exclude(gen_random_uuid())")).rejects.toThrow("Forbidden");
      await expect(pg.exec("select outreach_list_summaries() ")).rejects.toThrow("Forbidden");
    } finally { await pg.exec(`RESET ROLE; SET test.uid='${ADMIN}'`); }
  });
  it("allows the authenticated superadmin to read all three tables and import", async () => {
    await pg.exec(`SET test.uid='${ADMIN}'; SET ROLE authenticated;`);
    try {
      const result = await importRows([{ email: "superadmin@example.com" }]);
      expect(result.imported).toBe(1);
      for (const table of ["outreach_lists", "outreach_recipients", "outreach_suppressions"]) {
        expect(await rpc<number>(`select count(*)::int result from ${table}`)).toBeGreaterThan(0);
      }
    } finally { await pg.exec("RESET ROLE"); }
  });
  it("rolls back the import if the audit write fails", async () => {
    await pg.exec("CREATE FUNCTION test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$; CREATE TRIGGER test_reject BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_reject_audit();");
    try { await expect(importRows([{ email: "rollback@example.com" }])).rejects.toThrow("audit unavailable"); }
    finally { await pg.exec("DROP TRIGGER test_reject ON audit_logs"); }
    expect(await rpc("select count(*)::int result from outreach_recipients where email='rollback@example.com'")).toBe(0);
  });
});