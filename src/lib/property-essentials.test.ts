import { describe, expect, it } from "vitest";
import { AMENITY_FIELDS, ESSENTIALS_COLUMNS, missingEssentials } from "./property-essentials";
import { propertyFeatureSections } from "@/components/app/PropertyFeatureSections";

const base = { floor: 2, usable_surface: 70, rooms: 3, property_type: "apartment", features: [] as string[] };

describe("fișă incompletă", () => {
  for (const f of AMENITY_FIELDS) {
    it(`dotările nu lipsesc cu ${f} completat`, () => {
      expect(missingEssentials({ ...base, [f]: f === "furnishing" ? "Mobilat" : ["x"] })).toEqual([]);
    });
  }
  it("toate cele zece goale → lipsesc dotările", () => {
    expect(missingEssentials({ ...base, furnishing: null, views: [] })).toEqual(["dotările"]);
  });
  it("teren fără camere, cu suprafața terenului → nimic", () => {
    expect(missingEssentials({ property_type: "land", land_surface: 500, rooms: null, floor: null, usable_surface: null, features: ["x"] })).toEqual([]);
    expect(missingEssentials({ property_type: "land", usable_surface: 500, features: ["x"] })).toEqual(["suprafața"]);
  });
  it("numele lipsurilor", () => {
    expect(missingEssentials({ property_type: "apartment" })).toEqual(["etajul", "suprafața", "camerele", "dotările"]);
  });
  it("paritate cu secțiunea „Dotări”", () => {
    const s = propertyFeatureSections.find((x) => x.title === "Dotări")!;
    expect([...AMENITY_FIELDS]).toEqual(s.groups.map((g) => g.field));
    for (const f of AMENITY_FIELDS) expect(ESSENTIALS_COLUMNS.split(",")).toContain(f);
  });
});
