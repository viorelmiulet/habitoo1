import { describe, expect, it } from "vitest";
import type { PropertyImageRow, PropertyRow } from "@/lib/site-feed/mapper";
import { mapPropertyToOferteImobiliare, oiListingId } from "./mapper";
import { matchGeo, normalizeGeoList, resolveOiLocation } from "./geo.server";
import { OI_HEATING, OI_UTILITIES_GENERAL, codesFor, oiFloor } from "./taxonomy";

const geo = {
  counties: [{ id: 12, name: "Cluj", parentId: null }],
  cities: [{ id: 340, name: "Cluj-Napoca", parentId: 12 }],
  zones: [{ id: 9001, name: "Zorilor", parentId: 340 }],
};

function property(overrides: Partial<PropertyRow> = {}): PropertyRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    organization_id: "org",
    reference: "HB-1001",
    title: "Apartament 3 camere Zorilor",
    description: "Apartament decomandat, complet finisat, cu parcare subterană și boxă la subsol.",
    property_type: "apartment",
    status: "active",
    publish_on_site: true,
    for_sale: true,
    for_rent: false,
    sale_price: 145000,
    sale_currency: "EUR",
    county: "Cluj",
    city: "Cluj-Napoca",
    district: "Zorilor",
    rooms: 3,
    usable_surface: 78,
    utilities: ["Curent electric", "Apă", "Gaz", "Pompă de căldură"],
    heating_systems: ["Centrală proprie"],
    floor_label: "Etaj 3",
    ...overrides,
  } as unknown as PropertyRow;
}

const images: PropertyImageRow[] = [
  {
    id: "img-1",
    property_id: "11111111-1111-1111-1111-111111111111",
    organization_id: "org",
    url: "https://example.com/1.jpg",
    position: 1,
    is_primary: true,
    is_confidential: false,
    include_in_publish: true,
  } as unknown as PropertyImageRow,
];

const options = {
  baseUrl: "https://crm.habitoo.ro",
  images,
  agencyName: "MVA Imobiliare",
  location: resolveOiLocation(geo, { county: "Cluj", city: "Cluj-Napoca", district: "Zorilor" }),
};

describe("taxonomia IMMOFLUX", () => {
  it("traduce etichetele în coduri și ignoră ce nu are cod documentat", () => {
    expect(codesFor(OI_UTILITIES_GENERAL, ["Curent electric", "Apă", "Pompă de căldură"])).toEqual([
      10001, 10002,
    ]);
    expect(codesFor(OI_HEATING, ["Centrală proprie"])).toEqual([10102]);
  });

  it("mapează etajul din etichetă", () => {
    expect(oiFloor({ floorLabel: "Parter", floor: null })).toBe(3);
    expect(oiFloor({ floorLabel: "Etaj 3", floor: null })).toBe(30);
    expect(oiFloor({ floorLabel: "Mansardă", floor: null })).toBe(1000);
    expect(oiFloor({ floorLabel: null, floor: 0 })).toBe(3);
  });
});

describe("locațiile portalului", () => {
  it("normalizează listele și potrivește ierarhic", () => {
    const cities = normalizeGeoList([{ id: "340", name: " Cluj-Napoca ", county_id: 12 }], ["county_id"]);
    expect(cities).toEqual([{ id: 340, name: "Cluj-Napoca", parentId: 12 }]);
    expect(matchGeo(cities, "cluj napoca", 12)?.id).toBe(340);
    expect(resolveOiLocation(geo, { county: "Cluj", city: "Cluj-Napoca", district: "Zorilor" })).toEqual({
      countyId: 12,
      cityId: 340,
      zoneId: 9001,
    });
  });
});

describe("mapPropertyToOferteImobiliare", () => {
  it("construiește un anunț valid", () => {
    const result = mapPropertyToOferteImobiliare(property(), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [listing] = result.listings;
    expect(listing?.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(listing?.transaction_id).toBe(1);
    expect(listing?.category_id).toBe(1);
    expect(listing?.price).toBe(145000);
    expect(listing?.price_currency).toBe(1);
    expect(listing?.county_id).toBe(12);
    expect(listing?.city_id).toBe(340);
    expect(listing?.zone_id).toBe(9001);
    expect(listing?.utilities).toContain(10102);
    expect(listing?.public_images).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("Pompă de căldură");
  });

  it("respinge oferta fără județ potrivit, cu motiv clar", () => {
    const result = mapPropertyToOferteImobiliare(property(), {
      ...options,
      location: { countyId: null, cityId: null, zoneId: null },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toContain("Județul");
  });

  it("generează două anunțuri distincte când ambele tranzacții sunt active", () => {
    const result = mapPropertyToOferteImobiliare(
      property({ for_rent: true, rent_price: 700, rent_currency: "EUR" } as Partial<PropertyRow>),
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listings.map((l) => l.id)).toEqual([
      "11111111-1111-1111-1111-111111111111",
      oiListingId("11111111-1111-1111-1111-111111111111", "rent"),
    ]);
    expect(result.listings.map((l) => l.transaction_id)).toEqual([1, 2]);
  });

  it("respinge descrierea prea scurtă", () => {
    const result = mapPropertyToOferteImobiliare(property({ description: "Scurt" }), options);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toContain("Descrierea");
  });
});
