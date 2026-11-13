import { describe, expect, it, vi } from "vitest";
import { processLeadAiBatch, processLeadInsight, type LeadAiDeps } from "./process.server";
import { sanitizeDraft } from "./schema";
import { AiCreditsExhaustedError } from "@/lib/ai/credits/credits";

const MSG = "Bună, caut 2 camere în Militari până în 80.000 €, se poate vizionare sâmbătă?";

type Tables = Record<string, Record<string, unknown>[]>;

/** DB în memorie, suficientă pentru interogările procesorului. */
function fakeDb(tables: Tables) {
  const rpc = vi.fn(async () => ({ data: tables.lead_ai_insights!.filter((r) => r.status === "pending"), error: null }));
  const from = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let op: "select" | "update" | "insert" | "delete" = "select";
    let payload: Record<string, unknown> = {};
    let limitN: number | null = null;
    const rows = () => (tables[table] ??= []);
    const run = () => {
      if (op === "insert") {
        const row = { id: `${table}-${rows().length + 1}`, ...payload };
        rows().push(row);
        return [row];
      }
      const hit = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, payload));
      if (op === "delete") tables[table] = rows().filter((r) => !hit.includes(r));
      return limitN ? hit.slice(0, limitN) : hit;
    };
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (p: Record<string, unknown>) => { op = "insert"; payload = p; return q; },
      update: (p: Record<string, unknown>) => { op = "update"; payload = p; return q; },
      delete: () => { op = "delete"; return q; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
      is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return q; },
      order: () => q,
      limit: (n: number) => { limitN = n; return q; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res),
    };
    return q;
  };
  return { from, rpc };
}

function setup(opts: { requestId?: string | null; aiText?: string; enabled?: boolean; exhausted?: boolean; fail?: boolean } = {}) {
  const tables: Tables = {
    leads: [{ id: "lead1", organization_id: "org1", name: "Ana", assigned_to: "agent1", contact_id: "c1", request_id: opts.requestId ?? null, property_id: "p1", deleted_at: null }],
    properties: [{ id: "p1", organization_id: "org1", title: "Apartament 2 camere Militari", transaction_kind: "sale", property_type: "apartment", price: 79000, currency: "EUR", rooms: 2, surface: 54, usable_surface: 50, floor: 3, city: "București", balcony: true, parking: null, description: null }],
    portal_messages: [{ id: "m1", lead_id: "lead1", direction: "in", body: MSG, property_id: "p1", sent_at: "2026-11-13" }],
    requests: opts.requestId ? [{ id: opts.requestId, organization_id: "org1", kind: "buy", rooms_min: 2, budget_max: 70000, currency: "EUR", cities: [], areas: ["Militari"] }] : [],
    lead_ai_insights: [{ id: "i1", organization_id: "org1", lead_id: "lead1", message_id: "m1", status: "pending" }],
  };
  const aiText = opts.aiText ?? JSON.stringify({
    request: { kind: "buy", budget_max: 80000, currency: "EUR", cities: [], areas: ["Militari"], rooms_min: 2, rooms_max: 2, surface_min: 120, wants_parking: true },
    intent: "viewing", language: "ro",
    draft: "Bună ziua! Apartamentul de 2 camere din Militari este disponibil pentru vizionare. Vă pot propune sâmbătă la 11:00?",
  });
  const generate = vi.fn(async () => {
    if (opts.fail) throw new Error("provider down");
    return { text: aiText, toolCalls: [], inputTokens: 1, outputTokens: 1 };
  });
  const settle = vi.fn();
  const db = fakeDb(tables);
  const deps: LeadAiDeps = {
    db,
    provider: { id: "gemini", model: "fast", supportsTools: false, generate },
    isFeatureEnabled: async () => opts.enabled !== false,
    withCredits: async (_actor, run, isSuccess) => {
      if (opts.exhausted) throw new AiCreditsExhaustedError("Ai folosit creditele AI incluse luna aceasta (300/300).");
      try {
        const r = await run();
        settle(isSuccess(r));
        return r;
      } catch (e) {
        settle(false);
        throw e;
      }
    },
  };
  const row = { id: "i1", organization_id: "org1", lead_id: "lead1", message_id: "m1" };
  return { tables, deps, generate, settle, row, db };
}

