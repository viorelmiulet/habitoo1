import { describe, expect, it } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { computeLeadMatches, criteriaFromProperty } from "./lead-matching";
import { normalizePlace, scoreMatch } from "./matching";

const prop = (o: Partial<Tables<"properties">>) =>
  ({ id: "x", organization_id: "org", status: "active", transaction_kind: "sale", property_type: "apartment",
    price: 100000, city: "București", district: "Sector 6", address: null, rooms: 2, surface: 50,
    features: [], ...o }) as Tables<"properties">;

describe("lead matching", () => {
  it("derivă criteriile din proprietate", () => {
    const c = criteriaFromProperty(prop({ id: "s" }));
    expect(c).toMatchObject({ kind: "buy", budget_min: 85000, budget_max: 115000, cities: ["București"],
      areas: ["Sector 6"], rooms_min: 2, rooms_max: 2, surface_min: 42.5, features: [] });
    expect(criteriaFromProperty(prop({ transaction_kind: "rent" })).kind).toBe("rent");
  });
  it("Sector 6 ≡ Bucureşti Sectorul 6", () => {
    expect(normalizePlace("Bucureşti Sectorul 6")).toBe(normalizePlace("Sector 6"));
    expect(normalizePlace("București Sectorul 6")).toBe("sector 6");
    const c = criteriaFromProperty(prop({ city: "Bucureşti", district: "Sector 6" }));
    expect(scoreMatch(c, prop({ city: "București", district: "Bucureşti Sectorul 6" })).reasons).toContain("Zonă");
  });
  it("exclude proprietatea-sursă", () => {
    const s = prop({ id: "s" });
    expect(computeLeadMatches(s, [s, prop({ id: "a" })]).map((r) => r.property.id)).toEqual(["a"]);
  });
  it("lead de închiriere nu primește vânzări", () => {
    const s = prop({ id: "s", transaction_kind: "rent", price: 500 });
    expect(computeLeadMatches(s, [prop({ id: "a", price: 500 }), prop({ id: "b", transaction_kind: "rent", price: 500 })])
      .map((r) => r.property.id)).toEqual(["b"]);
  });
  it("garsoniera ↔ apartament cu 1 cameră compatibile", () => {
    const s = prop({ id: "s", property_type: "studio", rooms: 1 });
    expect(computeLeadMatches(s, [prop({ id: "a", rooms: 1 }), prop({ id: "h", property_type: "house", rooms: 1 })])
      .map((r) => r.property.id)).toEqual(["a"]);
  });
});

import { buildLeadMatchRows, filterLeadRows } from "./lead-matching";
const lead = (o: Partial<Tables<"leads">>) =>
  ({ id: "l", name: "Ana", phone: null, email: null, property_id: "s", deleted_at: null, stage: "new", assigned_to: "u1", ...o }) as Tables<"leads">;

describe("lead rows pe pagina Matching", () => {
  const s1 = prop({ id: "s" });
  const s2 = prop({ id: "s2", price: 130000 });
  const a = prop({ id: "a", price: 100000, assigned_to: "u9", city: "Cluj" } as never);
  const src = new Map([["s", s1], ["s2", s2]]);
  it("aceeași persoană apare o singură dată pe proprietate, cu scorul maxim", () => {
    const rows = buildLeadMatchRows(
      [lead({ id: "l1", phone: "+40 731 111 222" }), lead({ id: "l2", phone: "0731111222", property_id: "s2" })],
      src, [a]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lead.id).toBe("l1");
  });
  it("exclude proprietatea-sursă și lead-urile won/lost/șterse", () => {
    const rows = buildLeadMatchRows(
      [lead({ id: "l1" }), lead({ id: "l3", stage: "won", phone: "1234567" }), lead({ id: "l4", deleted_at: "x", email: "z@z" })],
      src, [s1, a]);
    expect(rows.map((r) => `${r.lead.id}:${r.property.id}`)).toEqual(["l1:a"]);
  });
  it("filtrele (agent = assigned_to lead, oraș, căutare, doar ale mele)", () => {
    const rows = buildLeadMatchRows([lead({ id: "l1" })], src, [a]);
    const base = { minScore: 60, agent: "all", city: "all", type: "all", onlyMineUserId: null, search: "" };
    expect(filterLeadRows(rows, { ...base, agent: "u1" })).toHaveLength(1);
    expect(filterLeadRows(rows, { ...base, agent: "u2" })).toHaveLength(0);
    expect(filterLeadRows(rows, { ...base, city: "Iași" })).toHaveLength(0);
    expect(filterLeadRows(rows, { ...base, search: "ana" })).toHaveLength(1);
    expect(filterLeadRows(rows, { ...base, onlyMineUserId: "u2" })).toHaveLength(0);
    expect(filterLeadRows(rows, { ...base, minScore: 101 })).toHaveLength(0);
  });
});

import { countLeadMatchesForProperty } from "./lead-matching";
describe("notificare după salvarea proprietății", () => {
  const target = prop({ id: "t" });
  const src = new Map([["s", prop({ id: "s" })], ["t", target]]);
  it("numără lead-urile compatibile de pe alte proprietăți", () => {
    expect(countLeadMatchesForProperty(target, [lead({ id: "l1", phone: "0711111111" }), lead({ id: "l2", phone: "0722222222" })], src)).toBe(2);
  });
  it("exclude lead-urile intrate chiar pe proprietate", () => {
    expect(countLeadMatchesForProperty(target, [lead({ id: "l1", property_id: "t" })], src)).toBe(0);
  });
  it("0 când nu se potrivește (altă tranzacție)", () => {
    expect(countLeadMatchesForProperty(prop({ id: "t", transaction_kind: "rent" }), [lead({ id: "l1" })], src)).toBe(0);
  });
});

describe("limite obligatorii pentru lead-uri", () => {
  const s = prop({ id: "s", property_type: "studio", rooms: 1, price: 45500, surface: 30 });
  const ids = (c: Tables<"properties">[]) => computeLeadMatches(s, c).map((r) => r.property.id);
  it("nu apare 3 camere la 118.000 €", () => expect(ids([prop({ id: "a", rooms: 3, price: 118000 })])).toEqual([]));
  it("nu apare 2 camere la 60.000 €", () => expect(ids([prop({ id: "b", rooms: 2, price: 60000 })])).toEqual([]));
  it("apare garsoniera de 56.000 € (aproape de limită)", () => {
    const r = computeLeadMatches(s, [prop({ id: "c", property_type: "studio", rooms: 1, price: 56000, surface: 30 })]);
    expect(r.map((x) => x.property.id)).toEqual(["c"]);
    expect(r[0]!.match.reasons).toContain("Buget aproape de limită");
  });
});
