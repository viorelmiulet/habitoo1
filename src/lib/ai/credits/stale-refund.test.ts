import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI19 stale reservation SQL job", () => {
  it("refunds only reserved older than 10 minutes, idempotently, without changing consumed/fresh rows", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE public.ai_credit_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, created_at timestamptz, settled_at timestamptz);
        INSERT INTO public.ai_credit_ledger(status,created_at) VALUES
        ('reserved',now()-interval '11 minutes'), ('reserved',now()-interval '9 minutes'),
        ('consumed',now()-interval '20 minutes'), ('refunded',now()-interval '20 minutes');`);
      await db.exec(readFileSync(new URL("../../../../drizzle/migrations/0285_ai_credit_stale_refund.sql", import.meta.url), "utf8"));
      await db.exec(`CREATE SCHEMA cron;
        CREATE TABLE cron.test_schedule(name text, expression text, command text);
        CREATE FUNCTION cron.schedule(n text,e text,c text) RETURNS integer LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO cron.test_schedule VALUES(n,e,c); RETURN 1; END $$;`);
      await db.exec(readFileSync(new URL("./stale-refund.schedule.sql", import.meta.url), "utf8"));
      expect((await db.query("SELECT * FROM cron.test_schedule")).rows).toEqual([{ name: "ai-credit-stale-refund", expression: "*/5 * * * *", command: "SELECT public.ai_credit_refund_stale();" }]);
      expect((await db.query<{ n: number }>("SELECT public.ai_credit_refund_stale() n")).rows[0]?.n).toBe(1);
      const rows = (await db.query<{ status: string; settled: boolean }>("SELECT status,settled_at IS NOT NULL settled FROM ai_credit_ledger ORDER BY created_at DESC")).rows;
      expect(rows[0]).toEqual({ status: "reserved", settled: false });
      expect(rows[1]).toEqual({ status: "refunded", settled: true });
      expect(rows.filter(r => r.status === "consumed")).toHaveLength(1);
      expect((await db.query<{ n: number }>("SELECT public.ai_credit_refund_stale() n")).rows[0]?.n).toBe(0);
      expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated','public.ai_credit_refund_stale()','EXECUTE') allowed")).rows[0]?.allowed).toBe(false);
    } finally { await db.close(); }
  });
});