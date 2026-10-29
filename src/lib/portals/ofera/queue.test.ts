import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
describe("Ofera durable queue intent", () => {
  it("preserves explicit resend only for Ofera and arms atomically", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE properties(id uuid PRIMARY KEY,organization_id uuid);
      CREATE TABLE portal_publish_jobs(id uuid DEFAULT gen_random_uuid(),organization_id uuid,property_id uuid,portal_key text,enabled boolean,promoted boolean,imobiliare_promotions jsonb,imobiliare_mode text,sync_existing boolean,requested_by uuid,superadmin boolean,status text DEFAULT 'queued');
      CREATE UNIQUE INDEX active_pair ON portal_publish_jobs(property_id,portal_key) WHERE status IN ('queued','running');
      CREATE TABLE arm_calls(id int);
      CREATE FUNCTION close_stale_portal_publish_jobs(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION portal_publish_arm() RETURNS void LANGUAGE sql AS $$ INSERT INTO arm_calls VALUES(1) $$;
      INSERT INTO properties VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');`);
      await db.exec(readFileSync("drizzle/migrations/0218_ofera_queue_intent.sql", "utf8"));
      await db.query("SELECT start_portal_publish_jobs($1,$2,$3,true,true,$4)", ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000003", JSON.stringify([{ portal_key: "ofera", enabled: true, ofera_intent: "resend" }, { portal_key: "storia", enabled: true, ofera_intent: "resend" }])]);
      expect((await db.query("SELECT portal_key,ofera_intent FROM portal_publish_jobs ORDER BY portal_key")).rows).toEqual([{ portal_key: "ofera", ofera_intent: "resend" }, { portal_key: "storia", ofera_intent: null }]);
      expect((await db.query("SELECT count(*)::int n FROM arm_calls")).rows).toEqual([{ n: 1 }]);
    } finally { await db.close(); }
  });
});