import { describe, expect, it } from "vitest";
import { resolveHomezzLocation, type HomezzArea, type HomezzCity } from "./location";

const cities: HomezzCity[] = [
  { id: 9812, name: "Bucuresti", county_code: "IF", lat: 44.4268, lng: 26.1025 },
  { id: 100, name: "Târgu Mureș", county_code: "MS", lat: 46.54, lng: 24.56 },
  { id: 200, name: "Cluj-Napoca", county_code: "CJ", lat: 46.77, lng: 23.59 },
  { id: 300, name: "Valea", county_code: "AG", lat: null, lng: null },
  { id: 301, name: "Valea", county_code: "AG", lat: null, lng: null },
];
const areas: HomezzArea[] = [{ id: 5001, name: "Militari", city_id: 9812 }];

describe("resolveHomezzLocation", () => {
  it("matches diacritics in both forms", () => {
    for (const city of ["Târgu Mureş", "Targu-Mures", "TÂRGU  MUREȘ"]) {
      const r = resolveHomezzLocation({ county: "Mureș", city, lat: 46.54, lng: 24.56 }, cities, []);
      expect(r).toMatchObject({ ok: true, cityId: 100 });
    }
    expect(resolveHomezzLocation({ county: "Mureş", city: "Tirgu Mures" }, cities, []).ok).toBe(false);
  });
  it("maps all Bucharest forms to 9812", () => {
    for (const city of ["Bucureşti", "Sector 6", "Bucureşti Sectorul 6"]) {
      const r = resolveHomezzLocation({ county: "București", city, district: "Militari" }, cities, areas);
      expect(r).toEqual({ ok: true, cityId: 9812, areaId: 5001, areaSource: "name" });
    }
  });
  it("blocks missing and duplicate localities", () => {
    expect(resolveHomezzLocation({ county: "Cluj", city: "Florești" }, cities, [])).toMatchObject({ ok: false });
    const d = resolveHomezzLocation({ county: "Argeș", city: "Valea" }, cities, []);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toMatch(/mai multe ori/);
  });
  it("computes direction and Central", () => {
    const c = { lat: 46.77, lng: 23.59 };
    const d = 0.02;
    const cases: [number, number, number][] = [
      [d, 0, 3], [d, d, 4], [0, d, 2], [-d, d, 8], [-d, 0, 7], [-d, -d, 9], [0, -d, 11], [d, -d, 5], [0.001, 0.001, 1],
    ];
    for (const [dl, dn, id] of cases) {
      const r = resolveHomezzLocation({ county: "Cluj", city: "Cluj-Napoca", lat: c.lat + dl, lng: c.lng + dn }, cities, []);
      expect(r).toEqual({ ok: true, cityId: 200, areaId: id, areaSource: "direction" });
    }
  });
  it("blocks without district or coordinates", () => {
    const r = resolveHomezzLocation({ county: "Cluj", city: "Cluj-Napoca" }, cities, []);
    expect(r).toEqual({ ok: false, reason: "HomeZZ cere o zonă; completează cartierul sau poziția pe hartă." });
  });
});
