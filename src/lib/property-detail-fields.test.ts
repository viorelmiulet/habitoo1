import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROPERTY_DETAIL_FIELDS } from "./property-detail-fields";
import { floorLabelOptions } from "./property-taxonomy";
import { FLOOR_LABEL_NUMBER, floorNumberRequired } from "./property-floor";

const form = readFileSync("src/components/app/PropertyDetailsFields.tsx", "utf8");

describe("configurația câmpurilor de detalii", () => {
  it("nu mai trimite `surface` (o calculează triggerul)", () => {
    expect(PROPERTY_DETAIL_FIELDS).not.toContain("surface");
    expect(PROPERTY_DETAIL_FIELDS).toContain("usable_surface");
  });

  it("nu mai are intrări separate pentru `floor` și `surface`", () => {
    expect(form).not.toMatch(/field="surface"/);
    expect(form).not.toMatch(/field="floor"/);
    expect(form).not.toContain("Etaj (număr)");
    expect(form).toMatch(/field="usable_surface" label="Suprafață utilă \(m²\)"/);
  });

  it("cere „Număr etaj” doar pentru etichetele fără număr fix", () => {
    const withNumber = floorLabelOptions.filter((l) => floorNumberRequired(l));
    expect(withNumber).toEqual(["Etaj 10+", "Penultimul etaj", "Ultimul etaj", "Mansardă"]);
    for (const l of floorLabelOptions) {
      expect(floorNumberRequired(l)).toBe(FLOOR_LABEL_NUMBER[l] === null);
    }
    expect(floorNumberRequired(null)).toBe(false);
    expect(floorNumberRequired("")).toBe(false);
  });
});
