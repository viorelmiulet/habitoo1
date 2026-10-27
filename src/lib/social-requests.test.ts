import { describe, expect, it } from "vitest";
import { buildSocialRequestRow, matchRequestProperty, socialRequestsBodySchema } from "./social-requests";

const req = { transaction_type: "cumparare", property_type: "Apartament", rooms: 2, budget_min: null, budget_max: 90000, currency: "EUR", county: "București", city: "București", zones: ["Militari"] };
const prop = { transaction_kind: "sale" as const, property_type: "apartment", rooms: 2, price: 95000, currency: "EUR", county: "București", city: "București", district: "Militari" };

describe("cereri Facebook", () => {
  it("acceptă între 1 și 500 de cereri pe apel", () => {
    expect(socialRequestsBodySchema.safeParse({ requests: [] }).success).toBe(false);
    const one = { source: "facebook", external_id: "x" };
    expect(socialRequestsBodySchema.safeParse({ requests: Array(500).fill(one) }).success).toBe(true);
    expect(socialRequestsBodySchema.safeParse({ requests: Array(501).fill(one) }).success).toBe(false);
  });
  it("numerele tolerante: „90.000 €” și text fără cifre", () => {
    const row = buildSocialRequestRow({ source: "facebook", external_id: "1", budget_max: "90000 €", rooms: "2 camere", budget_min: "fără" });
    expect(row.budget_max).toBe(90000);
    expect(row.rooms).toBe(2);
    expect(row.budget_min).toBeNull();
  });
  it("textul se taie la 5000 de caractere", () => {
    expect((buildSocialRequestRow({ source: "facebook", external_id: "1", text: "a".repeat(6000) }).text as string).length).toBe(5000);
  });
  it("bugetul acceptă ±10%", () => {
    expect(matchRequestProperty(req, { ...prop, price: 99000 })).not.toBeNull();
    expect(matchRequestProperty(req, { ...prop, price: 99001 })).toBeNull();
  });
  it("tranzacția, camerele și zona trebuie să se potrivească", () => {
    expect(matchRequestProperty(req, { ...prop, transaction_kind: "rent" })).toBeNull();
    expect(matchRequestProperty(req, { ...prop, rooms: 3 })).toBeNull();
    expect(matchRequestProperty(req, { ...prop, district: "Drumul Taberei" })).toBeNull();
    expect(matchRequestProperty(req, prop)?.score).toBe(100);
  });
  it("oricare dintre zonele multiple se potrivește", () => {
    expect(matchRequestProperty({ ...req, zones: ["Drumul Taberei", "Militari"] }, prop)).not.toBeNull();
  });
});
