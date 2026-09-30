import { describe, expect, it } from "vitest";
import {
  PROPERTY_TYPE_TABS,
  isAtLeastFilter,
  normalizeSavedPropertyFilters,
  numericFilterValue,
  shouldShowAdvancedFilters,
} from "./property-list-filters";

describe("filtrele listei de proprietăți", () => {
  it("interpretează 5+ camere și 3+ băi ca praguri minime", () => {
    expect(isAtLeastFilter("5+")).toBe(true);
    expect(numericFilterValue("5+")).toBe(5);
    expect(isAtLeastFilter("3+")).toBe(true);
    expect(numericFilterValue("3+")).toBe(3);
    expect(isAtLeastFilter("2")).toBe(false);
  });

  it("păstrează intervalul de etaj și convertește filtrul vechi", () => {
    expect(normalizeSavedPropertyFilters({ floorMin: "0", floorMax: "4" })).toMatchObject({
      floorMin: "0",
      floorMax: "4",
    });
    expect(normalizeSavedPropertyFilters({ floor: "2" })).toMatchObject({
      floorMin: "2",
      floorMax: "2",
    });
  });

  it("expune toate tab-urile de tip în ordinea cerută", () => {
    expect(PROPERTY_TYPE_TABS.map((tab) => tab.label)).toEqual([
      "Toate",
      "Apartamente",
      "Garsoniere",
      "Case / vile",
      "Terenuri",
      "Spații comerciale",
      "Birouri",
      "Industrial",
    ]);
  });

  it("ascunde câmpurile avansate când grila este restrânsă", () => {
    expect(shouldShowAdvancedFilters(false)).toBe(false);
    expect(shouldShowAdvancedFilters(true)).toBe(true);
  });
});
