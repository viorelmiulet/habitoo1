import { describe, expect, it } from "vitest";
import { floorLabelOptions } from "@/lib/property-taxonomy";
import { FLOOR_LABEL_NUMBER, syncFloor, syncSurface } from "./property-floor";

describe("etichetă etaj → număr", () => {
  it("tratează explicit toate opțiunile din taxonomie", () => {
    expect(Object.keys(FLOOR_LABEL_NUMBER).sort()).toEqual([...floorLabelOptions].sort());
  });
  it("calculează numărul pentru etichetele fixe", () => {
    expect(syncFloor("Demisol", 7).floor).toBe(-1);
    expect(syncFloor("Parter", null).floor).toBe(0);
    expect(syncFloor("Parter înalt", 3).floor).toBe(0);
    for (let n = 1; n <= 9; n++) expect(syncFloor(`Etaj ${n}`, 99).floor).toBe(n);
  });
  it("păstrează numărul trimis pentru etichete fără număr fix", () => {
    for (const l of ["Etaj 10+", "Penultimul etaj", "Ultimul etaj", "Mansardă"]) {
      expect(syncFloor(l, 12).floor).toBe(12);
    }
  });
  it("completează eticheta din număr doar dacă există opțiunea", () => {
    expect(syncFloor(null, 1).floor_label).toBe("Etaj 1");
    expect(syncFloor("", -1).floor_label).toBe("Demisol");
    expect(syncFloor(null, 0).floor_label).toBe("Parter");
    expect(syncFloor(null, 12).floor_label).toBeNull();
    expect(syncFloor(null, -3).floor_label).toBeNull();
  });
});

describe("regula suprafeței", () => {
  const base = { usable_surface: null, built_surface: null, land_surface: null, surface: null };
  it("utilă → construită → teren", () => {
    expect(syncSurface({ ...base, usable_surface: 50, built_surface: 55, surface: 450 })).toBe(50);
    expect(syncSurface({ ...base, built_surface: 55, land_surface: 500 })).toBe(55);
    expect(syncSurface({ ...base, land_surface: 500 })).toBe(500);
  });
  it("păstrează surface doar când lipsesc toate celelalte", () => {
    expect(syncSurface({ ...base, surface: 50 })).toBe(50);
    expect(syncSurface(base)).toBeNull();
  });
});
