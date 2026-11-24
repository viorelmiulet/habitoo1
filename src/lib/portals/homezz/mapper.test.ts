import { describe, expect, it } from "vitest";
import { homezzFee, homezzFloor, mapPropertyToHomezz, type HomezzMapContext } from "./mapper";

const ctx: HomezzMapContext = {
  location: { ok: true, cityId: 9812, areaId: 5, areaSource: "name" },
  agent: { name: "Ana Pop", phone: "+40 722 111 222" },
};
const DESC = "Apartament luminos, aproape de metrou, renovat recent, cu vedere deschisă.";
const base = {
  id: "11111111-1111-1111-1111-111111111111", title: "Apartament 2 camere Militari", description: DESC,
  for_sale: true, for_rent: false, sale_price: 100000.4, sale_currency: "EUR", currency: "EUR",
  lat: 44.43, lng: 26.1, location_precise: true, negotiable: true, vat_included: false, build_year: 2010,
};
const apt = { ...base, property_type: "apartment", usable_surface: 55, comfort: "1", floor_label: "Etaj 2", floor: 2,
  building_type: "Bloc", finish_state: "Bună", construction_stage: "Finalizată", rooms: 2, layout: "Decomandat", bathrooms: 1 };

const ok = (p: object, c = ctx) => {
  const r = mapPropertyToHomezz(p as never, c);
  if (!r.ok) throw new Error(r.reasons.join(" | "));
  return r;
};
const reasons = (p: object) => {
  const r = mapPropertyToHomezz(p as never, ctx);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.reasons;
};

