import { describe, expect, it } from "vitest";
import { classifyDemand, countDemand, demandInterestScore, type DemandProperty, type DemandRequest } from "./demand";
import { loadReportDemand } from "./demand.server";

const prop: DemandProperty = {
  transaction: "sale", propertyType: "apartment", rooms: 2, usableArea: 55, price: 80_000, currency: "EUR",
  county: "București", city: "Sector 6", district: "Militari",
};
const req = (o: Partial<DemandRequest> = {}): DemandRequest => ({
  transaction: "sale", propertyType: "Apartament", roomsMin: 2, roomsMax: 3, surfaceMin: 50, budgetMin: 70_000,
  budgetMax: 85_000, currency: "EUR", county: null, cities: ["Sector 6"], zones: ["Militari"], ...o,
});

describe("scor interes", () => {
  it("formula și etichetele", () => {
    expect(demandInterestScore(0, 0)).toBeNull();
    expect(demandInterestScore(2, 2)).toEqual({ score: 3, label: "Scăzut" });
    expect(demandInterestScore(3, 3)).toEqual({ score: 5, label: "Mediu" }); // 4.5 → 5
    expect(demandInterestScore(6, 2)).toEqual({ score: 7, label: "Ridicat" });
    expect(demandInterestScore(9, 10)).toEqual({ score: 10, label: "Ridicat" });
  });
});

describe("potrivire exactă vs flexibilă", () => {
  it("exactă când toate criteriile se potrivesc", () => expect(classifyDemand(req(), prop)).toBe("exact"));
  it("flexibilă: preț ≤ +20% peste buget", () => expect(classifyDemand(req({ budgetMax: 70_000, budgetMin: 60_000 }), prop)).toBe("flexible"));
  it("nimic peste +20%", () => expect(classifyDemand(req({ budgetMax: 65_000, budgetMin: 60_000 }), prop)).toBeNull());
  it("flexibilă: suprafață −15%, camere ±1", () => {
    expect(classifyDemand(req({ surfaceMin: 62 }), prop)).toBe("flexible");
    expect(classifyDemand(req({ surfaceMin: 70 }), prop)).toBeNull();
    expect(classifyDemand(req({ roomsMin: 3, roomsMax: 3 }), prop)).toBe("flexible");
    expect(classifyDemand(req({ roomsMin: 4, roomsMax: 4 }), prop)).toBeNull();
  });
  it("zona contează doar la exactă; localitatea la ambele", () => {
    expect(classifyDemand(req({ zones: ["Berceni"] }), prop)).toBe("flexible");
    expect(classifyDemand(req({ cities: ["Cluj-Napoca"], zones: [] }), prop)).toBeNull();
  });
  it("tranzacția și tipul sunt obligatorii", () => {
    expect(classifyDemand(req({ transaction: "rent" }), prop)).toBeNull();
    expect(classifyDemand(req({ propertyType: "Casă" }), prop)).toBeNull();
  });
});

describe("numărare", () => {
  it("aceeași cerere numărată o singură dată, exacta are prioritate", () => {
    const d = countDemand(prop, [
      { id: "r1", source: "own", request: req() },
      { id: "r1", source: "own", request: req() },
      { id: "r2", source: "own", request: req({ zones: ["Berceni"] }) },
    ], "2026-10-28T00:00:00Z");
    expect(d.exact).toEqual({ own: 1, network: 0, facebook: 0, total: 1 });
    expect(d.flexible).toEqual({ own: 1, network: 0, facebook: 0, total: 1 });
    expect(d.score).toBe(2);
  });
  it("nicio cerere → fără scor", () => {
    const d = countDemand(prop, [], "x");
    expect(d.score).toBeNull();
    expect(d.scoreLabel).toBeNull();
  });
});

/** Fals client: aplică filtrele eq/neq/in/gte/or ca în baza de date. */
function fakeAdmin(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(name: string) {
      let rows = [...(tables[name] ?? [])];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q),
        in: (c: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[c]))), q),
        gte: (c: string, v: string) => ((rows = rows.filter((r) => String(r[c]) >= v)), q),
        or: () => ((rows = rows.filter((r) => r.publisher_type !== "agentie")), q),
        order: () => q,
        range: (a: number, b: number) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
        then: (res: (v: unknown) => void) => res({ data: rows, error: null }),
      };
      return q;
    },
  };
}

const crm = (id: string, org: string, o: Record<string, unknown> = {}) => ({
  id, organization_id: org, status: "active", kind: "buy", property_type: "apartment", rooms_min: 2, rooms_max: 2,
  surface_min: 50, budget_min: 70_000, budget_max: 85_000, currency: "EUR", cities: ["Sector 6"], areas: ["Militari"],
  notes: "Ion Pop 0722", ...o,
});

describe("loadReportDemand", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const admin = fakeAdmin({
    organizations: [{ id: "own", collaboration_enabled: true }, { id: "p1", collaboration_enabled: true }, { id: "x1", collaboration_enabled: false }],
    requests: [
      crm("a", "own"), crm("b", "own", { status: "closed" }),
      crm("c", "p1"), crm("d", "p1", { areas: ["Berceni"] }),
      crm("e", "x1"),
    ],
    social_requests: [
      { id: "s1", transaction_type: "cumparare", property_type: "Apartament", rooms: 2, budget_min: null, budget_max: 82_000, currency: "EUR", county: "București", city: "Sector 6", zones: ["Militari"], publisher_type: "particular", first_seen_at: "2026-10-20T00:00:00Z" },
      { id: "s2", transaction_type: "cumparare", property_type: "Apartament", rooms: 2, budget_min: null, budget_max: 82_000, currency: "EUR", county: "București", city: "Sector 6", zones: [], publisher_type: "particular", first_seen_at: "2026-08-01T00:00:00Z" },
      { id: "s3", transaction_type: "cumparare", property_type: "Apartament", rooms: 2, budget_min: null, budget_max: 82_000, currency: "EUR", county: "București", city: "Sector 6", zones: [], publisher_type: "agentie", first_seen_at: "2026-10-20T00:00:00Z" },
    ],
  });

  it("ignoră inactive/vechi/agenții Facebook, numără rețeaua doar dacă participă și întoarce doar numere", async () => {
    const d = await loadReportDemand(admin, "own", prop, now);
    expect(d.exact).toEqual({ own: 1, network: 1, facebook: 1, total: 3 });
    expect(d.flexible).toEqual({ own: 0, network: 1, facebook: 0, total: 1 });
    expect(d.score).toBe(4);
    expect(d.scoreLabel).toBe("Mediu");
    const json = JSON.stringify(d);
    for (const leak of ["p1", "x1", "Ion", "0722", "70000", "85000"]) expect(json).not.toContain(leak);
    expect(Object.keys(d).sort()).toEqual(["asOf", "exact", "flexible", "score", "scoreLabel"]);
  });
});
