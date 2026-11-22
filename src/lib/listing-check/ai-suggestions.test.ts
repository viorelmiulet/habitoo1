import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { inventedFeatures, parseAiJson, validateAiSuggestions } from "./ai-suggestions";
import { runAiListingSuggestions } from "./ai-suggestions.server";
import { applyListingSuggestion } from "@/components/app/listing-suggestion-apply";

const property = { id: "p1", organization_id: "o1", title: "Apartament 2 camere Gheorgheni", description: "Apartament luminos, etaj 3/8, 54 mp utili, aproape de parc.", rooms: 2, usable_surface: 54, floor: null, building_floors: null, balcony: false, balconies: 0, internal_notes: "secret", owner_phone: "0722000000" };
const row = { propertyId: "p1", reference: "HB-1", title: "x", score: 80, issues: [{ code: "x", severity: "recommended", message: "Lipsește anul", field: "An", tab: "details", target: null }], priceContext: null } as never;

function fakeDb() {
  const writes: string[] = [];
  const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: [{ is_primary: true, position: 0 }] }), maybeSingle: () => Promise.resolve({ data: property }), update: () => { writes.push("update"); return q; }, insert: () => { writes.push("insert"); return q; } };
  return { db: { from: () => q } as any, writes };
}
const deps = (text: string, enabled = true) => {
  const generate = vi.fn(async () => ({ text, toolCalls: [], inputTokens: 1, outputTokens: 1 }));
  return { generate, deps: { checks: async () => [row], aiEnabled: async () => enabled, provider: () => ({ id: "gemini", model: "m", supportsTools: false, generate }) as never, withCredits: (async (_a: unknown, run: () => Promise<string>) => run()) as never } };
};

describe("Sugestii AI ale verificării anunțului", () => {
  it("fără AI activat apar doar regulile (AI-ul nu e apelat)", async () => {
    const { db } = fakeDb();
    const { generate, deps: d } = deps("{}", false);
    const r = await runAiListingSuggestions(db, "u1", "p1", d);
    expect(r).toMatchObject({ ok: false, disabled: true });
    expect(generate).not.toHaveBeenCalled();
  });

  it("nu trimite la AI proprietarul sau notele interne", async () => {
    const { db } = fakeDb();
    const { generate, deps: d } = deps(JSON.stringify({ title: null, description: null, fields: [], questions: [], price_note: null }));
    await runAiListingSuggestions(db, "u1", "p1", d);
    const sent = (generate.mock.calls[0] as any)[0].messages[0].content as string;
    expect(sent).not.toContain("secret");
    expect(sent).not.toContain("0722000000");
    expect(sent).toContain("\"numar\":1");
  });

  it("descrierea cu o dotare inexistentă în câmpuri este eliminată", () => {
    const s = validateAiSuggestions({ description: "Apartament luminos cu balcon generos, 54 mp, etaj 3/8.", fields: [], questions: [] }, property, null)!;
    expect(s.description).toBeNull();
    expect(inventedFeatures("are lift și balcon", property)).toEqual(["Balcon", "Lift"]);
  });

  it("descrierea cu cifre inventate (distanțe) este eliminată, cea fidelă rămâne", () => {
    expect(validateAiSuggestions({ description: "La 300 m de metrou, 54 mp." }, property, null)!.description).toBeNull();
    expect(validateAiSuggestions({ description: "Apartament luminos de 54 mp utili, la etajul 3 din 8, aproape de parc." }, property, null)!.description).toContain("54 mp");
  });

  it("câmpurile deduse vin cu fragmentul-sursă; fără dovadă se elimină", () => {
    const s = validateAiSuggestions({ fields: [
      { field: "floor", value: 3, evidence: "etaj 3/8" },
      { field: "building_floors", value: 8, evidence: "etaj 3/8" },
      { field: "build_year", value: 2010, evidence: "bloc nou" },
      { field: "rooms", value: 2, evidence: "2 camere" },
    ] }, property, null)!;
    expect(s.fields).toEqual([
      { field: "floor", label: "Etaj", value: 3, evidence: "etaj 3/8" },
      { field: "building_floors", label: "Număr de etaje", value: 8, evidence: "etaj 3/8" },
    ]);
  });

  it("observația de preț apare doar cu comparabile reale, cu sursa lor", () => {
    expect(validateAiSuggestions({ price_note: "Prețul e mare" }, property, null)!.price).toBeNull();
    const s = validateAiSuggestions({ price_note: "Prețul e peste mediană" }, property, { medianPerSqm: 1800, comparables: 7, scope: "Cluj-Napoca" })!;
    expect(s.price?.source).toContain("7 anunțuri comparabile din Habitoo");
  });

  it("răspuns AI invalid este tratat fără a strica panoul", async () => {
    expect(parseAiJson("nu e json")).toBeNull();
    expect(validateAiSuggestions([1, 2], property, null)).toBeNull();
    const { db } = fakeDb();
    const r = await runAiListingSuggestions(db, "u1", "p1", deps("blabla").deps);
    expect(r).toMatchObject({ ok: false, disabled: false });
  });

  it("„Aplică” doar completează formularul, fără salvare", async () => {
    const { db, writes } = fakeDb();
    const r = await runAiListingSuggestions(db, "u1", "p1", deps("```json\n" + JSON.stringify({ title: "Apartament 2 camere, Gheorgheni", fields: [{ field: "floor", value: 3, evidence: "etaj 3/8" }] }) + "\n```").deps);
    expect(r.ok).toBe(true);
    const setText = vi.fn(); const setDetails = vi.fn();
    applyListingSuggestion({ kind: "field", field: "floor", value: 3 }, { setText, setDetails });
    applyListingSuggestion({ kind: "title", value: "Titlu" }, { setText, setDetails });
    expect(setDetails).toHaveBeenCalledWith({ floor: 3, floor_label: "Etaj 3" });
    expect(setText).toHaveBeenCalledWith({ title: "Titlu" });
    expect(writes).toEqual([]);
    expect(readFileSync("src/components/app/listing-suggestion-apply.ts", "utf8")).not.toMatch(/supabase|mutate|save/i);
  });

  it("butonul se numește „Corectează cu AI”", () => {
    const src = readFileSync("src/components/app/ai/ListingAutofillCard.tsx", "utf8");
    expect(src).toContain("Corectează cu AI");
    expect(src).not.toContain("Completează câmpurile goale cu AI");
  });
});
