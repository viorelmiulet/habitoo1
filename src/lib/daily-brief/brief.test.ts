import { describe, expect, it, vi } from "vitest";
import { briefDate, maybeAiSentence } from "./brief";

describe("date și selecție zilnică", () => {
  it("ziua cache-ului urmează ora României, inclusiv la miezul nopții", () => {
    expect(briefDate(new Date("2026-11-14T22:30:00Z"))).toBe("2026-11-15");
    expect(briefDate(new Date("2026-07-14T21:30:00Z"))).toBe("2026-07-15");
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
