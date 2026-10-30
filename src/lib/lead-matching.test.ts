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
