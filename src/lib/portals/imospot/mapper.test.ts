import { describe, expect, it } from "vitest";
import { imospotExternalId, imospotPropertyType, mapPropertyToImospot } from "./mapper";
import type { PropertyImageRow, PropertyRow } from "@/lib/site-feed/mapper";

const LONG_DESCRIPTION =
  "Apartament luminos, complet renovat, cu vedere panoramică și finisaje premium în zonă centrală.";

const baseProperty = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "org",
  reference: "RF-1001",
  title: "Apartament 3 camere Militari",
  description: LONG_DESCRIPTION,
  property_type: "apartment",
  transaction_kind: "sale",
  status: "active",
  for_sale: true,
  for_rent: false,
  sale_price: 119000,
  sale_currency: "eur",
  rent_price: null,
  rent_currency: null,
  price: 119000,
  currency: "eur",
  surface: 82,
  usable_surface: 78,
  rooms: 3,
  bathrooms: 2,
  floor: 3,
  building_floors: 8,
  build_year: 2019,
  comfort: "Lux",
  finish_state: "Renovat",
  heating: "Centrală proprie",
  heating_systems: [],
  cooling_systems: ["Aer condiționat"],
  features: [],
  building_amenities: ["Lift", "Interfon"],
  additional_spaces: ["Terasă"],
  misc_features: [],
  balcony: true,
  parking: "Parcare subterană",
  parking_spaces: 1,
  garages: 0,
  terraces: 1,
  county: "București",
  city: "București",
  district: "Sector 6",
  street: "Bd. Iuliu Maniu",
  address: "Bd. Iuliu Maniu 500",
  location_precise: true,
  lat: 44.4325,
  lng: 26.0125,
  deleted_at: null,
  publish_status: "published",
  updated_at: "2026-02-01T00:00:00Z",
} as unknown as PropertyRow;

const image = {
  id: "22222222-2222-4222-8222-222222222222",
  property_id: baseProperty.id,
  organization_id: "org",
  include_in_publish: true,
  is_confidential: false,
  is_primary: true,
  position: 0,
} as unknown as PropertyImageRow;

const options = {
  baseUrl: "https://crm.habitoo.ro",
  images: [image],
  agent: { full_name: "Ana Pop", email: "ana@example.ro", phone: "0722111222" },
  organizationPhone: "0311111111",
};

describe("mapPropertyToImospot", () => {
  it("mapează o ofertă de vânzare completă", () => {
    const result = mapPropertyToImospot(baseProperty, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listings).toHaveLength(1);
    const listing = result.listings[0]!;
    expect(listing.external_id).toBe(`HBT-${baseProperty.id}-SALE`);
    expect(listing.transaction).toBe("sale");
    expect(listing.property_type).toBe("apartment");
    expect(listing.price).toBe(119000);
    expect(listing.currency).toBe("EUR");
    expect(listing.contact.phone).toBe("0722111222");
    expect(listing.contact.agent?.name).toBe("Ana Pop");
    expect(listing.location).toMatchObject({
      county: "București",
      city: "București",
      neighborhood: "Sector 6",
    });
    expect(listing.images).toEqual([
      "https://crm.habitoo.ro/api/public/sites/v1/media/22222222-2222-4222-8222-222222222222",
    ]);
    expect(listing.features).toContain("elevator");
    expect(listing.features).toContain("balcony");
    expect(listing.features).toContain("parking");
    expect(listing.attributes).toMatchObject({
      rooms: 3,
      bathrooms: 2,
      surface: 78,
      total_floors: 8,
    });
    // Câmpurile fără echivalent real nu sunt inventate.
    expect(Object.keys(listing)).not.toContain("promotion");
    expect(Object.keys(listing)).not.toContain("video_url");
    expect(Object.keys(listing)).not.toContain("exclusive");
  });

  it("generează două anunțuri când ambele tranzacții sunt active", () => {
    const result = mapPropertyToImospot(
      {
        ...baseProperty,
        for_rent: true,
        rent_price: 600,
        rent_currency: "eur",
      } as PropertyRow,
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listings.map((l) => l.transaction)).toEqual(["sale", "rent"]);
    expect(result.listings.map((l) => l.price)).toEqual([119000, 600]);
    expect(result.listings[1]!.external_id).toBe(`HBT-${baseProperty.id}-RENT`);
  });

  it("respinge descrierea prea scurtă, lipsa imaginilor și lipsa localizării", () => {
    const result = mapPropertyToImospot(
      { ...baseProperty, description: "Prea scurt", county: null, city: null } as PropertyRow,
      { ...options, images: [] },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toContain("60 caractere");
    expect(result.reasons.join(" ")).toContain("județul");
    expect(result.reasons.join(" ")).toContain("imagine");
  });

  it("rotunjește prețul cu zecimale și avertizează", () => {
    const result = mapPropertyToImospot(
      { ...baseProperty, sale_price: 84999.6 } as PropertyRow,
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listings[0]!.price).toBe(85000);
    expect(result.warnings.join(" ")).toContain("rotunjit");
  });

  it("respinge lipsa telefonului de contact", () => {
    const result = mapPropertyToImospot(baseProperty, {
      ...options,
      agent: { full_name: "Ana Pop", email: null, phone: null },
      organizationPhone: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toContain("telefonul");
  });

  it("normalizează tipul de proprietate și external_id stabil", () => {
    expect(imospotPropertyType("hala")).toBe("warehouse");
    expect(imospotPropertyType("garsonieră")).toBe("apartment");
    expect(imospotPropertyType("necunoscut")).toBeNull();
    expect(imospotExternalId({ id: "abc" }, "rent")).toBe("HBT-abc-RENT");
  });
});
