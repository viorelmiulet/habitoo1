import { describe, expect, it } from "vitest";
import { PROPERTY_FILTER_COLUMNS, applyPropertyFilterClauses, geographyFromPlaces, placesFromGeography, type FilterableQuery } from "./property-filter-query";
import { emptyPropertyListFilters, normalizeSavedPropertyFilters, propertyListSearchSchema, propertyListStateFromSearch, selectedStatuses, type PropertyListFilters } from "./property-list-filters";
import { parsePlaceChoices } from "./search-places";

class Recorder implements FilterableQuery<Recorder> {
  calls: [string, string, unknown][] = [];
  eq(c: string, v: unknown) { this.calls.push(["eq", c, v]); return this; }
  in(c: string, v: unknown[]) { this.calls.push(["in", c, v]); return this; }
  gte(c: string, v: unknown) { this.calls.push(["gte", c, v]); return this; }
  lte(c: string, v: unknown) { this.calls.push(["lte", c, v]); return this; }
  is(c: string, v: null) { this.calls.push(["is", c, v]); return this; }
  or(f: string) { this.calls.push(["or", "", f]); return this; }
}
const run = (patch: Partial<PropertyListFilters>) =>
  applyPropertyFilterClauses(new Recorder(), { ...emptyPropertyListFilters, ...patch }, { agentClause: { kind: "none" } }).calls;

describe("panoul de filtre al proprietăților", () => {
  it("are câmpurile în ordinea din captură pe fiecare coloană", () => {
    expect(PROPERTY_FILTER_COLUMNS).toEqual([
      ["Județ", "Localități", "Zonă", "Stradă"],
      ["Tip proprietate", "Tip tranzacție", "Camere", "Suprafață utilă", "Preț"],
      ["Valabilitate", "Adăugat între", "Modificat între"],
      ["Cuvinte cheie", "Destinație", "Promovare", "Alte filtre"],
    ]);
  });

  it("Valabilitate implicit exclude Arhivat", () => {
    expect(selectedStatuses(emptyPropertyListFilters)).not.toContain("archived");
    expect(run({})).toContainEqual(["in", "status", ["draft", "active", "reserved", "negotiation", "sold", "rented", "expired"]]);
  });

  it("un filtru salvat vechi cu status=reserved și showArchived devine Rezervat + Arhivat", () => {
    const saved = normalizeSavedPropertyFilters({ status: "reserved", showArchived: true });
    expect(selectedStatuses(saved)).toEqual(["reserved", "archived"]);
    expect(saved.status).toBe("all");
    expect(saved.showArchived).toBe(false);
    const fromUrl = propertyListStateFromSearch(propertyListSearchSchema.parse({ status: "reserved", showArchived: "true" })).filters;
    expect(selectedStatuses(fromUrl)).toEqual(["reserved", "archived"]);
    const onlyArchived = normalizeSavedPropertyFilters({ showArchived: true });
    expect(run(onlyArchived).some(([, c]) => c === "status")).toBe(false);
  });

  it("tab-ul Apartamente include apartament și garsonieră", () => {
    expect(run({ tab: "apartments" })).toContainEqual(["in", "property_type", ["apartment", "studio"]]);
    expect(run({ tab: "apartments", type: "studio" })).toContainEqual(["eq", "property_type", "studio"]);
  });

  it("Stradă caută în stradă și adresă", () => {
    expect(run({ street: "Dorobanți" })).toContainEqual(["or", "", "street.ilike.%Dorobanți%,address.ilike.%Dorobanți%"]);
    const both = run({ street: "Unirii", q: "HB-1" }).find(([m]) => m === "or");
    expect(both?.[2]).toMatch(/^and\(or\(title\.ilike\.%HB-1%.*\),or\(street\.ilike\.%Unirii%,address\.ilike\.%Unirii%\)\)$/);
  });

  it("Județul ales devine filtru de județ, iar localitățile îl restrâng", () => {
    const county = parsePlaceChoices(placesFromGeography({ county: "cluj", cities: [], zones: [] }));
    expect(county).toEqual([{ kind: "county", county: "cluj", city: "", zone: "" }]);
    const city = JSON.stringify({ kind: "city", county: "cluj", city: "cluj napoca", zone: "" });
    const locuri = placesFromGeography({ county: "cluj", cities: [city], zones: [] });
    expect(parsePlaceChoices(locuri)).toEqual([{ kind: "city", county: "cluj", city: "cluj napoca", zone: "" }]);
    expect(geographyFromPlaces(locuri)).toEqual({ county: "cluj", cities: [city], zones: [] });
  });

  it("Modificat între filtrează pe updated_at în ziua României", () => {
    const calls = run({ updatedAfter: "2026-10-01", updatedBefore: "2026-10-30" });
    expect(calls).toContainEqual(["gte", "updated_at", "2026-09-30T21:00:00.000Z"]);
    expect(calls).toContainEqual(["lte", "updated_at", "2026-10-30T21:59:59.999Z"]);
  });

  it("Destinație filtrează pe valoarea exactă", () => {
    expect(run({ destination: "Rezidențial" })).toContainEqual(["eq", "destination", "Rezidențial"]);
    expect(run({}).some(([, c]) => c === "destination")).toBe(false);
  });
});
