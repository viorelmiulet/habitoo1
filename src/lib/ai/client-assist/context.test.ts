import { describe, expect, it, vi } from "vitest";
import { clientScope, contactHistory, readAll, type ClientDb } from "./context.server";

function fakeDb(options: { org?: string; owner?: string; admin?: boolean; fail?: boolean } = {}) {
  const operations: { table: string; method: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const query = {
      select: (...args: unknown[]) => { operations.push({ table, method: "select", args }); return query; },
      eq: (...args: unknown[]) => { operations.push({ table, method: "eq", args }); return query; },
      is: (...args: unknown[]) => { operations.push({ table, method: "is", args }); return query; },
      or: (...args: unknown[]) => { operations.push({ table, method: "or", args }); return query; },
      order: (...args: unknown[]) => { operations.push({ table, method: "order", args }); return query; },
      maybeSingle: async () => ({ data: { id: "c1", organization_id: options.org ?? "org-a", assigned_to: options.owner ?? "agent-a", created_by: "agent-a", notes: "Clientul caută în Cluj." }, error: null }),
      range: async () => ({ data: table === "activities" ? [{ id: "a1", title: "A vizitat oferta", description: "A respins din cauza zgomotului.", kind: "viewing", status: "done", starts_at: "2026-11-23" }] : [], error: options.fail ? {} : null }),
    }; return query;
  };
  return { db: { from, rpc: vi.fn(async (name: string) => ({ data: name === "current_org" ? "org-a" : name === "is_org_admin" && options.admin === true, error: null })) } as unknown as ClientDb, operations };
}
describe("caller scoped client history", () => {
  it("agentul nu poate sumariza contactul altui agent", async () => { const { db } = fakeDb({ owner: "agent-b" }); await expect(clientScope(db, "agent-a", { kind: "contact", id: "c1" })).rejects.toThrow("Fișa nu este disponibilă"); });
  it("administratorul vede agenția, dar nu altă agenție", async () => {
    const allowed = fakeDb({ owner: "agent-b", admin: true }); expect((await clientScope(allowed.db, "agent-a", { kind: "contact", id: "c1" })).agentId).toBeNull();
    const other = fakeDb({ org: "org-b", admin: true }); await expect(clientScope(other.db, "agent-a", { kind: "contact", id: "c1" })).rejects.toThrow();
  });
  it("istoricul este legat de contact, agenție și agent înainte de paginare", async () => {
    const { db, operations } = fakeDb(); const result = await contactHistory(db, "agent-a", "c1");
    expect(result.history.map(h => h.text).join(" ")).toContain("A respins din cauza zgomotului");
    for (const table of ["activities", "requests", "leads"]) {
      expect(operations).toContainEqual({ table, method: "eq", args: ["contact_id", "c1"] }); expect(operations).toContainEqual({ table, method: "eq", args: ["organization_id", "org-a"] });
      expect(operations).toContainEqual({ table, method: "or", args: ["assigned_to.eq.agent-a,and(assigned_to.is.null,created_by.eq.agent-a)"] });
    }
  });
  it("citește istoricul complet peste limita de 1000", async () => {
    const query = vi.fn(async (a: number, b: number) => ({ data: Array.from({ length: Math.max(0, Math.min(1200 - a, b - a + 1)) }, (_, i) => a + i), error: null }));
    expect((await readAll(query)).length).toBe(1200); expect(query).toHaveBeenCalledTimes(3);
  });
});