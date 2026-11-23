import { describe, expect, it, vi } from "vitest";
import { inventedFeatures, parseAiJson, validateAiSuggestions } from "./ai-suggestions";
import { runAiListingSuggestions } from "./ai-suggestions.server";
import { applyListingSuggestion } from "@/components/app/listing-suggestion-apply";

const property = { id: "p1", organization_id: "o1", title: "Apartament 2 camere Gheorgheni", description: "Apartament luminos, etaj 3/8, 54 mp utili, aproape de parc.", rooms: 2, usable_surface: 54, floor: null, building_floors: null, balcony: false, balconies: 0, internal_notes: "secret", owner_phone: "0722000000" };
const row = { propertyId: "p1", reference: "HB-1", title: "x", score: 80, issues: [{ code: "x", severity: "recommended", message: "Lipsește anul", field: "An", tab: "details", target: null }], priceContext: null } as never;

const response = (patch: Record<string, unknown> = {}) => ({ title: null, description: null, fields: [], questions: [], price_note: null, ...patch });
function suggestions(patch: Record<string, unknown>, source = property, price: Parameters<typeof validateAiSuggestions>[2] = null) {
  const result = validateAiSuggestions(response(patch), source, price);
  if (!result) throw new Error("Expected a valid suggestion envelope");
  return result;
}

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
    const s = suggestions({ description: "Apartament luminos cu balcon generos, 54 mp, etaj 3/8." });
    expect(s.description).toBeNull();
    expect(inventedFeatures("are lift și balcon", property)).toEqual(["Balcon", "Lift"]);
  });

  it("descrierea cu cifre inventate (distanțe) este eliminată, cea fidelă rămâne", () => {
    expect(suggestions({ description: "La 300 m de metrou, 54 mp." }).description).toBeNull();
    expect(suggestions({ description: "Apartament luminos de 54 mp utili, la etajul 3 din 8, aproape de parc." }).description).toContain("54 mp");
  });

  it("câmpurile deduse vin cu fragmentul-sursă; fără dovadă se elimină", () => {
    const s = suggestions({ fields: [
      { field: "floor", value: 3, evidence: "etaj 3/8" },
      { field: "building_floors", value: 8, evidence: "etaj 3/8" },
      { field: "build_year", value: 2010, evidence: "bloc nou" },
      { field: "rooms", value: 2, evidence: "2 camere" },
    ] });
    expect(s.fields).toEqual([
      { field: "floor", label: "Etaj", value: 3, evidence: "etaj 3/8" },
      { field: "building_floors", label: "Număr de etaje", value: 8, evidence: "etaj 3/8" },
    ]);
  });

  it("observația de preț apare doar cu comparabile reale, cu sursa lor", () => {
    expect(suggestions({ price_note: "Prețul e mare" }).price).toBeNull();
    const s = suggestions({ price_note: "Prețul e peste mediană" }, property, { medianPerSqm: 1800, comparables: 7, scope: "Cluj-Napoca" });
    expect(s.price?.source).toContain("7 anunțuri comparabile din Habitoo");
  });

  it("răspuns AI invalid este tratat fără a strica panoul", async () => {
    expect(parseAiJson("nu e json")).toBeNull();
    expect(validateAiSuggestions([1, 2], property, null)).toBeNull();
    const { db } = fakeDb();
    const r = await runAiListingSuggestions(db, "u1", "p1", deps("blabla").deps);
    expect(r).toMatchObject({ ok: false, disabled: false });
  });

  it("respinge obiectele incomplete și tipurile care nu respectă formatul fix", async () => {
    for (const raw of [{}, { title: "Titlu" }, response({ fields: "invalid" }), response({ questions: [42] }), response({ description: 42 })]) {
      expect(validateAiSuggestions(raw, property, null)).toBeNull();
    }
    const { db } = fakeDb();
    expect(await runAiListingSuggestions(db, "u1", "p1", deps("{}").deps)).toMatchObject({ ok: false, disabled: false });
  });

  it("titlul propus are strict mai puțin de 70 de caractere", () => {
    expect(suggestions({ title: "a".repeat(69) }).title).toHaveLength(69);
    expect(suggestions({ title: "a".repeat(70) }).title).toBeNull();
  });

  it("numerele din notele interne nu justifică informații în descrierea propusă", async () => {
    const { db } = fakeDb();
    const original = property.internal_notes;
    property.internal_notes = "300";
    try {
      const result = await runAiListingSuggestions(db, "u1", "p1", deps(JSON.stringify(response({ description: "La 300 m de parc." }))).deps);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected valid envelope");
      expect(result.suggestions.description).toBeNull();
    } finally { property.internal_notes = original; }
  });

  it("„Aplică” doar completează formularul, fără salvare", async () => {
    const { db, writes } = fakeDb();
    const r = await runAiListingSuggestions(db, "u1", "p1", deps("```json\n" + JSON.stringify(response({ title: "Apartament 2 camere, Gheorgheni", fields: [{ field: "floor", value: 3, evidence: "etaj 3/8" }] })) + "\n```").deps);
    expect(r.ok).toBe(true);
    const setText = vi.fn(); const setDetails = vi.fn();
    applyListingSuggestion({ kind: "field", field: "floor", value: 3 }, { setText, setDetails });
    applyListingSuggestion({ kind: "title", value: "Titlu" }, { setText, setDetails });
    expect(setDetails).toHaveBeenCalledWith({ floor: 3, floor_label: "Etaj 3" });
    expect(setText).toHaveBeenCalledWith({ title: "Titlu" });
    expect(writes).toEqual([]);
  });
});