describe("Asistent lead-uri", () => {
  it("mesaj nou → cerere nouă cu camere, zonă și buget; intenție vizionare; ciornă fără prețuri inventate", async () => {
    const { tables, deps, row, settle } = setup();
    expect(await processLeadInsight(deps, row)).toBe("done");
    const req = tables.requests![0]!;
    expect(req).toMatchObject({ source: "ai_portal_message", rooms_min: 2, budget_max: 80000, areas: ["Militari"], contact_id: "c1", assigned_to: "agent1", kind: "buy" });
    expect(req.surface_min).toBeNull(); // nespus de client
    expect(req.wants_parking).toBeNull();
    expect(tables.leads![0]!.request_id).toBe(req.id);
    const ins = tables.lead_ai_insights![0]!;
    expect(ins).toMatchObject({ status: "done", intent: "viewing", request_created: true });
    expect(ins.draft).toContain("vizionare");
    expect(settle).toHaveBeenCalledWith(true);
  });

  it("ciorna cu un preț inventat este respinsă", () => {
    const property = { title: "Ap", transaction_kind: "sale", property_type: "apartment", price: 79000, currency: "EUR", rooms: 2, surface: 54, usable_surface: null, floor: 3, city: null, balcony: false, parking: null, description: null };
    expect(sanitizeDraft("Prețul este 95.000 €.", property, MSG)).toBeNull();
    expect(sanitizeDraft("Prețul este 79.000 €.", property, MSG)).toContain("79.000");
  });

  it("lead cu cerere existentă → cererea nu se schimbă, apar diferențele propuse", async () => {
    const { tables, deps, row } = setup({ requestId: "r1" });
    const before = structuredClone(tables.requests![0]);
    await processLeadInsight(deps, row);
    expect(tables.requests).toHaveLength(1);
    expect(tables.requests![0]).toEqual(before);
    const changes = tables.lead_ai_insights![0]!.proposed_changes as { field: string; text: string }[];
    expect(changes.map((c) => c.field)).toEqual(["budget_max", "rooms_max"]);
    expect(changes[0]!.text).toBe("Clientul a menționat buget max 80.000 €");
  });

  it("nu trimite nimic: niciun mesaj de ieșire creat", async () => {
    const { tables, deps, row } = setup();
    await processLeadInsight(deps, row);
    expect(tables.portal_messages!.filter((m) => m.direction === "out")).toHaveLength(0);
  });

  it("credite epuizate → fără analiză, mesajul rămâne neatins", async () => {
    const { tables, deps, row, generate } = setup({ exhausted: true });
    expect(await processLeadInsight(deps, row)).toBe("skipped");
    expect(generate).not.toHaveBeenCalled();
    expect(tables.lead_ai_insights![0]).toMatchObject({ status: "skipped", skip_reason: "no_credits" });
    expect(tables.portal_messages![0]!.body).toBe(MSG);
    expect(tables.requests).toHaveLength(0);
  });

  it("funcție oprită → fără analiză", async () => {
    const { tables, deps, row, generate } = setup({ enabled: false });
    expect(await processLeadInsight(deps, row)).toBe("skipped");
    expect(generate).not.toHaveBeenCalled();
    expect(tables.lead_ai_insights![0]!.skip_reason).toBe("feature_disabled");
  });

  it("eșec AI → credite restituite, lotul continuă fără să afecteze mesajul", async () => {
    const { tables, deps, settle } = setup({ fail: true });
    const counts = await processLeadAiBatch(deps);
    expect(counts.failed).toBe(1);
    expect(settle).toHaveBeenCalledWith(false);
    expect(tables.portal_messages![0]!.body).toBe(MSG);
  });

  it("răspuns AI invalid → credite restituite", async () => {
    const { deps, row, settle } = setup({ aiText: "nu e json" });
    expect(await processLeadInsight(deps, row)).toBe("failed");
    expect(settle).toHaveBeenCalledWith(false);
  });

  it("mesajele nepotrivite (unmatched) nu intră în coadă: doar portal_messages cu lead", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const file = readdirSync("drizzle/migrations").find((f) => f.includes("lead_ai_insights"))!;
    const sql = readFileSync(`drizzle/migrations/${file}`, "utf8");
    expect(sql).toMatch(/ON public\.portal_messages/);
    expect(sql).not.toMatch(/portal_unmatched_messages/);
    expect(sql).toMatch(/NEW\.direction = 'in' AND NEW\.lead_id IS NOT NULL/);
  });
});
