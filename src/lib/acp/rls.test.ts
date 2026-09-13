/**
 * Verificarea izolării pe organizații pentru tabelele ACP.
 *
 * Testul citește migrația aplicată și confirmă că fiecare tabelă cu date
 * specifice agenției este protejată prin RLS legat de `public.current_org()`,
 * iar pool-ul comun de date de piață nu poate fi scris din browser.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0029_acp_module_phase1.sql", "utf8");

const ORG_TABLES = ["acp_analyses", "acp_comparables", "acp_analysis_sources", "acp_reports"];
const POOL_TABLES = [
  "market_listings",
  "market_listing_sources",
  "market_entities",
  "market_listing_snapshots",
];

describe("RLS – izolarea organizațiilor pentru ACP", () => {
  it("activează RLS pe toate tabelele ACP", () => {
    for (const table of [...ORG_TABLES, ...POOL_TABLES]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("leagă accesul la analize de organizația curentă", () => {
    expect(sql).toContain("organization_id = public.current_org()");
    expect(sql).toContain("public.can_access_acp_analysis(analysis_id)");
  });

  it("nu lasă nicio politică permisivă pe tabelele agenției", () => {
    for (const table of ORG_TABLES) {
      const policies = sql
        .split("CREATE POLICY")
        .filter((chunk) => chunk.includes(`ON public.${table} `));
      expect(policies.length).toBeGreaterThan(0);
      for (const policy of policies) {
        expect(policy).not.toMatch(/USING \(true\)/);
      }
    }
  });

  it("derivă accesul tabelelor copil printr-o funcție SECURITY DEFINER, nu prin JOIN direct", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.can_access_acp_analysis");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.can_access_acp_analysis(uuid) TO authenticated, service_role",
    );
  });

  it("acordă doar SELECT utilizatorilor pe pool-ul comun de piață", () => {
    for (const table of POOL_TABLES) {
      expect(sql).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
      expect(sql).not.toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table}`);
      expect(sql).toContain(`GRANT ALL ON public.${table} TO service_role`);
    }
  });

  it("nu expune date private ale agențiilor în pool-ul comun", () => {
    const poolBlock = sql.slice(0, sql.indexOf("CREATE TABLE public.acp_analyses"));
    expect(poolBlock).not.toContain("organization_id");
  });
});
