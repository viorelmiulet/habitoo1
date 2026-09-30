import { describe, expect, it } from "vitest";
import {
  PROPERTY_TYPE_TABS,
  buildCityFilterOptions,
  buildDistrictFilterOptions,
  cityRawValues,
  isAtLeastFilter,
  normalizeCityFilterValue,
  normalizeSavedPropertyFilters,
  numericFilterValue,
  propertyListSearchFromState,
  propertyListSearchSchema,
  propertyListStateFromSearch,
  romaniaDateBoundary,
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

  it("normalizează variantele București și filtrează pe toate valorile brute din grup", () => {
    const rows = [
      { city: "Bucureşti", district: "Militari", source: "immoflux" },
      { city: "București", district: "Drumul Taberei", source: "manual" },
      { city: "Bucureşti Sectorul 6", district: "Militari", source: "immoflux" },
      { city: "Cluj-Napoca", district: "Centru", source: "manual" },
    ];
    const options = buildCityFilterOptions(rows);

    expect(normalizeCityFilterValue("Bucureşti Sectorul 6")).toBe("București");
    expect(options.find((option) => option.value === "București")).toMatchObject({ count: 3 });
    expect(cityRawValues(options, "București")).toEqual([
      "Bucureşti",
      "București",
      "Bucureşti Sectorul 6",
    ]);
  });

  it("arată și numără numai zonele orașului selectat", () => {
    const rows = [
      { city: "Bucureşti", district: "Militari", source: "immoflux" },
      { city: "Bucureşti Sectorul 6", district: "Militari", source: "manual" },
      { city: "București", district: "Drumul Taberei", source: "manual" },
      { city: "Cluj-Napoca", district: "Centru", source: "manual" },
    ];
    const cities = buildCityFilterOptions(rows);

    expect(buildDistrictFilterOptions(rows, "București", cities)).toEqual([
      { value: "Drumul Taberei", label: "Drumul Taberei", count: 1 },
      { value: "Militari", label: "Militari", count: 2 },
    ]);
  });

  it("calculează începutul și sfârșitul zilei în ora României", () => {
    expect(romaniaDateBoundary("2026-09-30", "start")).toBe("2026-09-29T21:00:00.000Z");
    expect(romaniaDateBoundary("2026-09-30", "end")).toBe("2026-09-30T20:59:59.999Z");
    expect(romaniaDateBoundary("2026-01-15", "start")).toBe("2026-01-14T22:00:00.000Z");
    expect(romaniaDateBoundary("2026-01-15", "end")).toBe("2026-01-15T21:59:59.999Z");
  });

  it("citește filtrele, sortarea, pagina și modul din URL", () => {
    const state = propertyListStateFromSearch(propertyListSearchSchema.parse({
      q: "Militari",
      type: "apartment",
      portal: "romimo:published",
      favoritesOnly: true,
      sort: "price_asc",
      page: "3",
      view: "grid",
    }));

    expect(state).toMatchObject({
      filters: { q: "Militari", type: "apartment", portal: "romimo:published", favoritesOnly: true },
      sort: "price_asc",
      page: 3,
      view: "grid",
    });
  });

  it("scrie în URL numai valorile diferite de cele implicite", () => {
    const defaults = propertyListStateFromSearch(propertyListSearchSchema.parse({}));
    expect(propertyListSearchFromState(defaults.filters, defaults.sort, defaults.page, defaults.view)).toEqual({});

    expect(propertyListSearchFromState(
      { ...defaults.filters, city: "București", mine: true },
      "updated_desc",
      2,
      "grid",
    )).toEqual({ city: "București", mine: true, sort: "updated_desc", page: 2, view: "grid" });
  });
});
