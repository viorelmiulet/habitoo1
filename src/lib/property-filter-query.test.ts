import { describe, expect, it } from "vitest";
import { PROPERTY_FILTER_COLUMNS, applyPropertyDevelopmentFilter, applyPropertyFilterClauses, geographyFromPlaces, otherFiltersCount, placesFromGeography, type FilterableQuery } from "./property-filter-query";
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
      ["Valabilitate", "Adăugat între", "Modificat între", "Portaluri"],
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
    const both = run({ street: "Unirii", q: "Militari" }).find(([m]) => m === "or");
    expect(both?.[2]).toMatch(/^and\(or\(title\.ilike\.%Militari%.*\),or\(street\.ilike\.%Unirii%,address\.ilike\.%Unirii%\)\)$/);
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

  it("contorul „Alte filtre” nu numără portalul, ci doar opțiunile din el", () => {
    expect(otherFiltersCount({ ...emptyPropertyListFilters, portal: "storia:unpublished" }, false)).toBe(0);
    expect(otherFiltersCount({ ...emptyPropertyListFilters, portal: "storia:unpublished", bathrooms: "2" }, false)).toBe(1);
    expect(otherFiltersCount({ ...emptyPropertyListFilters, portal: "all", agent: "a1", mine: true }, true)).toBe(2);
  });
});

describe("vizibilitatea unităților numai în lista Proprietăți", () => {
  it("implicit exclude development_id nenul în interogare", () => {
    expect(run({})).toContainEqual(["is", "development_id", null]);
  });
  it("bifa include unitățile alături de anunțurile independente", () => {
    expect(run({ showDevelopments: true }).some(([, c]) => c === "development_id")).toBe(false);
  });
  it("ansamblul anume și Doar din ansambluri nu sunt contrazise de valoarea implicită", () => {
    expect(run({ development: "mrm" })).toContainEqual(["eq", "development_id", "mrm"]);
    expect(run({ development: "any" })).toContainEqual(["or", "", "development_id.not.is.null"]);
    expect(run({ development: "any" })).not.toContainEqual(["is", "development_id", null]);
  });
  it("referința exactă HB-1390 ocolește excluderea, nu căutările parțiale sau generale", () => {
    expect(run({ q: " hb-1390 " })).toContainEqual(["eq", "reference", "HB-1390"]);
    expect(run({ q: "HB-1390" })).not.toContainEqual(["is", "development_id", null]);
    expect(run({ q: "HB-139" })).toContainEqual(["eq", "reference", "HB-139"]);
    expect(run({ q: "HB-" })).toContainEqual(["is", "development_id", null]);
    expect(run({ q: "Militari" })).toContainEqual(["is", "development_id", null]);
  });

  const fixtures = [
    { id: "original", development_id: null, reference: "HB-1126", status: "active" },
    { id: "copy", development_id: "mrm", reference: "HB-1390", status: "active" },
    { id: "other-copy", development_id: "other", reference: "HB-1454", status: "active" },
    { id: "independent", development_id: null, reference: "HB-20", status: "active" },
  ];
  type Row = typeof fixtures[number];
  class RowsQuery extends Recorder {
    predicates: ((row: Row) => boolean)[] = [];
    override is(c: string, v: null) { this.predicates.push((r) => r[c as keyof Row] === v); super.is(c, v); return this; }
    override eq(c: string, v: unknown) { this.predicates.push((r) => r[c as keyof Row] === v); super.eq(c, v); return this; }
    override in(c: string, values: unknown[]) { this.predicates.push((r) => values.includes(r[c as keyof Row])); super.in(c, values); return this; }
    override or(f: string) {
      if (f !== "development_id.not.is.null") throw new Error(`Unexpected clause: ${f}`);
      this.predicates.push((r) => r.development_id !== null);
      super.or(f);
      return this;
    }
    result(offset: number, size: number) {
      const matched = fixtures.filter((r) => this.predicates.every((p) => p(r)));
      return { count: matched.length, rows: matched.slice(offset, offset + size) };
    }
  }
  function results(patch: Partial<PropertyListFilters>, offset = 0) {
    const filters = { ...emptyPropertyListFilters, ...patch };
    const list = new RowsQuery();
    applyPropertyFilterClauses(list, filters, { agentClause: { kind: "none" } });
    const portfolio = new RowsQuery();
    applyPropertyDevelopmentFilter(portfolio, filters);
    return { ...list.result(offset, 2), portfolio: portfolio.result(0, 10).count };
  }
  it("numără înainte de paginare și Selectează tot/CSV primesc numai pagina filtrată", () => {
    const hidden = results({});
    expect(hidden.count).toBe(2);
    expect(hidden.portfolio).toBe(2);
    expect(hidden.rows.map((r) => r.id)).toEqual(["original", "independent"]);
    const included = results({ showDevelopments: true }, 2);
    expect(included.count).toBe(4);
    expect(included.portfolio).toBe(4);
    expect(included.rows.map((r) => r.id)).toEqual(["other-copy", "independent"]);
    expect(results({ development: "mrm" }).rows.map((r) => r.id)).toEqual(["copy"]);
    expect(results({ development: "any" }).count).toBe(2);
  });
  it("găsește efectiv copia HB-1390 și nu HB-139 prin căutare exactă", () => {
    expect(results({ q: "HB-1390" }).rows.map((r) => r.id)).toEqual(["copy"]);
    expect(results({ q: "HB-1390" }).count).toBe(1);
    expect(results({ q: "HB-139" }).count).toBe(0);
  });
});
