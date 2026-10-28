import { describe, expect, it } from "vitest";
import { matchRequestProperty, rankRequestMatches } from "./social-requests";

const base = { transaction_type: "cumparare", property_type: "Apartament", currency: "EUR", budget_min: null };
const mva = (o: Record<string, unknown>) => ({ transaction_kind: "sale" as const, property_type: "apartment", currency: "EUR", county: "București", city: "București", district: "Militari", title: "Apartament 2 camere", address: null, rooms: 2, price: 60000, ...o });

describe("cereri Facebook — zone înrudite", () => {
  it("subzonele Militari găsesc apartamentele din Militari", () => {
    const r = { ...base, rooms: 2, budget_max: 120000, county: "București", city: "București", zones: ["Lujerului", "Uverturii", "Gorjului", "Apusului", "Virtuții", "Lacul Morii", "Crângași"] };
    const res = rankRequestMatches(r, [mva({ price: 52000 }), mva({ price: 68000 })]);
    expect(res.kind).toBe("strict");
    expect(res.items).toHaveLength(2);
    expect(matchRequestProperty(r, mva({ district: "Giulești" }), "strict")).toBeNull();
    expect(matchRequestProperty(r, mva({ district: "Giulești" }), "close")?.kind).toBe("close");
  });
  it("Chiajna găsește garsonierele din Militari Residence trecute la Sector 6", () => {
    const r = { ...base, rooms: 1, budget_max: 55000, county: "Ilfov", city: "Chiajna", zones: [] };
    const g = mva({ rooms: 1, price: 43000, city: "București", district: "Militari", title: "Garsonieră Militari Residence" });
    const res = rankRequestMatches(r, [g, mva({ rooms: 1, price: 41000, address: "Militari Residence, Str. Tineretului" })]);
    expect(res.kind).toBe("strict");
    expect(res.items).toHaveLength(2);
    // Cererea pentru Militari le găsește doar ca zonă vecină.
    const m = { ...r, county: "București", city: "București", zones: ["Militari"] };
    expect(matchRequestProperty(m, g)).toBeNull();
    expect(matchRequestProperty(m, g, "close")?.differences[0]).toMatch(/vecin/);
  });
  it("apropiate: buget ±20% și camere ±1, ordonate după scor", () => {
    const r = { ...base, rooms: 2, budget_max: 50000, county: "București", city: "București", zones: ["Militari"] };
    const res = rankRequestMatches(r, [mva({ price: 59000 }), mva({ price: 50000, rooms: 3 }), mva({ price: 59000, rooms: 3 })]);
    expect(res.kind).toBe("close");
    expect(res.items).toHaveLength(3);
    expect(res.items[2].match.differences).toHaveLength(2);
  });
  it("o cerere fără nimic potrivit rămâne goală", () => {
    const r = { ...base, rooms: 4, budget_max: 30000, county: "București", city: "București", zones: ["Pipera"] };
    expect(rankRequestMatches(r, [mva({}), mva({ rooms: 1, price: 43000, title: "Militari Residence" })]).items).toHaveLength(0);
  });
});
