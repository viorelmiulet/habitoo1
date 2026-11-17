import { describe, expect, it } from "vitest";
import { autofillCountLabel, autofillSummaryRows, formatAutofillValue } from "./summary";
import type { AutofillProposal } from "./schema";

const proposal = (over: Partial<AutofillProposal> = {}): AutofillProposal => ({
  values: {},
  confidence: {},
  sources: {},
  title: null,
  description: null,
  photoOrder: null,
  ignored: [],
  ...over,
});

describe("formatAutofillValue", () => {
  it("boolean → „Da”, multi → listă cu virgulă, suprafață → „mp”, număr simplu → fără unitate", () => {
    expect(formatAutofillValue("balcony", true)).toBe("Da");
    expect(formatAutofillValue("views", ["Panoramică", "Urbană"])).toBe("Panoramică, Urbană");
    expect(formatAutofillValue("usable_surface", 65)).toBe("65 mp");
    expect(formatAutofillValue("rooms", 2)).toBe("2");
    expect(formatAutofillValue("comfort", "1")).toBe("1");
  });
});

describe("autofillSummaryRows", () => {
  it("rândul are eticheta, valoarea formatată și sursa; medium → de verificat", () => {
    const p = proposal({
      values: { rooms: 2, usable_surface: 65, bathrooms: 1 },
      confidence: { rooms: "high", usable_surface: "high", bathrooms: "medium" },
      sources: { rooms: "spoken", usable_surface: "text", bathrooms: "photos" },
    });
    const rows = autofillSummaryRows(p, ["rooms", "usable_surface", "bathrooms"]);
    expect(rows).toEqual([
      { key: "rooms", label: "Camere", value: "2", source: "din text", check: false },
      { key: "usable_surface", label: "Suprafață utilă", value: "65 mp", source: "din descriere", check: false },
      { key: "bathrooms", label: "Băi", value: "1", source: "din poze", check: true },
    ]);
  });

  it("titlul și descrierea apar ca „generat”/„generată”, fără textul complet", () => {
    const p = proposal({ title: "Apartament luminos de vânzare", description: "O descriere lungă, foarte lungă" });
    const rows = autofillSummaryRows(p, ["title", "description"]);
    expect(rows).toEqual([
      { key: "title", label: "Titlu", value: "generat", source: null, check: false },
      { key: "description", label: "Descriere", value: "generată", source: null, check: false },
    ]);
  });

  it("câmpurile nemarcate sau fără valoare nu apar", () => {
    const p = proposal({ values: { rooms: 2 }, confidence: { rooms: "high" }, sources: { rooms: "derived" } });
    expect(autofillSummaryRows(p, ["rooms", "bedrooms"])).toHaveLength(1);
    expect(autofillSummaryRows(p, [])).toHaveLength(0);
    expect(autofillSummaryRows(p, ["rooms"])[0]!.source).toBe("dedus");
  });
});

describe("autofillCountLabel", () => {
  it("acordul numeralelor: 1 câmp, 3 câmpuri, 20 de câmpuri", () => {
    expect(autofillCountLabel(1)).toBe("1 câmp");
    expect(autofillCountLabel(3)).toBe("3 câmpuri");
    expect(autofillCountLabel(20)).toBe("20 de câmpuri");
  });
});