describe("mapPropertyToHomezz", () => {
  it("apartament valid", () => {
    const { ads } = ok(apt);
    expect(ads).toHaveLength(1);
    expect(ads[0]!.params).toMatchObject({ category: 1, transaction_type: 1, price: 100000, city_id: 9812, area: 5,
      comfort: 1, real_estate_floor: 4, real_estate_year: 2010, type: 1, real_estate_state: 2, rooms: 2,
      real_estate_subdivision: 1, bathrooms: 1, real_estate_dimensions: 55, map_marker: 1, negotiable: 1, terms: 1,
      owner_name: "Ana Pop", owner_phone: "40722111222" });
    expect(ads[0]!.params).not.toHaveProperty("currency");
    expect(ads[0]!.params).not.toHaveProperty("token");
    expect(ads[0]!.params).not.toHaveProperty("images");
  });
  it("garsonieră validă, fără rooms/subdivision", () => {
    const p = ok({ ...apt, property_type: "studio", layout: null, rooms: null }).ads[0]!.params;
    expect(p.category).toBe(2);
    expect(p).not.toHaveProperty("rooms");
  });
  it("casă validă", () => {
    const p = ok({ ...base, property_type: "house", rooms: 4, usable_surface: 120, land_surface: 400, finish_state: "Renovat",
      utilities: ["Curent", "Apă", "Gaz"], has_basement: true, has_semi_basement: false }).ads[0]!.params;
    expect(p).toMatchObject({ category: 3, rooms: 4, terrain_size: 400, real_estate_state: 4, utilities: [1, 2, 4], basement: 1, semi_basement: 0 });
  });
  it("teren valid", () => {
    const p = ok({ ...base, property_type: "land", land_surface: 1000, destination: "Construibil", land_classification: "Intravilan",
      utilities: ["Curent", "Clima"] }).ads[0]!.params;
    expect(p).toMatchObject({ category: 4, terrain_size: 1000, terrain_type: 1, terrain_type2: 1, utilities: [1] });
  });
  it("birouri valide", () => {
    const p = ok({ ...base, property_type: "office", usable_surface: 200, total_usable_surface: 250, building_type: "Clădire de birouri",
      construction_stage: "Finalizată" }).ads[0]!.params;
    expect(p).toMatchObject({ category: 6, total_terrain_size: 250, type: 3, building_state: 1 });
  });
  it("spațiu comercial valid", () => {
    const p = ok({ ...base, property_type: "commercial", usable_surface: 80, building_type: "Spațiu stradal", construction_stage: "Finalizată", commission: "3%" }).ads[0]!.params;
    expect(p).toMatchObject({ category: 7, type: 5, building_state: 1, fee: 3 });
  });
  it("spațiu industrial: office_size lipsește mereu → blocat cu motiv; restul mapat", () => {
    const r = reasons({ ...base, property_type: "industrial", usable_surface: 800, built_surface: 1000, destination: "Depozitare",
      construction_stage: "Finalizată", building_structure: "Metal" });
    expect(r).toEqual(["Completează suprafața de birouri pentru HomeZZ."]);
  });
  it("hotel valid", () => {
    const p = ok({ ...base, property_type: "hotel", usable_surface: 900, construction_stage: "În construcție", rooms: 20 }).ads[0]!.params;
    expect(p).toMatchObject({ category: 9, building_state: 3, nr_rooms: 20 });
  });
  it("tip fără corespondent → blocat", () => {
    expect(reasons({ ...base, property_type: "parking" })[0]).toMatch(/nu are corespondent/);
  });
  it("vânzare + închiriere → două anunțuri, fiecare cu prețul/moneda ei; lei → currency=ron", () => {
    const { ads } = ok({ ...apt, for_rent: true, rent_price: 2500, rent_currency: "RON" });
    expect(ads.map((a) => [a.transaction, a.params.transaction_type, a.params.price, a.params.currency]))
      .toEqual([["sale", 1, 100000, undefined], ["rent", 2, 2500, "ron"]]);
  });
  it("altă monedă → blocat", () => {
    expect(reasons({ ...apt, sale_currency: "USD" })[0]).toMatch(/doar EUR sau RON/);
  });
  it("titlu peste 60 → scurtat la cuvânt întreg, cu avertisment", () => {
    const title = "Apartament superb cu doua camere si balcon mare in zona Militari Residence";
    const r = ok({ ...apt, title });
    const t = r.ads[0]!.params.title as string;
    expect(t.length).toBeLessThanOrEqual(60);
    expect(title.startsWith(t + " ")).toBe(true);
    expect(r.warnings.some((w) => w.includes("scurtat"))).toBe(true);
  });
  it("descriere sub 30 → blocat; peste 5000 → scurtată", () => {
    expect(reasons({ ...apt, description: "scurt" })[0]).toMatch(/30 de caractere/);
    const r = ok({ ...apt, description: "cuvant ".repeat(1000) });
    expect((r.ads[0]!.params.description as string).length).toBeLessThanOrEqual(5000);
  });
  it.each([
    ["usable_surface", /suprafața utilă/], ["comfort", /confortul/], ["floor_label", /etajul/], ["build_year", /anul construcției/],
    ["building_type", /tipul clădirii/], ["finish_state", /Starea imobilului/], ["rooms", /camere/], ["layout", /compartimentarea/],
  ])("apartament fără %s → blocat", (field, re) => {
    const p: Record<string, unknown> = { ...apt, [field]: null };
    if (field === "floor_label") p.floor = null;
    expect(reasons(p).join(" ")).toMatch(re);
  });
  it.each([["rooms", /camere/], ["usable_surface", /suprafața utilă/], ["land_surface", /terenului/], ["build_year", /anul/], ["finish_state", /Starea/]])(
    "casă fără %s → blocat", (field, re) => {
      const p = { ...base, property_type: "house", rooms: 4, usable_surface: 120, land_surface: 400, finish_state: "Bună", [field]: null };
      expect(reasons(p).join(" ")).toMatch(re);
    });
  it.each([["land_surface", /terenului/], ["destination", /tipul terenului/], ["land_classification", /clasificarea/]])(
    "teren fără %s → blocat", (field, re) => {
      const p = { ...base, property_type: "land", land_surface: 1000, destination: "Agricol", land_classification: "Extravilan", [field]: null };
      expect(reasons(p).join(" ")).toMatch(re);
    });
  it.each([["usable_surface", /suprafața utilă/], ["total_usable_surface", /suprafața totală/], ["build_year", /anul/], ["building_type", /tipul clădirii/], ["construction_stage", /stadiul/]])(
    "birouri fără %s → blocat", (field, re) => {
      const p = { ...base, property_type: "office", usable_surface: 200, total_usable_surface: 250, building_type: "Bloc", construction_stage: "Finalizată", [field]: null };
      expect(reasons(p).join(" ")).toMatch(re);
    });
  it.each([["building_type", /spațiului comercial/], ["construction_stage", /stadiul/]])("spațiu comercial fără %s → blocat", (field, re) => {
    const p = { ...base, property_type: "commercial", usable_surface: 80, building_type: "Mall", construction_stage: "Finalizată", [field]: null };
    expect(reasons(p).join(" ")).toMatch(re);
  });
  it("industrial fără destinație și suprafață totală → blocat", () => {
    const r = reasons({ ...base, property_type: "industrial", usable_surface: 800, construction_stage: "Finalizată" }).join(" ");
    expect(r).toMatch(/destinația/);
    expect(r).toMatch(/suprafața totală/);
  });
  it("hotel fără stadiu → blocat", () => {
    expect(reasons({ ...base, property_type: "hotel", usable_surface: 900 }).join(" ")).toMatch(/stadiul/);
  });
  it("locație nerezolvată → motivul ei", () => {
    const r = mapPropertyToHomezz(apt as never, { ...ctx, location: { ok: false, reason: "Localitatea nu există." } });
    expect(r.ok ? [] : r.reasons).toContain("Localitatea nu există.");
  });
  it("„În construcție” are prioritate față de finisaje", () => {
    expect(ok({ ...apt, construction_stage: "În construcție", finish_state: "Bună" }).ads[0]!.params.real_estate_state).toBe(6);
  });
  it("an în afara intervalului → blocat", () => {
    expect(reasons({ ...apt, build_year: 1600 })[0]).toMatch(/1700–2030/);
    expect(reasons({ ...apt, build_year: 2031 })[0]).toMatch(/1700–2030/);
  });
  it("locație aproximativă → map_marker=2 cu raza 1000", () => {
    const p = ok({ ...apt, location_precise: false }).ads[0]!.params;
    expect(p).toMatchObject({ map_marker: 2, map_radius: 1000 });
  });
});

