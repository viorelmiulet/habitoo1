import { describe, expect, it } from "vitest";
import type { PropertyImageRow, PropertyRow } from "@/lib/site-feed/mapper";
import { collabCommissionPercent, homepitchPropertyType, mapPropertyToHomePitch } from "./mapper";

const baseProperty = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Apartament 3 camere Cotroceni",
  description: "x".repeat(320),
  property_type: "apartment",
  status: "active",
  for_sale: true,
  for_rent: false,
  sale_price: 145000,
  sale_currency: "EUR",
  rent_price: null,
  rent_currency: null,
  price: 145000,
  currency: "EUR",
  city: "București",
  district: "Cotroceni",
  street: "Strada Dr. Lister 12",
  lat: 44.4325,
  lng: 26.0721,
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  usable_surface: 78,
  built_surface: 86,
  land_surface: null,
  floor: 2,
  floor_label: null,
  building_floors: 8,
  build_year: 1978,
  features: ["Aer condiționat", "Balcon"],
  building_amenities: ["Lift"],
  furnishing: "Mobilat și utilat",
  pet_friendly: true,
  collaboration: true,
  commission: "colaborare 2,5% din preț",
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-02-01T10:00:00.000Z",
} as unknown as PropertyRow;

const image = {
  id: "22222222-2222-2222-2222-222222222222",
  property_id: baseProperty.id,
  is_primary: true,
  position: 0,
  is_public: true,
  deleted_at: null,
  storage_path: "org/prop/1.jpg",
} as unknown as PropertyImageRow;

const options = {
  baseUrl: "https://crm.habitoo.ro",
  images: [image],
  agent: { full_name: "Ana Ionescu", email: "ana@agentie.ro", phone: "0722000111" },
};

describe("mapPropertyToHomePitch", () => {
  it("mapează o ofertă completă", () => {
    const result = mapPropertyToHomePitch(baseProperty, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.property.property_type).toBe("apartament");
    expect(result.property.transaction_type).toBe("vanzare");
    expect(result.property.price).toBe(145000);
    expect(result.property.agent.email).toBe("ana@agentie.ro");
    expect(result.property.agent.first_name).toBe("Ana");
    expect(result.property.tags).toContain("aer-conditionat");
    expect(result.property.tags).toContain("lift");
    expect(result.property.tags).toContain("pet-friendly");
    expect(result.property.collab_commission_percent).toBe(2.5);
    expect(result.property.images).toHaveLength(1);
  });

  it("exclude ofertele fără coordonate", () => {
    const result = mapPropertyToHomePitch({ ...baseProperty, lat: null, lng: null } as PropertyRow, options);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/coordonate/i);
  });

  it("exclude ofertele care nu sunt în EUR", () => {
    const result = mapPropertyToHomePitch(
      { ...baseProperty, sale_currency: "RON", currency: "RON" } as PropertyRow,
      options,
    );
    expect(result.ok).toBe(false);
  });

  it("exclude ofertele fără email de agent", () => {
    const result = mapPropertyToHomePitch(baseProperty, { ...options, agent: null });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/email/i);
  });

  it("tranzacția dublă se expune ca vânzare, cu mențiune în descriere", () => {
    const result = mapPropertyToHomePitch(
      { ...baseProperty, for_rent: true, rent_price: 700, rent_currency: "EUR" } as PropertyRow,
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.property.transaction_type).toBe("vanzare");
    expect(result.property.description).toMatch(/închiriere: 700 EUR/);
  });

  it("mapează tipurile la cele 6 valori HomePitch", () => {
    expect(homepitchPropertyType("studio")).toBe("apartament");
    expect(homepitchPropertyType("industrial")).toBe("spatiu_industrial");
    expect(homepitchPropertyType("altceva")).toBeNull();
  });

  it("nu inventează procentul de colaborare", () => {
    expect(collabCommissionPercent({ ...baseProperty, commission: "negociabil" } as PropertyRow)).toBeNull();
    expect(collabCommissionPercent({ ...baseProperty, collaboration: false } as PropertyRow)).toBeNull();
  });
});
