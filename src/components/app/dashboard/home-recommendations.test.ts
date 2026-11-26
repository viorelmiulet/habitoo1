import { describe, expect, it } from "vitest";
import { buildRecommendations, isAllCapsTitle, type RecProperty } from "./home-recommendations";

const full: RecProperty = { id: "p1", title: "Apartament 3 camere Militari", ref: "RF-1024", missing: [] };

describe("CR2 — recomandări deterministe pe Acasă", () => {
  it("potriviri noi → Vezi potrivirile, pentru proprietatea cu cele mai multe", () => {
    const r = buildRecommendations({ properties: [full], matches: [{ propertyId: "p1", propertyTitle: null }, { propertyId: "p1", propertyTitle: null }, { propertyId: "p2", propertyTitle: "X" }] });
    expect(r[0]).toMatchObject({ kind: "matches", propertyId: "p1", count: 2, action: "Vezi potrivirile" });
    expect(r[0]!.title).toContain("RF-1024");
  });
  it("fișă incompletă (etaj, suprafață, camere, dotări) → Completează cu AI", () => {
    const r = buildRecommendations({ properties: [full, { ...full, id: "p3", missing: ["etajul", "dotările"] }, { ...full, id: "p4", missing: ["camerele"] }], matches: [] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "incomplete", propertyId: "p3", count: 2, action: "Completează cu AI" });
    expect(r[0]!.text).toContain("etajul, dotările");
  });
  it("titlu doar cu majuscule → Corectează", () => {
    expect(isAllCapsTitle("APARTAMENT 2 CAMERE DRISTOR")).toBe(true);
    expect(isAllCapsTitle("Apartament 2 camere Dristor")).toBe(false);
    const r = buildRecommendations({ properties: [full, { ...full, id: "p5", title: "GARSONIERA TITAN", ref: "RF-0981" }], matches: [] });
    expect(r[0]).toMatchObject({ kind: "caps", propertyId: "p5", action: "Corectează" });
  });
  it("fără probleme → nicio recomandare; maximum 3", () => {
    expect(buildRecommendations({ properties: [full], matches: [] })).toEqual([]);
    const r = buildRecommendations({ properties: [{ ...full, title: "CASA MARE", missing: ["camerele"] }], matches: [{ propertyId: "p1", propertyTitle: null }] });
    expect(r.map((x) => x.kind)).toEqual(["matches", "incomplete", "caps"]);
  });
});
