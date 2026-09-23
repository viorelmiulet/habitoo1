import { describe, expect, it } from "vitest";
import type { ImmofluxItem } from "../immoflux/mapper";
import { planImmofluxImport, type ExistingImmofluxProperty } from "../immoflux/plan";

const ctx = { organizationId: "org-1", assignedTo: "user-1" };

function item(id: number, overrides: Partial<ImmofluxItem> = {}): ImmofluxItem {
  return {
    id,
    category_id: 1,
    subcategory_id: 101,
    transaction_id: 1,
    price: 90000,
    price_currency: 1,
    title: { ro: `Apartament ${id}` },
    city: { name: "Bucuresti Sector 3" },
    zone: { name: "Titan" },
    latitude: "44.42",
    longitude: "26.15",
    exact_location: 1,
    images: [
      { ordering: 1, src: "https://cdn.x.ro/1.jpg" },
      { ordering: 2, src: "https://cdn.x.ro/2.jpg" },
    ],
    ...overrides,
  };
}

function existing(id: string, externalId: string, o: Partial<ExistingImmofluxProperty> = {}): ExistingImmofluxProperty {
  return {
    id,
    external_id: externalId,
    county: null,
    city: null,
    county_siruta_code: null,
    uat_siruta_code: null,
    locality_siruta_code: null,
    district: null,
    lat: null,
    lng: null,
    location_precise: false,
    known_image_urls: [],
    ...o,
  };
}

describe("planImmofluxImport", () => {
  it("element nou → create", () => {
    const plan = planImmofluxImport([item(1)], [], ctx);
    expect(plan.counts).toEqual({ create: 1, update: 0, skip: 0, images: 2 });
    expect(plan.items[0]!.action).toBe("create");
  });

  it("external_id existent → update fără câmpurile protejate", () => {
    const plan = planImmofluxImport([item(1)], [existing("p1", "1")], ctx);
    const it0 = plan.items[0]!;
    expect(it0.action).toBe("update");
    if (it0.action !== "update") return;
    expect(it0.propertyId).toBe("p1");
    for (const key of ["status", "assigned_to", "reference", "created_by", "organization_id"]) {
      expect(it0.patch).not.toHaveProperty(key);
    }
    expect(it0.patch.title).toBe("Apartament 1");
    // locație goală în Habitoo → completată din import
    expect(it0.patch.city).toBe("Bucureşti Sectorul 3");
    expect(it0.patch.lat).toBe(44.42);
  });

  it("locație deja completată → păstrată", () => {
    const plan = planImmofluxImport(
      [item(1)],
      [existing("p1", "1", { city: "Bucureşti Sectorul 2", county: "Bucureşti", lat: 44.1, lng: 26.1, district: "Colentina", location_precise: true })],
      ctx,
    );
    const it0 = plan.items[0]!;
    if (it0.action !== "update") throw new Error("expected update");
    expect(it0.patch).not.toHaveProperty("city");
    expect(it0.patch).not.toHaveProperty("county");
    expect(it0.patch).not.toHaveProperty("lat");
    expect(it0.patch).not.toHaveProperty("district");
    expect(it0.patch).not.toHaveProperty("location_precise");
    // câmpurile goale de locație se completează în continuare
    expect(it0.patch.locality_siruta_code).toBe(179169);
  });

  it("ciornă → skip", () => {
    const plan = planImmofluxImport([item(2, { category_id: 0, title: { ro: "" } })], [], ctx);
    expect(plan.items[0]!.action).toBe("skip");
    expect(plan.counts.skip).toBe(1);
  });

  it("poză existentă sau deja în coadă → nepusă din nou", () => {
    const plan = planImmofluxImport(
      [item(1)],
      [existing("p1", "1", { known_image_urls: ["https://cdn.x.ro/1.jpg"] })],
      ctx,
    );
    const it0 = plan.items[0]!;
    if (it0.action !== "update") throw new Error("expected update");
    expect(it0.images).toEqual([{ source_url: "https://cdn.x.ro/2.jpg", ordering: 2 }]);
    expect(plan.counts.images).toBe(1);
  });

  it("reimportul aceluiași fișier nu produce creări noi", () => {
    const file = [item(1), item(2)];
    const first = planImmofluxImport(file, [], ctx);
    expect(first.counts.create).toBe(2);
    const afterFirst = [
      existing("p1", "1", { known_image_urls: ["https://cdn.x.ro/1.jpg", "https://cdn.x.ro/2.jpg"] }),
      existing("p2", "2", { known_image_urls: ["https://cdn.x.ro/1.jpg", "https://cdn.x.ro/2.jpg"] }),
    ];
    const second = planImmofluxImport(file, afterFirst, ctx);
    expect(second.counts).toEqual({ create: 0, update: 2, skip: 0, images: 0 });
  });

  it("id duplicat în fișier → a doua apariție sărită", () => {
    const plan = planImmofluxImport([item(1), item(1)], [], ctx);
    expect(plan.counts).toMatchObject({ create: 1, skip: 1 });
  });
});
