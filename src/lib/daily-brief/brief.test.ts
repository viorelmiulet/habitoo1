import { describe, expect, it, vi } from "vitest";
import { maybeAiSentence, selectTopActions, type BriefAction } from "./brief";

const a = (kind: BriefAction["kind"], at = "2026-11-14"): BriefAction => ({ kind, label: kind, to: "/app", at });

describe("selectTopActions", () => {
  it("ordonează restanțe, lead-uri noi, vizionări, erori portal, apoi restul și ia 5", () => {
    const out = selectTopActions([a("incomplete"), a("match"), a("portal_error"), a("viewing"), a("new_lead"), a("overdue"), a("stagnant")]);
    expect(out.map((x) => x.kind)).toEqual(["overdue", "new_lead", "viewing", "portal_error", "stagnant"]);
  });
  it("în același grup, cel mai vechi primul", () => {
    const out = selectTopActions([a("overdue", "2026-11-10"), a("overdue", "2026-11-01")]);
    expect(out[0]!.at).toBe("2026-11-01");
  });
  it("listă goală → nimic", () => expect(selectTopActions([])).toEqual([]));
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
