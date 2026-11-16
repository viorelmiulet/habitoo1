import { describe, expect, it } from "vitest";
import { sanitizeAutofillResponse, onlyEmptyFields } from "./schema";
import { deriveAutofillValues, extractStatedFacts } from "./facts";

const empty = { fields: [] };

describe("AI12 – fapte explicite și deducții", () => {
  it("descrierea „Apartament 2 camere, etaj 3/8, 65 mp utili, bloc 1985” completează etaj, suprafață, an", () => {
    const p = sanitizeAutofillResponse(empty, { spokenText: "", contextText: "Apartament 2 camere, etaj 3/8, 65 mp utili, bloc 1985", photoCount: 0 })!;
    expect(p.values).toMatchObject({ floor: 3, building_floors: 8, floor_label: "Etaj 3", usable_surface: 65, build_year: 1985, rooms: 2 });
    expect(p.sources["floor"]).toBe("text");
  });

  it("„P/4” → Parter, floor 0, building_floors 4", () => {
    expect(extractStatedFacts("Apartament P/4")).toMatchObject({ floor: 0, floor_label: "Parter", building_floors: 4 });
  });

  it("„etajul trei” → 3; „etaj intermediar” nu completează numărul", () => {
    expect(extractStatedFacts("situat la etajul trei").floor).toBe(3);
    expect(extractStatedFacts("etaj intermediar").floor).toBeUndefined();
  });

  it("valoarea etajului propusă de model din text e acceptată când e scrisă „P/4”", () => {
    const p = sanitizeAutofillResponse({ fields: [{ key: "floor", value: 0, confidence: "high", source: "text" }] }, { spokenText: "", contextText: "Garsonieră P/4", photoCount: 0 })!;
    expect(p.values["floor"]).toBe(0);
  });

  it("deducții: balcoane → balcon, euro → EUR, garsonieră → 1 cameră", () => {
    expect(deriveAutofillValues({ balconies: 2 }, "")).toMatchObject({ balcony: true });
    expect(deriveAutofillValues({ price: 75000 }, "75000 euro")).toMatchObject({ currency: "EUR" });
    expect(deriveAutofillValues({}, "Garsonieră renovată")).toMatchObject({ rooms: 1, property_type: "studio" });
  });

  it("un câmp deja completat nu e suprascris", () => {
    const p = sanitizeAutofillResponse(empty, { spokenText: "", contextText: "etaj 3/8", current: { floor: 5 }, photoCount: 0 })!;
    const kept = onlyEmptyFields(p, { floor: 5, floor_label: "Etaj 5" });
    expect(kept.values["floor"]).toBeUndefined();
    expect(kept.values["floor_label"]).toBeUndefined();
    expect(kept.values["building_floors"]).toBe(8);
  });

  it("etajul din poze e respins; băile din poze sunt „de verificat”", () => {
    const p = sanitizeAutofillResponse({ fields: [
      { key: "floor", value: 4, confidence: "high", source: "photos" },
      { key: "bathrooms", value: 2, confidence: "high", source: "photos" },
    ] }, { spokenText: "", photoCount: 3 })!;
    expect(p.values["floor"]).toBeUndefined();
    expect(p.values["bathrooms"]).toBe(2);
    expect(p.confidence["bathrooms"]).toBe("medium");
    expect(p.sources["bathrooms"]).toBe("photos");
  });
});
