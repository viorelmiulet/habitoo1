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
    const r = mapImmofluxItem(base({ transaction_id: 5, subcategory_id: 999, price_currency: 2 }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toHaveLength(3);
  });

  it.each([
    [2, -1, "Demisol"],
    [3, 0, "Parter"],
    [50, 5, "Etaj 5"],
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
