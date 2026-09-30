/**
 * Ștergerea „soft” a lead-urilor: drepturi (UI + migrare), gărzi, RLS, filtre.
 * Fără nicio bază de date reală.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { canDeleteLead, DELETE_LEAD_TEXT } from "@/components/app/DeleteLeadDialog";

const dir = "drizzle/migrations";
const sql = readFileSync(
  `${dir}/${readdirSync(dir).find((f) => f.endsWith("_lead_soft_delete.sql"))}`,
  "utf8",
);
const fn = (name: string) => {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  return sql.slice(start, sql.indexOf("END $$;", start));
};

const admin = { isAdmin: true, isSuperadmin: false, userId: "a" };
const sa = { isAdmin: true, isSuperadmin: true, userId: "s" };
const agent = { isAdmin: false, isSuperadmin: false, userId: "u" };

describe("drept de ștergere (UI)", () => {
  it("agentul își șterge lead-ul propriu, nu pe al altuia", () => {
    expect(canDeleteLead(agent, { assigned_to: "u", created_by: "x" })).toBe(true);
    expect(canDeleteLead(agent, { assigned_to: null, created_by: "u" })).toBe(true);
    expect(canDeleteLead(agent, { assigned_to: "x", created_by: "u" })).toBe(false);
    expect(canDeleteLead(agent, { assigned_to: null, created_by: "x" })).toBe(false);
  });
  it("adminul și superadminul șterg orice lead", () => {
    expect(canDeleteLead(admin, { assigned_to: "x", created_by: "y" })).toBe(true);
    expect(canDeleteLead(sa, { assigned_to: "x", created_by: "y" })).toBe(true);
  });
  it("textul confirmării", () => {
    expect(DELETE_LEAD_TEXT).toBe(
      "Lead-ul nu va mai fi vizibil în agenție. Doar administratorul platformei îl poate restabili.",
    );
  });
});

describe("baza de date", () => {
  it("delete_lead verifică admin / assigned_to / created_by și scrie audit", () => {
    const f = fn("delete_lead");
    expect(f).toContain("r.role = 'agency_admin'");
    expect(f).toContain("l.assigned_to = uid");
    expect(f).toContain("l.assigned_to IS NULL AND l.created_by = uid");
    expect(f).toContain("pre_delete_stage = l.stage");
    expect(f).toContain("'lead.deleted'");
  });
  it("restore_lead e doar pentru superadmin, revine la etapa anterioară", () => {
    const f = fn("restore_lead");
    expect(f).toMatch(/NOT public\.is_superadmin\(\)/);
    expect(f).toContain("coalesce(l.pre_delete_stage, l.stage)");
    expect(f).toContain("'lead.restored'");
  });
  it("garda refuză modificarea marcajului în afara RPC-urilor și editarea unui lead șters", () => {
    const g = fn("guard_lead_soft_delete");
    expect(g).toContain("habitoo.lead_soft_delete");
    expect(g).toContain("NEW.deleted_at IS DISTINCT FROM OLD.deleted_at");
    expect(g).toContain("OLD.deleted_at IS NOT NULL");
    expect(fn("guard_lead_soft_delete_insert")).toContain("NEW.deleted_at IS NOT NULL");
  });
  it("RLS: SELECT ascunde șterse, DELETE doar superadmin", () => {
    expect(sql).toMatch(/CREATE POLICY leads_sel[\s\S]*deleted_at IS NULL/);
    expect(sql).toMatch(/CREATE POLICY leads_del ON public\.leads FOR DELETE USING \(public\.is_superadmin\(\)\)/);
    expect(sql).toMatch(/CREATE POLICY leads_upd[\s\S]*deleted_at IS NULL/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.restore_lead\(uuid\) FROM PUBLIC, anon/);
  });
});

describe("lead-urile șterse dispar și din citirile de pe server", () => {
  it.each([
    "src/lib/ai/tools/executors.server.ts",
    "src/lib/ai/agents/crm/tools.server.ts",
    "src/lib/ai/agents/crm/runtime.server.ts",
    "src/lib/collaboration.functions.ts",
  ])("%s filtrează deleted_at", (p) => {
    const src = readFileSync(p, "utf8");
    const selects = src.match(/\.from\("leads"\)\n\s*\.select\([^\n]*\)\n\s*\.is\("deleted_at", null\)/g) ?? [];
    const all = src.match(/\.from\("leads"\)\n\s*\.select\(/g) ?? [];
    expect(selects.length).toBe(all.length);
  });
});
