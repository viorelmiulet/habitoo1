import { describe, expect, it, vi } from "vitest";
import { deriveAutofillValues, deriveTextFeatures, textDeniesOption } from "./facts";
import { historyConsensus, selectHistoryRows, type HistoryRow } from "./history";
import { onlyEmptyFields, sanitizeAutofillResponse } from "./schema";
import { autofillSummaryRows } from "./summary";
import { buildAutofillRequest, runListingAutofill } from "./autofill.server";
import { applyAutofillProposal } from "@/components/app/ai/listing-autofill-apply";
import { loadAutofillHistory } from "./history.server";

const row = (id: string, extra: Record<string, unknown> = {}): HistoryRow => ({
  id, organization_id: "org", city: "București", address: "Strada Test 10", deleted_at: null,
  residential_complex: "Complex Test", heating_systems: ["Termoficare"], building_amenities: ["Lift"], ...extra,
});
const location = { city: "București", address: "Str. Test nr. 10", residentialComplex: "Complex Test" };
function sanitize(text: string, history?: ReturnType<typeof historyConsensus>, current: Record<string, unknown> = {}, fields: unknown[] = [], urban = false) {
  const p = sanitizeAutofillResponse({ fields }, { spokenText: text, current, history, photoCount: 3, urban });
  if (!p) throw new Error("Missing proposal");
  return onlyEmptyFields(p, current);
}

