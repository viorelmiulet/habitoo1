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
    let rangeFrom = 0;
    let rangeTo: number | null = null;
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
      const ranged = rangeTo === null ? hit : hit.slice(rangeFrom, rangeTo + 1);
      return limitN ? ranged.slice(0, limitN) : ranged;
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
      range: (a: number, b: number) => { rangeFrom = a; rangeTo = b; return q; },
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
    portal_messages: [{ id: "m1", organization_id: "org1", lead_id: "lead1", direction: "in", body: MSG, property_id: "p1", sent_at: "2026-11-13" }],
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
  it("mesaj nou → numai propuneri cu dovezi și ciornă; nu creează cererea fără confirmare", async () => {
    const { tables, deps, row, settle } = setup();
    expect(await processLeadInsight(deps, row)).toBe("done");
    expect(tables.requests).toHaveLength(0);
    expect(tables.leads![0]!.request_id).toBeNull();
    const ins = tables.lead_ai_insights![0]!;
    expect(ins).toMatchObject({ status: "done", intent: "viewing", request_created: false });
    const proposals = ins.proposed_changes as { field: string; value: unknown; evidence: string }[];
    expect(proposals).toContainEqual(expect.objectContaining({ field: "budget_max", value: 80000, evidence: MSG }));
    expect(proposals.map(p => p.field)).not.toContain("surface_min");
    expect(proposals.map(p => p.field)).not.toContain("wants_parking");
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
    expect(changes.map((c) => c.field)).toEqual(["budget_max", "rooms_max", "currency"]);
    expect(changes[0]!.text).toBe("Clientul a menționat buget max 80.000 €");
  });

  it("nu trimite nimic: niciun mesaj de ieșire creat", async () => {
    const { tables, deps, row } = setup();
    await processLeadInsight(deps, row);
    expect(tables.portal_messages!.filter((m) => m.direction === "out")).toHaveLength(0);
  });

  it.each(["storia", "olx", "vdi", "properstar", "site"])("aceeași analiză pentru %s, fără scrieri în lead/cerere/mesaje", async (portal) => {
    const { tables, deps, row } = setup();
    const incoming = tables.portal_messages?.[0];
    if (!incoming) throw new Error("Missing fixture");
    incoming["portal"] = portal;
    const before = structuredClone({ lead: tables.leads, requests: tables.requests, messages: tables.portal_messages });
    expect(await processLeadInsight(deps, row)).toBe("done");
    expect({ lead: tables.leads, requests: tables.requests, messages: tables.portal_messages }).toEqual(before);
  });

  it("nota unui lead poate pregăti cererea fără mesaj din portal; fragmentele rămân în propuneri", async () => {
    const { tables, deps, row } = setup();
    const lead = tables.leads?.[0];
    if (!lead) throw new Error("Missing fixture");
    lead["notes"] = "Vreau să cumpăr 2 camere în Militari. Buget maximum 80.000 EUR.";
    expect(await processLeadInsight(deps, { ...row, message_id: null, source_kind: "note" })).toBe("done");
    const insight = tables.lead_ai_insights?.[0];
    expect(insight?.["source_kind"]).toBe("note");
    expect(insight?.["source_text"]).toBe(lead["notes"]);
    expect(tables.requests).toHaveLength(0);
    expect(lead["request_id"]).toBeNull();
  });

  it("mesajul din altă agenție este respins înainte de AI", async () => {
    const { tables, deps, row, generate } = setup();
    const incoming = tables.portal_messages?.[0];
    if (!incoming) throw new Error("Missing fixture");
    incoming["organization_id"] = "other-org";
    expect(await processLeadInsight(deps, row)).toBe("skipped");
    expect(generate).not.toHaveBeenCalled();
  });

  it("înregistrează consumul și citește complet interacțiunile peste primul lot", async () => {
    const { tables, deps, row } = setup();
    const original = tables.portal_messages?.[0];
    if (!original) throw new Error("Missing fixture");
    tables.portal_messages = Array.from({ length: 1001 }, (_, n) => ({ ...original, id: n === 0 ? "m1" : `m${n + 1}` }));
    const recordUsage = vi.fn(async () => undefined);
    expect(await processLeadInsight({ ...deps, recordUsage }, row)).toBe("done");
    expect(recordUsage).toHaveBeenCalledExactlyOnceWith({ organizationId: "org1", userId: "agent1" }, { inputTokens: 1, outputTokens: 1, success: true });
    expect(tables.lead_ai_insights?.[0]?.["score_reason"]).toContain("1001 mesaje");
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
