import { describe, expect, it, vi } from "vitest";
import { extractStatedFacts } from "./facts";
import { onlyEmptyFields, sanitizeAutofillResponse } from "./schema";
import { withoutUnchosenDefaults } from "./empty";
import { runListingAutofill } from "./autofill.server";
import { applyAutofillProposal, autofillKnownValues } from "@/components/app/ai/listing-autofill-apply";
import { emptyTransaction } from "@/components/app/PropertyTransactionFields";

function proposal(text: string, current: Record<string, unknown> = {}, fields: unknown[] = []) {
  const result = sanitizeAutofillResponse({ fields }, { spokenText: "", contextText: text, current, photoCount: 0 });
  if (!result) throw new Error("Missing proposal");
  return onlyEmptyFields(result, current);
}

describe("AI16 — deterministic room counts", () => {
  it.each([
    ["Apartament 3 camere", 3, 2],
    ["Garsonieră Militari", 1, 1],
    ["Apartament 2 camere", 2, 1],
    ["ap. trei camere, 2 dormitoare", 3, 2],
    ["Apartament 4 camere decomandat", 4, 3],
    ["Studio Militari", 1, 1],
  ])("%s → rooms %s, bedrooms %s", (text, rooms, bedrooms) => {
    expect(proposal(text).values).toMatchObject({ rooms, bedrooms });
  });

  it("derived sources for studio and apartment bedrooms; explicit bedrooms win over model guesses", () => {
    expect(proposal("Garsonieră Militari").sources).toMatchObject({ rooms: "text", bedrooms: "derived" });
    expect(proposal("Apartament 3 camere").sources).toMatchObject({ rooms: "text", bedrooms: "derived" });
    expect(proposal("ap. trei camere, 2 dormitoare", {}, [
      { key: "bedrooms", value: 3, confidence: "high", source: "text" },
    ])).toMatchObject({ values: { rooms: 3, bedrooms: 2 }, sources: { bedrooms: "text" } });
  });

  it.each(["Casă 5 camere", "Vilă 5 camere"])("%s never derives bedrooms", (text) => {
    expect(proposal(text).values.rooms).toBe(5);
    expect(proposal(text).values.bedrooms).toBeUndefined();
  });

  it.each(["3 camere", "trei camere", "3 cam.", "3 cam", "apartament cu 3 camere", "ap. 3 camere", "4 camere decomandat", "1 cameră"])("recognizes %s", (text) => {
    expect(extractStatedFacts(text).rooms).toBe(text.startsWith("4") ? 4 : text.startsWith("1") ? 1 : 3);
  });

  it.each(["2 dormitoare", "două dormitoare", "3 dorm."])("recognizes %s", (text) => {
    expect(extractStatedFacts(text).bedrooms).toBe(text.startsWith("3") ? 3 : 2);
  });

  it.each(["un dormitor", "1 dormitor"])("recognizes %s as one bedroom", (text) => {
    expect(extractStatedFacts(text).bedrooms).toBe(1);
  });

  it("generated title fills 3/2 as derived medium when the original title is empty", () => {
    const p = sanitizeAutofillResponse({ fields: [], title: "Apartament 3 camere, Militari" }, { spokenText: "", photoCount: 3 });
    expect(p?.title).toBe("Apartament 3 camere, Militari");
    expect(p?.values).toMatchObject({ rooms: 3, bedrooms: 2, property_type: "apartment" });
    expect(p?.sources).toMatchObject({ rooms: "derived", bedrooms: "derived", property_type: "derived" });
    expect(p?.confidence).toMatchObject({ rooms: "medium", bedrooms: "medium", property_type: "medium" });
  });

  it("accepted generated description contributes explicit bedrooms before deductions", () => {
    const p = sanitizeAutofillResponse({ fields: [], description: "Apartament cu trei camere și un dormitor." }, { spokenText: "", photoCount: 3 });
    expect(p?.values).toMatchObject({ rooms: 3, bedrooms: 1 });
    expect(p?.confidence).toMatchObject({ rooms: "medium", bedrooms: "medium" });
  });

  it("photo counts are medium and explicit agent text overrides them", () => {
    const fields = [{ key: "rooms", value: 4, confidence: "high", source: "photos" }, { key: "bedrooms", value: 3, confidence: "high", source: "photos" }];
    const photos = sanitizeAutofillResponse({ fields }, { spokenText: "", photoCount: 4 });
    expect(photos?.values).toMatchObject({ rooms: 4, bedrooms: 3 });
    expect(photos?.confidence).toMatchObject({ rooms: "medium", bedrooms: "medium" });
    expect(photos?.sources).toMatchObject({ rooms: "photos", bedrooms: "photos" });
    const explicit = sanitizeAutofillResponse({ fields }, { spokenText: "Apartament 3 camere, 2 dormitoare", photoCount: 4 });
    expect(explicit?.values).toMatchObject({ rooms: 3, bedrooms: 2 });
    expect(explicit?.confidence).toMatchObject({ rooms: "high", bedrooms: "high" });
  });

  it("bedroom derived from a photo room count remains medium", () => {
    const p = sanitizeAutofillResponse({ fields: [{ key: "rooms", value: 3, source: "photos", confidence: "high" }] }, { spokenText: "", current: { property_type: "apartment" }, photoCount: 3 });
    expect(p?.values).toMatchObject({ rooms: 3, bedrooms: 2 });
    expect(p?.confidence.bedrooms).toBe("medium");
  });

  it("never extracts generated prices, floor or surfaces, including from rejected text", () => {
    const p = sanitizeAutofillResponse({ fields: [], title: "Apartament 3 camere", description: "Apartament cu 3 camere, 80 mp, etaj 4, 90000 euro." }, { spokenText: "", photoCount: 3 });
    expect(p?.description).toBeNull();
    expect(p?.values.rooms).toBe(3);
    expect(p?.values.usable_surface).toBeUndefined();
    expect(p?.values.floor).toBeUndefined();
    expect(p?.values.price).toBeUndefined();
  });

  it("generated and photo proposals never overwrite an agent choice", () => {
    const current = { rooms: 4, bedrooms: 3, property_type: "apartment" };
    const p = sanitizeAutofillResponse({ fields: [{ key: "rooms", value: 2, source: "photos", confidence: "medium" }], title: "Apartament 2 camere" }, { spokenText: "", current, photoCount: 3 });
    if (!p) throw new Error("Missing proposal");
    expect(onlyEmptyFields(p, current).values.rooms).toBeUndefined();
    expect(onlyEmptyFields(p, current).values.bedrooms).toBeUndefined();
  });

  it("explicit bedrooms without rooms imply D+1 only at apartment", () => {
    expect(proposal("Apartament cu două dormitoare").values).toMatchObject({ rooms: 3, bedrooms: 2 });
    expect(proposal("Casă cu două dormitoare").values.rooms).toBeUndefined();
  });

  it("an AI type guess cannot cause bedroom deduction for an explicit house", () => {
    expect(proposal("Casă 5 camere", {}, [
      { key: "property_type", value: "apartment", confidence: "high", source: "text" },
    ]).values.bedrooms).toBeUndefined();
  });

  it("zero counts and unchosen new-form defaults do not block autofill", () => {
    const current = withoutUnchosenDefaults({ rooms: 0, bedrooms: 1, bathrooms: 0, kitchens: 0, balconies: 0, property_type: "apartment" },
      { rooms: 0, bedrooms: 1, property_type: "apartment" }, new Set());
    expect(proposal("Apartament 3 camere", current).values).toMatchObject({ rooms: 3, bedrooms: 2 });
    const numericFields = ["bathrooms", "kitchens", "balconies", "terraces", "parking_spaces", "garages"];
    for (const key of numericFields) {
      expect(proposal("Apartament cu 2 încăperi", { [key]: 0 }, [{ key, value: 2, confidence: "high", source: "text" }]).values[key]).toBe(2);
    }
  });

  it("explicit choices including zero and the default stay protected", () => {
    const current = withoutUnchosenDefaults({ rooms: 4, bedrooms: 0, property_type: "apartment" },
      { rooms: 4, bedrooms: 0, property_type: "apartment" }, new Set(["rooms", "bedrooms", "property_type"]));
    const p = proposal("Apartament 3 camere, două dormitoare", current);
    expect(p.values.rooms).toBeUndefined();
    expect(p.values.bedrooms).toBeUndefined();
    expect(p.values.property_type).toBeUndefined();
    expect(autofillKnownValues(current).__autofillChosen).toEqual(["rooms", "bedrooms", "property_type"]);
  });

  it("a protected rooms value drives derivation instead of a conflicting title", () => {
    expect(proposal("Apartament 3 camere", { rooms: 4, property_type: "apartment" }).values).toMatchObject({ bedrooms: 3 });
  });

  it("unrelated numbers cannot become rooms or bedrooms", () => {
    expect(proposal("Apartament etaj 3", {}, [{ key: "rooms", value: 3, confidence: "high", source: "text" }]).values.rooms).toBeUndefined();
  });

  it("uses agent text and voice transcript too", () => {
    const text = sanitizeAutofillResponse({ fields: [] }, { spokenText: "Apartament trei camere", photoCount: 0 });
    const voice = sanitizeAutofillResponse({ fields: [], transcript: "Apartament trei camere" }, { spokenText: "", photoCount: 0 });
    expect(text?.values).toMatchObject({ rooms: 3, bedrooms: 2 });
    expect(voice?.values).toMatchObject({ rooms: 3, bedrooms: 2 });
  });

  it("title travels through mocked provider, validation and real form application", async () => {
    let details: Record<string, unknown> = { rooms: 0, bedrooms: 0, property_type: "apartment" };
    const current = withoutUnchosenDefaults(details, { property_type: "apartment" }, new Set());
    const generate = vi.fn(async (_request: unknown) => ({ text: '{"fields":[]}', toolCalls: [], inputTokens: 1, outputTokens: 1 }));
    const result = await runListingAutofill({ id: "test", model: "test", supportsTools: false, generate }, {
      images: [], text: "", context: { title: "Apartament 3 camere", known: autofillKnownValues(current) },
    });
    expect(generate.mock.calls[0]?.[0]).toMatchObject({ messages: [{ content: expect.stringContaining("Apartament 3 camere") }] });
    if (!result.ok) throw new Error(result.message);
    applyAutofillProposal(result.proposal, {
      setDetails: (fn) => { details = fn(details); }, setText: vi.fn(), setTx: (fn) => { fn(emptyTransaction); },
    }, current);
    expect(details).toMatchObject({ rooms: 3, bedrooms: 2 });
  });

  it("empty title → generated title → real draft gets 3/2 with review markers", async () => {
    let details: Record<string, unknown> = {};
    let title = "";
    const generate = vi.fn(async () => ({ text: '{"fields":[],"title":"Apartament 3 camere, Militari"}', toolCalls: [], inputTokens: 1, outputTokens: 1 }));
    const result = await runListingAutofill({ id: "test", model: "test", supportsTools: false, generate }, {
      images: [{ mimeType: "image/jpeg", base64: "AA==" }], text: "", context: { title: "" },
    });
    if (!result.ok) throw new Error(result.message);
    const applied = applyAutofillProposal(result.proposal, {
      setDetails: (fn) => { details = fn(details); }, setText: (patch) => { title = patch.title ?? title; }, setTx: vi.fn(),
    }, {});
    expect(title).toBe("Apartament 3 camere, Militari");
    expect(details).toMatchObject({ rooms: 3, bedrooms: 2 });
    expect(applied.keys).toEqual(expect.arrayContaining(["rooms", "bedrooms", "title"]));
    expect(applied.proposal.confidence).toMatchObject({ rooms: "medium", bedrooms: "medium" });
  });
});