describe("AI17 — deeper autofill and private history", () => {
  it("8 building floors imply the exact Lift option", () => {
    expect(deriveAutofillValues({ building_floors: 8 }, "").building_amenities).toEqual(["Lift"]);
    expect(sanitize("", undefined, { building_floors: 8 }).sources.building_amenities).toBe("derived");
  });
  it("keyword rules cover utilities, transport, heating and windows", () => {
    const p = sanitize("fibră optică, canalizare, aproape de metrou, centrală proprie, termopan");
    expect(p.values.utilities).toEqual(["Fibră optică", "Canalizare"]);
    expect(p.values.street_arrangement).toEqual(["Mijloace de transport în comun"]);
    expect(p.values.heating_systems).toEqual(["Centrală proprie"]);
    expect(p.values.windows).toEqual(["Termopan"]);
    expect(p.sources).toMatchObject({ utilities: "derived", heating_systems: "derived", windows: "derived" });
  });
  it("two agreeing properties in a complex give high history provenance", () => {
    const history = historyConsensus(selectHistoryRows([row("a"), row("b")], "org", location), location);
    const p = sanitize("", history);
    expect(p.values).toMatchObject({ heating_systems: ["Termoficare"], building_amenities: ["Lift"] });
    expect(p.sources).toMatchObject({ heating_systems: "history", building_amenities: "history" });
    expect(p.confidence).toMatchObject({ heating_systems: "high", building_amenities: "high" });
    expect(autofillSummaryRows(p, ["heating_systems"])[0]?.source).toBe("din istoric");
  });
  it("never copies floor, surfaces, price, counts or interiors from history", () => {
    const history = historyConsensus([row("a", { floor: 3, usable_surface: 80, rooms: 4, bedrooms: 3, price: 90000, furnishing: "Complet", appliances: ["TV"], windows: ["Termopan"] })], location);
    for (const key of ["floor", "usable_surface", "rooms", "bedrooms", "price", "furnishing", "appliances", "windows"]) expect(history.values[key]).toBeUndefined();
  });
  it("explicit text contradicting history wins over history and photos", () => {
    const history = historyConsensus([row("a"), row("b")], location);
    const p = sanitize("centrală proprie, fără lift", history, {}, [
      { key: "heating_systems", value: ["Termoficare"], source: "photos", confidence: "high" },
      { key: "building_amenities", value: ["Lift"], source: "photos", confidence: "high" },
    ]);
    expect(p.values.heating_systems).toEqual(["Centrală proprie"]);
    expect(p.sources.heating_systems).toBe("derived");
    expect(p.values.building_amenities).toBeUndefined();
  });
  it("agent values stay unchanged despite text/history/photos/derivations", () => {
    const p = sanitize("centrală proprie, bloc 8 etaje", historyConsensus([row("a"), row("b")], location), {
      heating_systems: ["Pompă de căldură"], building_amenities: ["Interfon"], utilities: ["Puț"],
    });
    expect(p.values.heating_systems).toBeUndefined();
    expect(p.values.building_amenities).toBeUndefined();
    expect(p.values.utilities).toBeUndefined();
  });
  it("single history observation is medium; ties do not invent a consensus", () => {
    expect(historyConsensus([row("a")], location).confidence.heating_systems).toBe("medium");
    expect(historyConsensus([row("a"), row("b", { parking: "Garaj" }), row("c", { parking: "Loc de parcare" })], location).values.parking).toBeUndefined();
  });
  it("same org only, no current/deleted, at most 20, complex precedes address", () => {
    const selected = selectHistoryRows([
      row("current"), row("deleted", { deleted_at: "2026-01-01" }), row("other", { organization_id: "other" }),
      row("address-only", { residential_complex: "Elsewhere" }), ...Array.from({ length: 25 }, (_, i) => row(String(i))),
    ], "org", { ...location, propertyId: "current" });
    expect(selected).toHaveLength(20);
    expect(selected.some((r) => ["current", "deleted", "other", "address-only"].includes(r.id))).toBe(false);
  });
  it("address then coordinates <30m; construction stage only same complex", () => {
    expect(selectHistoryRows([row("a")], "org", { address: "Str. Test nr 10", city: "București" })).toHaveLength(1);
    const nearby = row("near", { address: "Elsewhere 1", lat: 44.43, lng: 26.10, construction_stage: "Finalizată" });
    expect(selectHistoryRows([nearby], "org", { lat: 44.4301, lng: 26.10 })).toHaveLength(1);
    expect(selectHistoryRows([nearby], "org", { lat: 44.431, lng: 26.10 })).toHaveLength(0);
    expect(historyConsensus([nearby], { lat: 44.4301, lng: 26.10 }).values.construction_stage).toBeUndefined();
  });

  it("address with locality suffix still matches street and number", () => {
    expect(selectHistoryRows([row("a", { address: "Strada Test 10, București" })], "org", { address: "Str. Test nr. 10", city: "București" })).toHaveLength(1);
  });
  it("visible utilities/insulation/metering/amenities/misc options accepted as medium photos", () => {
    const p = sanitize("", undefined, {}, [
      { key: "utilities", value: ["Curent electric"], source: "photos", confidence: "high" },
      { key: "insulation", value: ["Exterior"], source: "photos", confidence: "high" },
      { key: "metering", value: ["Apometre"], source: "photos", confidence: "high" },
      { key: "building_amenities", value: ["Interfon"], source: "photos", confidence: "high" },
      { key: "misc_features", value: ["Senzor de fum"], source: "photos", confidence: "high" },
    ]);
    expect(Object.keys(p.values)).toHaveLength(5);
    expect(Object.values(p.confidence)).toEqual(Array(5).fill("medium"));
  });
  it("urban defaults are medium and never ignore explicit or historical alternatives", () => {
    expect(sanitize("", undefined, {}, [], true)).toMatchObject({ values: { utilities: ["Curent electric", "Apă", "Canalizare"] }, confidence: { utilities: "medium" } });
    expect(sanitize("fără canalizare, puț și fosă septică", undefined, {}, [], true).values.utilities).toBeUndefined();
    expect(sanitize("", historyConsensus([row("a", { utilities: ["Puț", "Fosă septică"] })], location), {}, [], true).values.utilities).toEqual(["Fosă septică", "Puț"]);
    expect(sanitize("", undefined, {}, [], false).values.utilities).toBeUndefined();
  });
  it("singular parking and all supported interior options, with negation guards", () => {
    expect(deriveTextFeatures({}, "parcare subterană").parking_spaces).toBe(1);
    expect(deriveTextFeatures({}, "un loc de parcare subterană, boxă, debara, curte, interfon, videointerfon, parchet laminat, gresie, faianță, nemobilat, frigider")).toMatchObject({
      parking: "Parcare subterană", parking_spaces: 1, additional_spaces: ["Boxă la subsol", "Debara"], floor_finishes: ["Parchet", "Gresie"], wall_finishes: ["Faianță"], furnishing: "Nemobilat", appliances: ["Frigider"],
    });
    expect(textDeniesOption("nu are lift", "Lift")).toBe(true);
    expect(deriveAutofillValues({ building_floors: 8 }, "fără lift").building_amenities).toBeUndefined();
  });
  it("deep request has 8000 tokens and private allowlisted history summary", () => {
    const history = historyConsensus([row("a"), row("b")], location);
    const request = buildAutofillRequest({ images: [], text: "", history });
    expect(request.maxOutputTokens).toBe(8000);
    expect(request.messages[0]?.content).toContain("Din istoricul contului, același imobil");
    expect(request.messages[0]?.content).not.toContain("Strada Test");
  });
  it("caller-RLS history query scopes org, deleted and current and ignores far rows", async () => {
    const calls: unknown[][] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "order", "range", "neq", "ilike", "gte", "lte"]) chain[method] = (...args: unknown[]) => { calls.push([method, ...args]); return chain; };
    chain.then = (resolve: (r: unknown) => void) => resolve({ data: [row("a"), row("b")], error: null });
    const client = { from: vi.fn(() => chain) } as unknown as Parameters<typeof loadAutofillHistory>[0];
    const result = await loadAutofillHistory(client, "org", { ...location, propertyId: "current" });
    expect(calls).toEqual(expect.arrayContaining([["eq", "organization_id", "org"], ["is", "deleted_at", null], ["neq", "id", "current"]]));
    expect(result.history.confidence.heating_systems).toBe("high");
  });
  it("mocked full generation applies history/text proposals into the form, without saving", async () => {
    let draft: Record<string, unknown> = {};
    const generate = vi.fn(async () => ({ text: '{"fields":[]}', toolCalls: [], inputTokens: 1, outputTokens: 1 }));
    const result = await runListingAutofill({ id: "test", model: "test", supportsTools: false, generate }, {
      images: [], text: "centrală proprie, termopan", history: historyConsensus([row("a"), row("b")], location),
    });
    if (!result.ok) throw new Error(result.message);
    applyAutofillProposal(result.proposal, { setDetails: (fn) => { draft = fn(draft); }, setText: vi.fn(), setTx: vi.fn() }, {});
    expect(draft).toMatchObject({ heating_systems: ["Centrală proprie"], building_amenities: ["Lift"], windows: ["Termopan"] });
  });
});