/**
 * Verificarea permisiunilor pentru datele de piață (faza 3).
 *
 * Testul citește migrația aplicată și confirmă că tabelele noi sunt protejate
 * prin RLS, că importurile și potrivirile ambigue sunt vizibile doar
 * superadminului și că browserul nu poate scrie în pool-ul comun.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARKET_SOURCES } from "./sources";

const sql = readFileSync("drizzle/migrations/0031_market_data_phase3.sql", "utf8");
const NEW_TABLES = ["market_import_runs", "market_dedupe_reviews"];

describe("permisiuni – datele de piață", () => {
  it("activează RLS pe tabelele noi", () => {
    for (const table of NEW_TABLES) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("acordă doar SELECT utilizatorilor autentificați și scriere doar rolului de serviciu", () => {
    for (const table of NEW_TABLES) {
      expect(sql).toContain(`GRANT SELECT ON public.${table} TO authenticated`);
      expect(sql).toContain(`GRANT ALL ON public.${table} TO service_role`);
      expect(sql).not.toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table}`);
      expect(sql).not.toContain(`GRANT SELECT ON public.${table} TO anon`);
    }
  });

  it("limitează citirea importurilor și a potrivirilor ambigue la superadmin", () => {
    const policies = sql
      .split("CREATE POLICY")
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf(";")));
    expect(policies.length).toBe(NEW_TABLES.length);
    for (const policy of policies) {
      expect(policy).toContain("public.is_superadmin()");
      expect(policy).toContain("FOR SELECT TO authenticated");
      expect(policy).not.toMatch(/USING \(true\)/);
    }
  });

  it("nu adaugă politici de scriere pentru rolurile din browser", () => {
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE) TO (authenticated|anon)/);
  });
});

describe("registrul surselor autorizate", () => {
  it("nu declară importuri automate inexistente", () => {
    for (const source of MARKET_SOURCES) {
      expect(source.pull).toBe(false);
      expect(source.formats.length).toBeGreaterThan(0);
      expect(source.description.length).toBeGreaterThan(0);
    }
  });

  it("are identificatori unici", () => {
    const ids = MARKET_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
