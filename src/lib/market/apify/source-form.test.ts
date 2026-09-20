import { describe, expect, it } from "vitest";
import {
  emptyApifySourceForm,
  firstItemKeys,
  parseJsonObject,
  validateApifySourceForm,
} from "./source-form";

function baseForm() {
  return {
    ...emptyApifySourceForm(),
    key: "olx_imobiliare",
    label: "OLX",
    actorId: "sian.agency/olx-property-scraper",
    inputJson: '{"country":"ro"}',
    fieldMappingJson: '{"url":"url","price":"price"}',
  };
}

describe("validateApifySourceForm", () => {
  it("refuză JSON invalid cu mesaj explicit și nu produce payload", () => {
    const result = validateApifySourceForm({ ...baseForm(), inputJson: "{country: ro" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.inputJson).toMatch(/JSON invalid/);
  });

  it("refuză o mapare care nu este text sau listă de texte", () => {
    const result = validateApifySourceForm({ ...baseForm(), fieldMappingJson: '{"price":123}' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.fieldMappingJson).toContain("price");
  });

  it("acceptă o configurație validă și normalizează valorile", () => {
    const result = validateApifySourceForm({
      ...baseForm(),
      maxItems: "250",
      unitCostUsd: "0.005",
      notes: "  test  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      key: "olx_imobiliare",
      maxItems: 250,
      unitCostUsd: 0.005,
      notes: "test",
      targets: ["market_pool"],
      input: { country: "ro" },
      fieldMapping: { url: "url", price: "price" },
    });
  });

  it("cere agenția când sursa creează prospecți", () => {
    const result = validateApifySourceForm({
      ...baseForm(),
      targets: ["prospects"],
      prospectOrganizationId: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.prospectOrganizationId).toBeTruthy();
  });

  it("refuză cheile care nu sunt slug", () => {
    const result = validateApifySourceForm({ ...baseForm(), key: "OLX Imobiliare" });
    expect(result.ok).toBe(false);
  });
});

describe("parseJsonObject", () => {
  it("tratează textul gol ca obiect gol", () => {
    expect(parseJsonObject("  ")).toEqual({ ok: true, value: {} });
  });

  it("refuză o listă", () => {
    const result = parseJsonObject("[1,2]");
    expect(result.ok).toBe(false);
  });
});

describe("firstItemKeys", () => {
  it("listează cheile primului rezultat, inclusiv un nivel de adâncime", () => {
    const keys = firstItemKeys('{"id":"1","params":{"price":100},"images":[]}');
    expect(keys).toEqual(["id", "params", "params.price", "images"]);
  });

  it("întoarce listă goală fără rezultat", () => {
    expect(firstItemKeys(null)).toEqual([]);
  });
});
