import { describe, expect, it } from "vitest";
import {
  IMOVE_MAX_IMAGES,
  imoveExternalId,
  imovePropertyType,
  imoveSlug,
  imoveTransactionType,
  mapPropertyToImove,
} from "./mapper";
import type { PropertyImageRow, PropertyRow } from "@/lib/site-feed/mapper";

const baseProperty = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "org",
  reference: "RF-1001",
  title: "Apartament 3 camere",
  description: "Descriere completă",
  property_type: "apartment",
  transaction_kind: "sale",
  status: "active",
  price: 165000,
  currency: "eur",
  surface: 82,
  usable_surface: 78,
  rooms: 3,
  bathrooms: 2,
  floor: 3,
  building_floors: 8,
  build_year: 2019,
  address: "Str. Exemplu 12",
  city: "București",
  district: "Sector 1",
  street: "Str. Exemplu",
  location_precise: true,
  deleted_at: null,
  publish_status: "published",
  updated_at: "2026-02-01T00:00:00Z",
} as unknown as PropertyRow;

const image = {
  id: "33333333-3333-4333-8333-333333333333",
  property_id: baseProperty.id,
  url: "https://internal.example/x.jpg",
  storage_path: "org/prop/x.jpg",
  position: 0,
  is_primary: true,
  is_confidential: false,
  include_in_publish: true,
} as unknown as PropertyImageRow;

const options = {
  baseUrl: "https://crm.habitoo.ro",
  publicSiteUrl: "https://habitoo.ro",
  images: [image],
  agent: { full_name: "Mihai Popescu", email: "mihai@example.ro", phone: "+40712345678" },
};

describe("enum-uri iMove documentate", () => {
  it("mapează tranzacția doar la SALE/RENT", () => {
    expect(imoveTransactionType("sale")).toBe("SALE");
    expect(imoveTransactionType("rent")).toBe("RENT");
    expect(imoveTransactionType("barter")).toBeNull();
  });

  it("mapează tipul de proprietate la enum-ul iMove", () => {
    expect(imovePropertyType("apartment")).toBe("APARTMENT");
    expect(imovePropertyType("garsoniera")).toBe("STUDIO");
    expect(imovePropertyType("casa")).toBe("HOUSE");
    expect(imovePropertyType("teren")).toBe("LAND");
    expect(imovePropertyType("birou")).toBe("OFFICE");
    expect(imovePropertyType("hotel")).toBeNull();
  });
});

describe("externalId și slug-uri", () => {
  it("folosește referința sanitizată, stabilă și sub 120 caractere", () => {
    const id = imoveExternalId(baseProperty);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(id.length).toBeLessThanOrEqual(120);
    expect(imoveExternalId(baseProperty)).toBe(id);
  });

  it("cade pe id-ul proprietății când nu există referință", () => {
    expect(imoveExternalId({ ...baseProperty, reference: null })).toContain("1111");
  });

  it("normalizează diacriticele în slug-uri ASCII", () => {
    expect(imoveSlug("București")).toBe("bucuresti");
    expect(imoveSlug("Cluj-Napoca")).toBe("cluj-napoca");
    expect(imoveSlug("")).toBeNull();
  });
});

describe("mapPropertyToImove", () => {
  it("mapează o ofertă validă cu câmpurile documentate", () => {
    const result = mapPropertyToImove(baseProperty, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.transactionType).toBe("SALE");
    expect(result.listing.propertyType).toBe("APARTMENT");
    expect(result.listing.currency).toBe("EUR");
    expect(result.listing.citySlug).toBe("bucuresti");
    expect(result.listing.imageUrls[0]).toMatch(/^https:\/\/crm\.habitoo\.ro\//);
    expect(result.listing.agentEmail).toBe("mihai@example.ro");
  });

  it("exclude ofertele fără câmpuri obligatorii, cu motiv", () => {
    const result = mapPropertyToImove({ ...baseProperty, description: null } as PropertyRow, options);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toContain("descrierea");
  });

  it("exclude prețul lipsă sau nepozitiv", () => {
    expect(mapPropertyToImove({ ...baseProperty, price: 0 } as PropertyRow, options).ok).toBe(false);
  });

  it("nu trimite imagini confidențiale sau nepublicabile", () => {
    const result = mapPropertyToImove(baseProperty, {
      ...options,
      images: [
        image,
        { ...image, id: "44444444-4444-4444-8444-444444444444", is_confidential: true },
        { ...image, id: "55555555-5555-4555-8555-555555555555", include_in_publish: false },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.imageUrls).toHaveLength(1);
  });

  it("limitează la 40 imagini și avertizează", () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      ...image,
      id: `6${String(i).padStart(7, "0")}-6666-4666-8666-666666666666`,
      position: i,
      is_primary: i === 0,
    })) as PropertyImageRow[];
    const result = mapPropertyToImove(baseProperty, { ...options, images: many });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.imageUrls).toHaveLength(IMOVE_MAX_IMAGES);
    expect(result.warnings.join(" ")).toContain("maximum 40");
  });

  it("nu expune adresa exactă când locația nu este precisă", () => {
    const result = mapPropertyToImove({ ...baseProperty, location_precise: false } as PropertyRow, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.addressPublic).toBe("Str. Exemplu");
  });
});