describe("homezzFloor", () => {
  it.each([["Demisol", null, 1], ["Parter", 0, 2], ["Etaj 1", 1, 3], ["Etaj 12", 12, 14], ["Etaj 13", 13, 100], ["Mansardă", null, 101], ["Etaj 10+", 15, 100], ["Etaj 10+", null, null]])(
    "%s / %s → %s", (label, floor, out) => expect(homezzFloor(label, floor)).toBe(out));
});

describe("homezzFee", () => {
  it("valori din listă", () => {
    expect(homezzFee("0", 1)).toBe(101);
    expect(homezzFee("2,5%", 1)).toBe(105);
    expect(homezzFee("6", 1)).toBe(102);
    expect(homezzFee("50", 1)).toBe(108);
    expect(homezzFee("100%", 1)).toBe(109);
    expect(homezzFee("7", 7)).toBe(7);
    expect(homezzFee("12", 7)).toBe(102);
  });
  it("comision care nu e în listă → omis", () => {
    expect(homezzFee("2.7", 1)).toBeNull();
    expect(homezzFee("1.5", 7)).toBeNull();
    expect(homezzFee("o chirie", 1)).toBeNull();
    expect(ok({ ...apt, commission: "2.7%" }).ads[0]!.params).not.toHaveProperty("fee");
  });
});

describe("cuvinte nepermise în titlu", () => {
  it("doar avertisment cu lista", () => {
    const r = ok({ ...apt, title: "Vând URGENT apartament ofertă 2 camere" });
    expect(r.warnings.find((w) => w.includes("nepermise"))).toContain("vand, oferta, urgent");
  });
});
