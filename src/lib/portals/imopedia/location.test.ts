import { describe, expect, it } from "vitest";
import { resolveImopediaLocation, type ImopediaAreaRow } from "./location";
import {
  ImopediaNomenclatureFormatError,
  parseImopediaAreas,
  parseImopediaRegions,
  planImopediaAreas,
  planImopediaRegions,
} from "./nomenclature";

// Noduri reale copiate din areas.json (28 oct 2026).
const AREAS: ImopediaAreaRow[] = [
  {"id": 1, "area": "Nord", "region_id": 1, "parent_id": 2, "depth": 1, "usable_in_api": false},
  {"id": 2, "area": "Judet: Bucuresti", "region_id": 1, "parent_id": null, "depth": 0, "usable_in_api": false},
  {"id": 5, "area": "Sud", "region_id": 1, "parent_id": 2, "depth": 1, "usable_in_api": false},
  {"id": 6, "area": "Rahova - Ferentari", "region_id": 1, "parent_id": 5, "depth": 2, "usable_in_api": false},
  {"id": 11, "area": "Vest", "region_id": 1, "parent_id": 2, "depth": 1, "usable_in_api": false},
  {"id": 19, "area": "Ilfov", "region_id": 1, "parent_id": 2, "depth": 1, "usable_in_api": false},
  {"id": 20, "area": "Ilfov Vest", "region_id": 1, "parent_id": 19, "depth": 2, "usable_in_api": false},
  {"id": 41, "area": "Primaverii - Aviatorilor", "region_id": 1, "parent_id": 1, "depth": 2, "usable_in_api": false},
  {"id": 119, "area": "Primaverii", "region_id": 1, "parent_id": 41, "depth": 3, "usable_in_api": true},
  {"id": 130, "area": "Militari", "region_id": 1, "parent_id": 11, "depth": 2, "usable_in_api": false},
  {"id": 147, "area": "Rahova", "region_id": 1, "parent_id": 6, "depth": 3, "usable_in_api": true},
  {"id": 171, "area": "Militari", "region_id": 1, "parent_id": 130, "depth": 3, "usable_in_api": true},
  {"id": 174, "area": "Rosu", "region_id": 1, "parent_id": 20, "depth": 3, "usable_in_api": true},
  {"id": 200, "area": "Chiajna", "region_id": 1, "parent_id": 20, "depth": 3, "usable_in_api": true},
  {"id": 221, "area": "Dudu", "region_id": 1, "parent_id": 20, "depth": 3, "usable_in_api": true},
  {"id": 3764, "area": "Judet: CLUJ", "region_id": 14, "parent_id": null, "depth": 0, "usable_in_api": false},
  {"id": 3765, "area": "ORASE/STATIUNI", "region_id": 14, "parent_id": 3764, "depth": 1, "usable_in_api": false},
  {"id": 3766, "area": "CLUJ-NAPOCA", "region_id": 14, "parent_id": 3765, "depth": 2, "usable_in_api": false}
];
const REGIONS = [
  { id: 1, name: "Bucuresti-Ilfov" },
  { id: 14, name: "Cluj" },
  { id: 7, name: "Bistrita Nasaud" },
];
const r = (county: string, city: string | null, neighborhood: string | null) =>
  resolveImopediaLocation({ county, city, neighborhood }, REGIONS, AREAS);

describe("resolveImopediaLocation", () => {
  it("București / Militari → 1 / 171 exact", () => {
    expect(r("București", "București", "Militari")).toMatchObject({ regionId: 1, zonaId: 171, status: "exact" });
  });
  it("Ilfov / Chiajna → 1 / 200 exact", () => {
    expect(r("Ilfov", "Chiajna", null)).toMatchObject({ regionId: 1, zonaId: 200, status: "exact", zonaText: "Chiajna" });
  });
  it("București / Primăverii (diacritice) → 1 / 119 exact", () => {
    expect(r("Municipiul București", "București", "Primăverii")).toMatchObject({ regionId: 1, zonaId: 119, status: "exact" });
  });
  it("Rahova–Ferentari este grupare, nu frunză → region_only", () => {
    expect(r("București", "București", "Rahova-Ferentari")).toMatchObject({ regionId: 1, zonaId: null, status: "region_only" });
  });
  it("Cluj / Cluj-Napoca fără cartier → 14 region_only", () => {
    expect(r("Cluj", "Cluj-Napoca", null)).toMatchObject({ regionId: 14, zonaId: null, status: "region_only", zonaText: "Cluj-Napoca" });
  });
  it("județ cu cratimă/diacritice se potrivește exact", () => {
    expect(r("Bistrița-Năsăud", "Bistrița", null).regionId).toBe(7);
  });
  it("județ inexistent → missing", () => {
    expect(r("Atlantida", "X", null)).toMatchObject({ regionId: null, status: "missing" });
  });
});

describe("import nomenclator Imopedia", () => {
  it("format invalid oprește importul", () => {
    expect(() => parseImopediaRegions({ id: 1 })).toThrow(ImopediaNomenclatureFormatError);
    expect(() => parseImopediaAreas([{ id: 1, area: "X" }])).toThrow(ImopediaNomenclatureFormatError);
  });
  it("este idempotent", () => {
    const areas = parseImopediaAreas(AREAS);
    const first = planImopediaAreas(areas, []);
    expect(first.counts.inserted).toBe(AREAS.length);
    const second = planImopediaAreas(areas, first.upserts);
    expect(second.counts).toMatchObject({ inserted: 0, updated: 0, unchanged: AREAS.length, disabled: 0 });
    expect(second.upserts).toHaveLength(0);
    const reg = planImopediaRegions(REGIONS, planImopediaRegions(REGIONS, []).upserts);
    expect(reg.counts.unchanged).toBe(3);
  });
  it("nodurile dispărute devin neutilizabile, nu se șterg", () => {
    const stored = planImopediaAreas(AREAS, []).upserts;
    const plan = planImopediaAreas(AREAS.filter((a) => a.id !== 171), stored);
    expect(plan.disableIds).toEqual([171]);
    expect(plan.counts.disabled).toBe(1);
  });
  it("id duplicat în fișier este respins", () => {
    expect(planImopediaAreas([AREAS[0], AREAS[0]], []).counts.rejected).toBe(1);
  });
});
