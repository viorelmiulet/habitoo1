import { describe, expect, it } from "vitest";
import { leadFormForProperty, leadMatchesPropertyFilter } from "./lead-property-filter";

describe("filtrul Lead-uri pe proprietate", () => {
  const leads = [{ id: 1, property_id: "X" }, { id: 2, property_id: "Y" }, { id: 3, property_id: null }];
  it("?proprietate=X arată doar lead-urile lui X", () => {
    expect(leads.filter((l) => leadMatchesPropertyFilter(l, "X")).map((l) => l.id)).toEqual([1]);
  });
  it("fără filtru arată toate", () => {
    expect(leads.filter((l) => leadMatchesPropertyFilter(l, undefined))).toHaveLength(3);
  });
  it("Adaugă lead pornește cu X selectată", () => {
    expect(leadFormForProperty({ name: "", property_id: "" }, "X").property_id).toBe("X");
    expect(leadFormForProperty({ name: "", property_id: "" }, undefined).property_id).toBe("");
  });
});
