import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync(new URL("../../../../drizzle/migrations/0215_ofera_partner_auth.sql", import.meta.url), "utf8");
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
describe("Ofera durable global lease", () => {
  it("allows one owner, reuses tokens and fences rejected revisions", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
      await db.exec(migration);
      const claim = async (owner: string, rejected?: string) => (await db.query<{ claimed: boolean }>("SELECT public.ofera_token_claim($1::uuid,$2::uuid) claimed", [owner, rejected ?? null])).rows[0]?.claimed;
      expect(await claim(ownerA)).toBe(true);
      expect(await claim(ownerB)).toBe(false);
      await db.query("UPDATE public.ofera_partner_auth SET token_encrypted=$1, expires_at=now()+interval '1 hour',revision=$2::uuid,lock_owner=NULL,lock_until=NULL", ["encrypted-fixture-".repeat(30), ownerA]);
      expect(await claim(ownerB)).toBe(false);
      expect(await claim(ownerB, ownerA)).toBe(true);
      expect(await claim(ownerA, ownerA)).toBe(false);
      await db.query("UPDATE public.ofera_partner_auth SET revision=$1::uuid, lock_owner=NULL,lock_until=NULL", [ownerB]);
      expect(await claim(ownerA, ownerA)).toBe(false);
      await db.exec("UPDATE public.ofera_partner_auth SET expires_at=now()+interval '4 minutes'");
      expect(await claim(ownerA)).toBe(true);
      const permissions = await db.query<{ tokens: boolean; logs: boolean; claim: boolean }>("SELECT has_table_privilege('authenticated','public.ofera_partner_auth','SELECT') tokens,has_table_privilege('authenticated','public.ofera_api_logs','SELECT') logs,has_function_privilege('authenticated','public.ofera_token_claim(uuid,uuid)','EXECUTE') claim");
      expect(permissions.rows[0]).toEqual({ tokens: false, logs: false, claim: false });
    } finally { await db.close(); }
  });
});