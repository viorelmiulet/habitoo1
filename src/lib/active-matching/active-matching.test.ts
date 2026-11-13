import { describe, expect, it, vi } from "vitest";
import { isSignificantPriceDrop, planActiveMatches, romaniaDayStart, scorePair, type MatchProperty, type MatchRequest, type PlanInput } from "./plan";
import { buildAlertDraft, type DraftDeps } from "./draft.server";
import { AiCreditsExhaustedError } from "@/lib/ai/credits/credits";

const ORG = "org-1";
const property = (o: Partial<MatchProperty> = {}): MatchProperty => ({
  id: "p1", organization_id: ORG, title: "Apartament 2 camere Militari", status: "active", publish_status: "published",
  deleted_at: null, archived_at: null, transaction_kind: "sale", price: 78000, city: "București", district: "Militari",
  address: null, rooms: 2, surface: 55, usable_surface: 52, features: [], property_type: "apartment", ...o,
});
const request = (o: Partial<MatchRequest> = {}): MatchRequest => ({
  id: "r1", organization_id: ORG, status: "active", assigned_to: "agent-a", contact_id: "c1", title: "Caută 2 camere",
  kind: "buy", budget_min: null, budget_max: 80000, cities: ["București"], areas: ["Militari"], rooms_min: 2, rooms_max: 2,
  surface_min: 50, features: [], property_type: "apartment", ...o,
});
const input = (o: Partial<PlanInput> = {}): PlanInput => ({
  trigger: "published", organizationId: ORG, properties: [property()], requests: [request()], existing: [],
  threshold: 75, notifiedToday: new Map(), contactOwner: new Map(), ...o,
});

describe("potriviri active", () => {
  it("proprietate nouă publicată + cerere activă cu scor mare → o alertă notificată; a doua publicare → nimic", () => {
    expect(scorePair(request(), property()).score).toBeGreaterThanOrEqual(90);
    const first = planActiveMatches(input());
    expect(first.inserts).toHaveLength(1);
    expect(first.inserts[0]).toMatchObject({ request_id: "r1", property_id: "p1", agent_id: "agent-a", notify: true });
    const again = planActiveMatches(input({ existing: [{ id: "a1", request_id: "r1", property_id: "p1", price_drop_notified_at: null }] }));
    expect(again.inserts).toHaveLength(0);
    expect(again.renotify).toHaveLength(0);
  });

  it("scădere de preț cu 5% → o singură re-notificare; cu 1% → nimic", () => {
    expect(isSignificantPriceDrop(100000, 95000)).toBe(true);
    expect(isSignificantPriceDrop(100000, 99000)).toBe(false);
    const existing = [{ id: "a1", request_id: "r1", property_id: "p1", price_drop_notified_at: null }];
    const once = planActiveMatches(input({ trigger: "price_drop", existing }));
    expect(once.renotify).toEqual([expect.objectContaining({ alert_id: "a1", notify: true })]);
    const twice = planActiveMatches(input({ trigger: "price_drop", existing: [{ ...existing[0], price_drop_notified_at: "2026-11-13T10:00:00Z" }] }));
    expect(twice.renotify).toHaveLength(0);
    expect(twice.inserts).toHaveLength(0);
  });

  it("scor sub prag → nimic", () => {
    const low = request({ rooms_min: 4, rooms_max: 4, cities: ["Cluj"], areas: [], budget_max: 40000 });
    expect(scorePair(low, property()).score).toBeLessThan(75);
    expect(planActiveMatches(input({ requests: [low] })).inserts).toHaveLength(0);
  });

  it("doar agenția proprietății, doar cereri active și proprietăți publicate", () => {
    expect(planActiveMatches(input({ requests: [request({ organization_id: "other" })] })).inserts).toHaveLength(0);
    expect(planActiveMatches(input({ requests: [request({ status: "closed" })] })).inserts).toHaveLength(0);
    expect(planActiveMatches(input({ properties: [property({ publish_status: "draft" })] })).inserts).toHaveLength(0);
  });

  it("maxim 20 de alerte notificate pe zi per agent; restul rămân fără notificare", () => {
    const requests = Array.from({ length: 5 }, (_, i) => request({ id: `r${i}` }));
    const plan = planActiveMatches(input({ requests, notifiedToday: new Map([["agent-a", 18]]) }));
    expect(plan.inserts).toHaveLength(5);
    expect(plan.inserts.filter((a) => a.notify)).toHaveLength(2);
  });

  it("cererea fără agent → responsabilul contactului", () => {
    const plan = planActiveMatches(input({ requests: [request({ assigned_to: null })], contactOwner: new Map([["c1", "agent-b"]]) }));
    expect(plan.inserts[0]?.agent_id).toBe("agent-b");
  });

  it("ziua românească începe la 00:00 Europe/Bucharest", () => {
    expect(romaniaDayStart(new Date("2026-11-13T22:30:00Z"))).toBe("2026-11-13T22:00:00.000Z");
    expect(romaniaDayStart(new Date("2026-07-01T12:00:00Z"))).toBe("2026-06-30T21:00:00.000Z");
  });
});

describe("ciorna mesajului", () => {
  const ctx = {
    organizationId: ORG, userId: "u1", clientFirstName: "Ana", link: "https://www.habitoo.ro/oferta/p1",
    property: { title: "Apartament 2 camere Militari", transaction_kind: "sale", property_type: "apartment", price: 78000, currency: "EUR", rooms: 2, surface: 55, usable_surface: 52, floor: 3, city: "București", balcony: true, parking: null, description: null },
  };
  const deps = (o: Partial<DraftDeps> = {}): DraftDeps => ({
    provider: { generate: vi.fn(async () => ({ text: "Bună, Ana! Am un apartament de 2 camere în Militari la 78000 EUR: https://www.habitoo.ro/oferta/p1", toolCalls: [], inputTokens: 1, outputTokens: 1 })) },
    isFeatureEnabled: async () => true, creditsBlocked: async () => null,
    withCredits: async (_a, run, ok) => { const r = await run(); ok(r); return r; }, ...o,
  });

  it("fără credite → șablon ne-AI, fără apel la model", async () => {
    const d = deps({ creditsBlocked: async () => "Ai folosit creditele AI incluse luna aceasta (300/300)." });
    const r = await buildAlertDraft(d, ctx);
    expect(r.isAi).toBe(false);
    expect(r.text).toContain("Apartament 2 camere Militari");
    expect(r.text).toContain(ctx.link);
    expect(d.provider!.generate).not.toHaveBeenCalled();
  });

  it("rezervarea refuzată (credite epuizate) → șablon ne-AI", async () => {
    const r = await buildAlertDraft(deps({ withCredits: async () => { throw new AiCreditsExhaustedError("epuizat"); } }), ctx);
    expect(r).toMatchObject({ isAi: false, notice: "epuizat" });
  });

  it("ciorna AI cu cifre inventate → respinsă (credit restituit) și șablon", async () => {
    let success: boolean | null = null;
    const d = deps({
      provider: { generate: async () => ({ text: "Prețul este doar 65000 EUR!", toolCalls: [], inputTokens: 1, outputTokens: 1 }) },
      withCredits: async (_a, run, ok) => { const r = await run(); success = ok(r); return r; },
    });
    const r = await buildAlertDraft(d, ctx);
    expect(success).toBe(false);
    expect(r.isAi).toBe(false);
  });

  it("ciorna AI din fapte reale → acceptată", async () => {
    const r = await buildAlertDraft(deps(), ctx);
    expect(r.isAi).toBe(true);
    expect(r.text).toContain(ctx.link);
  });
});
