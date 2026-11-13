import { describe, expect, it } from "vitest";
import {
  mapImmofluxItem,
  NO_SECTOR_WARNING,
  type ImmofluxItem,
} from "../immoflux/mapper";

const ctx = { organizationId: "org-1", assignedTo: "user-1" };

function base(overrides: Partial<ImmofluxItem> = {}): ImmofluxItem {
  return {
    id: 4521,
    category_id: 1,
    subcategory_id: 101,
    transaction_id: 1,
    price: 120000,
    price_currency: 1,
    title: { ro: "  Apartament 3 camere\r\nMilitari  ", en: "Flat" },
    description: { ro: "Linia 1\r\nLinia 2" },
    rooms: 3,
    bathrooms: 2,
    floor: 30,
    building_levels: 10,
    surface_util_total: "72.50",
    surface_total: "85.00",
    built_year: 2010,
    partitioning: 1,
    latitude: "44.4268",
    longitude: "26.1025",
    exact_location: 1,
    address: " Bd. Iuliu Maniu ",
    address_nr: "12",
    address_building: "A3",
    address_scara: "2",
    address_app: "45",
    city: { name: "Bucuresti Sector 6" },
    zone: { name: "Militari" },
    eficienta_energetica: "B",
    balconies: 2,
    images: [
      { ordering: 2, src: "https://cdn.example.ro/b.jpg" },
      { ordering: 1, src: "https://cdn.example.ro/a.jpg" },
    ],
    ...overrides,
  };
}

