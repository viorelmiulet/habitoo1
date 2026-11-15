import { describe, expect, it, vi } from "vitest";
import { assembleBrief, briefDate, maybeAiSentence, selectTopActions, uniquePortalErrors, type BriefAction } from "./brief";

const a = (kind: BriefAction["kind"], at = "2026-11-14"): BriefAction => ({ kind, label: kind, to: "/app", at });

describe("selectTopActions", () => {
  it("ordonează restanțe, lead-uri noi, vizionări, erori portal, apoi restul și ia 5", () => {
    const out = selectTopActions([a("incomplete"), a("match"), a("portal_error"), a("viewing"), a("new_lead"), a("overdue"), a("stagnant")]);
    expect(out.map((x) => x.kind)).toEqual(["overdue", "new_lead", "viewing", "portal_error", "stagnant"]);
  });
  it("în același grup, cel mai vechi primul", () => {
    const out = selectTopActions([a("overdue", "2026-11-10"), a("overdue", "2026-11-01")]);
    expect(out[0]?.at).toBe("2026-11-01");
  });
  it("listă goală → nimic", () => expect(selectTopActions([])).toEqual([]));
});

describe("date și selecție zilnică", () => {
  it("ziua cache-ului urmează ora României, inclusiv la miezul nopții", () => {
    expect(briefDate(new Date("2026-11-14T22:30:00Z"))).toBe("2026-11-15");
    expect(briefDate(new Date("2026-07-14T21:30:00Z"))).toBe("2026-07-15");
  });
  it("aceeași eroare în job și publicație se numără o dată", () => {
    expect(uniquePortalErrors([{ property_id: "p", portal_key: "x", created_at: "2026-11-10" }, { property_id: "p", portal_key: "x", created_at: "2026-11-11" }])).toHaveLength(1);
  });
  it("numără restanțele, răspunsurile lipsă și incompletele din fapte", () => {
    const result = assembleBrief({ now: new Date("2026-11-15T08:00:00Z"), activities: [{ id: "a", title: "Vizionare", kind: "viewing", starts_at: "2026-11-15T09:00:00Z" }], leads: [{ id: "l", name: "Client", stage: "new", created_at: "2026-11-10T00:00:00Z", last_interaction_at: null, next_followup_at: "2026-11-14T10:00:00Z" }], stagnantIds: [], properties: [{ id: "p", title: "Apartament", description: "Descriere", price: 80000, created_at: "2026-11-01", assigned_to: "u" }], imagePropertyIds: [], portalErrors: [], matches: [], reports: [], team: null });
    expect(result.counts.overdue).toBe(1);
    expect(result.counts.new_lead).toBe(1);
    expect(result.counts.viewing).toBe(1);
    expect(result.counts.incomplete).toBe(1);
    expect(result.actions.map(a => a.kind)).toEqual(["overdue", "new_lead", "viewing", "incomplete"]);
  });
});

describe("maybeAiSentence", () => {
  it("fără credite → fără frază și fără apel AI", async () => {
    const generate = vi.fn(async () => "x");
    expect(await maybeAiSentence({ featureEnabled: async () => true, creditsBlocked: async () => "epuizat", generate })).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
  it("funcție oprită → null", async () => {
    expect(await maybeAiSentence({ featureEnabled: async () => false, creditsBlocked: async () => null, generate: async () => "x" })).toBeNull();
  });
  it("rezervarea eșuează → null, fără eroare", async () => {
    expect(await maybeAiSentence({ featureEnabled: async () => true, creditsBlocked: async () => null, generate: async () => { throw new Error("ai_credits_exhausted"); } })).toBeNull();
  });
  it("succes → fraza", async () => {
    expect(await maybeAiSentence({ featureEnabled: async () => true, creditsBlocked: async () => null, generate: async () => " Ai 2 restanțe. " })).toBe("Ai 2 restanțe.");
  });
});
