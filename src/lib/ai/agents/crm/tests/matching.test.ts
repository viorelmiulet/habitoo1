import { describe, expect, it } from "vitest";
import { matchRequestToProperties, type MatchPropertyInput } from "../matching";

const request = {
  id: "req-1",
  title: "Apartament 2 camere Militari",
  kind: "buy" as const,
  budget_min: 60_000,
  budget_max: 100_000,
  cities: ["bucurești"],
  areas: ["militari"],
  rooms_min: 2,
  rooms_max: 2,
  surface_min: 50,
  features: ["balcon"],
  property_type: "apartment",
};

function property(overrides: Partial<MatchPropertyInput> = {}): MatchPropertyInput {
  return {
    id: overrides.id ?? "prop-1",
    reference: overrides.reference ?? "HB-1",
    title: overrides.title ?? "Apartament 2 camere",
    transaction_kind: overrides.transaction_kind ?? "sale",
    price: overrides.price ?? 95_000,
    city: overrides.city ?? "București",
    district: overrides.district ?? "Militari",
    address: overrides.address ?? "Strada Test 1",
    rooms: overrides.rooms ?? 2,
    surface: overrides.surface ?? 55,
    features: overrides.features ?? ["balcon"],
    property_type: overrides.property_type ?? "apartment",
    status: overrides.status ?? "active",
  };
}

describe("matchRequestToProperties", () => {
  it("scorurile sunt reproductibile", () => {
    const first = matchRequestToProperties(request, [property()]);
    const second = matchRequestToProperties(request, [property()]);
    expect(first[0]?.score).toBe(second[0]?.score);
  });

  it("explică criteriile îndeplinite și diferențele", () => {
    const [match] = matchRequestToProperties(request, [property({ price: 120_000, surface: 40 })], {
      minScore: 0,
    });
    expect(match).toBeDefined();
    expect(match!.priceGap).toBe(20_000);
    expect(match!.surfaceGap).toBe(-10);
    expect(match!.missing.length).toBeGreaterThan(0);
  });

  it("elimină potrivirile sub scorul minim", () => {
    const matches = matchRequestToProperties(
      request,
      [property({ transaction_kind: "rent", city: "Cluj", rooms: 5, price: 500_000 })],
      { minScore: 70 },
    );
    expect(matches).toHaveLength(0);
  });

  it("ordonează descrescător și respectă limita", () => {
    const matches = matchRequestToProperties(
      request,
      [
        property({ id: "p1", price: 95_000 }),
        property({ id: "p2", price: 99_000, district: "Berceni" }),
        property({ id: "p3", price: 70_000 }),
      ],
      { minScore: 0, limit: 2 },
    );
    expect(matches).toHaveLength(2);
    expect(matches[0]!.score).toBeGreaterThanOrEqual(matches[1]!.score);
  });
});