describe("mapImmofluxItem", () => {
  it("vânzare apartament complet", () => {
    const r = mapImmofluxItem(base(), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      organization_id: "org-1",
      assigned_to: "user-1",
      source: "immoflux",
      external_id: "4521",
      status: "active",
      property_type: "apartment",
      title: "Apartament 3 camere\nMilitari",
      description: "Linia 1\nLinia 2",
      transaction_kind: "sale",
      for_sale: true,
      for_rent: false,
      price: 120000,
      currency: "EUR",
      sale_price: 120000,
      sale_currency: "EUR",
      rent_price: null,
      rent_currency: null,
      floor: 3,
      floor_label: "Etaj 3",
      building_floors: 10,
      layout: "Decomandat",
      location_precise: true,
      street: "Bd. Iuliu Maniu",
      street_number: "12",
      address_building: "A3",
      address_staircase: "2",
      address_apartment: "45",
      county: "Bucureşti",
      city: "Bucureşti Sectorul 6",
      county_siruta_code: 403,
      uat_siruta_code: 179132,
      locality_siruta_code: 179196,
      district: "Militari",
      energy_class: "B",
      balconies: 2,
    });
    expect(r.row).not.toHaveProperty("reference");
    expect(r.warnings).toEqual([]);
  });

  it("închiriere garsonieră", () => {
    const r = mapImmofluxItem(base({ transaction_id: 2, subcategory_id: 102, price: 350 }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      property_type: "studio",
      transaction_kind: "rent",
      for_sale: false,
      for_rent: true,
      price: 350,
      sale_price: null,
      rent_price: 350,
      rent_currency: "EUR",
    });
  });

  it("ciornă goală → sărită", () => {
    const r = mapImmofluxItem(base({ category_id: 0, title: { ro: "" }, city: null }), ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.skipped).toBe(true);
    expect(r.reasons).toHaveLength(3);
  });

  it("tranzacție, subcategorie sau monedă necunoscute → sărite cu motiv", () => {
    const r = mapImmofluxItem(base({ transaction_id: 5, category_id: 7, subcategory_id: 999, price_currency: 9 }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toHaveLength(3);
  });

  it.each([
    [2, -1, "Demisol"],
    [3, 0, "Parter"],
    [50, 5, "Etaj 5"],
    [1000, null, "Mansardă"],
    [100, null, "Mansardă"],
  ])("etaj cod %i → %i / %s", (code, floor, label) => {
    const r = mapImmofluxItem(base({ floor: code }), ctx);
    expect(r.ok && r.row.floor).toBe(floor);
    expect(r.ok && r.row.floor_label).toBe(label);
  });

  it("etaj necunoscut → gol + avertisment", () => {
    const r = mapImmofluxItem(base({ floor: 7 }), ctx);
    expect(r.ok && r.row.floor).toBeNull();
    expect(r.ok && r.warnings.some((w) => w.includes("Etaj"))).toBe(true);
  });

  it("suprafețe text → numere, 0/gol → null", () => {
    const r = mapImmofluxItem(base({ surface_util_total: "35.00", surface_total: "0" }), ctx);
    expect(r.ok && r.row.usable_surface).toBe(35);
    expect(r.ok && r.row.built_surface).toBeNull();
    const e = mapImmofluxItem(base({ surface_util_total: "" }), ctx);
    expect(e.ok && e.row.usable_surface).toBeNull();
  });

  it('coordonate "0" → null', () => {
    const r = mapImmofluxItem(base({ latitude: "0", longitude: "0", exact_location: 0 }), ctx);
    expect(r.ok && r.row.lat).toBeNull();
    expect(r.ok && r.row.lng).toBeNull();
    expect(r.ok && r.row.location_precise).toBe(false);
  });

  it('clasă energetică "" sau invalidă → null', () => {
    expect(mapImmofluxItem(base({ eficienta_energetica: "" }), ctx).ok && true).toBe(true);
    const r = mapImmofluxItem(base({ eficienta_energetica: "" }), ctx);
    expect(r.ok && r.row.energy_class).toBeNull();
    const x = mapImmofluxItem(base({ eficienta_energetica: "Z" }), ctx);
    expect(x.ok && x.row.energy_class).toBeNull();
  });

  it("București fără sector → avertisment", () => {
    const r = mapImmofluxItem(base({ city: { name: "București" }, zone: { name: "Titan" } }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.city).toBe("Bucureşti");
    expect(r.row.county).toBe("Bucureşti");
    expect(r.row.locality_siruta_code).toBeNull();
    expect(r.warnings).toContain(NO_SECTOR_WARNING);
  });

  it("poze sortate după ordering, doar https", () => {
    const r = mapImmofluxItem(
      base({
        images: [
          { ordering: 3, src: "https://x.ro/3.jpg" },
          { ordering: 1, src: "https://x.ro/1.jpg" },
          { ordering: 2, src: "http://x.ro/2.jpg" },
        ],
      }),
      ctx,
    );
    expect(r.ok && r.images).toEqual([
      { source_url: "https://x.ro/1.jpg", ordering: 1 },
      { source_url: "https://x.ro/3.jpg", ordering: 3 },
    ]);
  });
});

describe("immoflux casă și hală", () => {
  const ctx2 = { organizationId: "org", assignedTo: null };
  const item = (o: Record<string, unknown>) =>
    ({ id: 1, title: { ro: "T" }, city: { name: "Chiajna" }, transaction_id: 1, price: 295000, price_currency: 1, ...o }) as never;
  it("categoria 2 → house cu teren, fără etaj/compartimentare", () => {
    const r = mapImmofluxItem(item({ category_id: 2, subcategory_id: 201, land_size: "400.00", floor: 50, partitioning: 1 }), ctx2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.property_type).toBe("house");
      expect(r.row.land_surface).toBe(400);
      expect(r.row.floor).toBeNull();
      expect(r.row.layout).toBeNull();
    }
  });
  it("categoria 6 fără subcategorie → industrial", () => {
    const r = mapImmofluxItem(item({ category_id: 6, subcategory_id: 0, transaction_id: 2, price: 2500 }), ctx2);
    expect(r.ok && r.row.property_type).toBe("industrial");
  });
  it("categoria 7 (hotel) rămâne sărită", () => {
    const r = mapImmofluxItem(item({ category_id: 7, subcategory_id: 701 }), ctx2);
    expect(r.ok).toBe(false);
  });
});

import { IMMOFLUX_CODES } from "../immoflux/codes";
import * as taxonomy from "@/lib/property-taxonomy";

const OPTIONS: Record<string, readonly string[]> = {
  utilities: taxonomy.utilityOptions,
  heating_systems: taxonomy.heatingOptions,
  cooling_systems: taxonomy.coolingOptions,
  insulation: taxonomy.insulationOptions,
  wall_finishes: taxonomy.wallFinishOptions,
  floor_finishes: taxonomy.floorFinishOptions,
  windows: taxonomy.windowOptions,
  blinds: taxonomy.blindOptions,
  shutters: taxonomy.shutterOptions,
  entry_door: taxonomy.entryDoorOptions,
  interior_doors: taxonomy.interiorDoorOptions,
  additional_spaces: taxonomy.additionalSpaceOptions,
  kitchen_features: taxonomy.kitchenOptions,
  metering: taxonomy.meteringOptions,
  appliances: taxonomy.applianceOptions,
  building_amenities: taxonomy.buildingAmenityOptions,
  street_arrangement: taxonomy.streetArrangementOptions,
  views: taxonomy.viewOptions,
  misc_features: taxonomy.miscFeatureOptions,
  finish_state: taxonomy.finishStateOptions,
  furnishing: taxonomy.furnishingOptions,
};

// Elementul 158376 din exportul MRM.
const mrm158376: Partial<ImmofluxItem> = {
  id: 158376,
  utilities: ["10001", "10002", "10003", "10004", "10012", "10013", "10102", "10107"],
  finishes: ["20301", "20001", "20002", "20003", "20101", "20103", "20201", "20202", "20401", "20404", "20701"],
  equipment: ["30301", "30105", "30106", "30201", "30203", "30204", "30205", "30401", "30402", "30421", "30403"],
  zone_extra: ["50001", "50004", "50005", "50006", "90001", "90005"],
  confort: 1,
  partitioning: 1,
  building_type: 1,
  building_structure: 6,
  built_stage: 4,
  built_year: 2026,
  destination_id: 1,
  exclusivity: 1,
  parking: 1,
  key_in_agency: 1,
  bedrooms: 1,
  kitchens: 1,
  surface_size: "33.00",
};

describe("IMMOFLUX – câmpuri complete", () => {
  it("fiecare cod mapat folosește o opțiune existentă din formular", () => {
    for (const [code, entry] of IMMOFLUX_CODES) {
      if (!entry.field) continue;
      expect(OPTIONS[entry.field], String(code)).toContain(entry.value);
    }
  });

  it("elementul 158376 completează utilitățile, finisajele și dotările", () => {
    const r = mapImmofluxItem(base(mrm158376), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = r.row;
    expect(row.utilities).toEqual(["Curent electric", "Apă", "Canalizare", "Gaz", "Acces internet", "Fibră optică"]);
    expect(row.heating_systems).toEqual(["Centrală proprie", "Încălzire pardoseală"]);
    expect(row.metering).toEqual(["Apometre", "Contor gaz", "Contor curent electric", "Contorizare separată"]);
    expect(row.insulation).toContain("Bloc izolat termic");
    expect(row.wall_finishes).toEqual(["Vopsea lavabilă", "Faianță"]);
    expect(row.floor_finishes).toEqual(["Parchet", "Gresie"]);
    expect(row.windows).toEqual(expect.arrayContaining(["PVC", "Termopan"]));
    expect(row.entry_door).toEqual(["Metal"]);
    expect(row.building_amenities).toEqual(["Interfon", "Videointerfon", "Lift", "Supraveghere video"]);
    expect(row.street_arrangement).toEqual(["Asfaltate", "Betonate", "Iluminat stradal", "Mijloace de transport în comun"]);
    expect(row.views).toEqual(["Panoramică", "Spre oraș"]);
    expect(row.finish_state).toBe("Finisat");
    expect(row.furnishing).toBe("Nemobilat");
    expect(row.kitchen_features).toEqual(["Nemobilată", "Neutilată"]);
    expect(row).toMatchObject({
      comfort: "1",
      layout: "Decomandat",
      building_type: "Bloc",
      building_structure: "Beton",
      construction_stage: "Finalizată",
      destination: "Rezidențială",
      is_exclusive: true,
      bedrooms: 1,
      kitchens: 1,
      surface: 33,
      parking_spaces: 1,
      key_in_agency: true,
    });
    expect(r.warnings.some((w) => w.startsWith("Coduri IMMOFLUX nemapate"))).toBe(false);
  });

  it("price_currency 2 → RON", () => {
    const r = mapImmofluxItem(base({ price_currency: 2 }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.currency).toBe("RON");
    expect(r.row.sale_currency).toBe("RON");
  });

  it("cod inventat → un singur avertisment, fără duplicate", () => {
    const r = mapImmofluxItem(base({ utilities: ["39999", "39999"], equipment: "30420" }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = r.warnings.filter((x) => x.startsWith("Coduri IMMOFLUX nemapate"));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("39999");
    expect(w[0]!.match(/39999/g)).toHaveLength(1);
    expect(w[0]).toContain("30420 (Recepție)");
  });

  it("agent.email al unui membru activ → responsabil", () => {
    const r = mapImmofluxItem(base({ agent: { email: "Ana@MRM.ro " } }), {
      ...ctx,
      members: [{ id: "user-2", email: "ana@mrm.ro" }],
    });
    expect(r.ok && r.row.assigned_to).toBe("user-2");
  });
});
