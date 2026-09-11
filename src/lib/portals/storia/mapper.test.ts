import { describe, expect, it } from "vitest";
import {
  mapPropertyToStoria,
  softenUppercase,
  storiaCustomId,
  storiaPhone,
  type StoriaMapOptions,
} from "./mapper";
import { parseAdvertRefs, serializeAdvertRefs, storiaListingStatus } from "./adverts.server";
import type { PropertyImageRow, PropertyRow } from "@/lib/site-feed/mapper";

const image = (id: string, primary = false): PropertyImageRow =>
  ({
    id,
    is_primary: primary,
    position: 0,
    is_confidential: false,
    include_in_publish: true,
    url: `https://cdn.test/${id}.jpg`,
  }) as unknown as PropertyImageRow;

const baseProperty = (over: Partial<PropertyRow> = {}): PropertyRow =>
  ({
    id: "11111111-1111-1111-1111-111111111111",
    title: "Apartament 3 camere Cotroceni",
    description: "x".repeat(120),
    property_type: "apartment",
    transaction_kind: "sale",
    status: "active",
    publish_status: "published",
    deleted_at: null,
    for_sale: true,
    for_rent: false,
    sale_price: 129000,
    sale_currency: "EUR",
    currency: "EUR",
    rooms: 3,
    usable_surface: 78,
    lat: 44.43,
    lng: 26.06,
    location_precise: true,
    county: "București",
    city: "București",
    construction_stage: null,
    reference: "HBT-7",
    negotiable: false,
    ...over,
  }) as unknown as PropertyRow;

const options: StoriaMapOptions = {
  baseUrl: "https://crm.habitoo.ro",
  images: [image("img-1", true)],
  agent: { full_name: "Ana Popescu", email: "ana@test.ro", phone: "0722333444" } as never,
  organizationPhone: "0311111111",
  organizationEmail: "office@test.ro",
};

describe("mapPropertyToStoria", () => {
  it("construiește un anunț valid pentru vânzare apartament", () => {
    const result = mapPropertyToStoria(baseProperty(), options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listings).toHaveLength(1);
    const advert = result.listings[0]!.advert;
    expect(advert.category_urn).toBe("urn:concept:apartments-for-sale");
    expect(advert.site_urn).toBe("urn:site:storiaro");
    expect(advert.price).toEqual({ value: 129000, currency: "EUR" });
    expect(advert.location).toEqual({ lat: 44.43, lon: 26.06, exact: true });
    expect(advert.images).toHaveLength(1);
    expect(advert.custom_fields.id).toBe(storiaCustomId({ id: baseProperty().id }, "sale"));
    expect(advert.attributes).toEqual(
      expect.arrayContaining([
        { urn: "urn:concept:net-area-m2", value: "78" },
        { urn: "urn:concept:number-of-rooms", value: "urn:concept:3" },
        { urn: "urn:concept:market", value: "urn:concept:secondary" },
      ]),
    );
  });

  it("trimite compartimentarea și tipul clădirii cu valorile confirmate", () => {
    const result = mapPropertyToStoria(
      baseProperty({ layout: "Semidecomandat", building_type: "Bloc" } as Partial<PropertyRow>),
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listings[0]!.advert.attributes).toEqual(
      expect.arrayContaining([
        { urn: "urn:concept:house-type", value: "urn:concept:semidetached" },
        { urn: "urn:concept:building-type", value: "urn:concept:block" },
      ]),
    );
  });

  it("nu trimite compartimentări fără valoare confirmată în taxonomie", () => {
    const result = mapPropertyToStoria(
      baseProperty({ layout: "Open space" } as Partial<PropertyRow>),
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.listings[0]!.advert.attributes.some((a) => a.urn === "urn:concept:house-type"),
    ).toBe(false);
  });

  it("cere coordonate, imagini și monedă acceptată", () => {
    const result = mapPropertyToStoria(
      baseProperty({ lat: null, lng: null, sale_currency: "USD" }),
      { ...options, images: [] },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/coordonate/i);
    expect(result.reasons.join(" ")).toMatch(/imagine/i);
    expect(result.reasons.join(" ")).toMatch(/USD/);
  });

  it("respinge titlul prea lung și descrierea prea scurtă", () => {
    const result = mapPropertyToStoria(
      baseProperty({ title: "a".repeat(80), description: "scurt" }),
      options,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/70/);
    expect(result.reasons.join(" ")).toMatch(/50/);
  });

  it("produce două anunțuri pentru tranzacții duale", () => {
    const result = mapPropertyToStoria(
      baseProperty({ for_rent: true, rent_price: 600, rent_currency: "EUR" }),
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listings.map((l) => l.advert.category_urn)).toEqual([
      "urn:concept:apartments-for-sale",
      "urn:concept:apartments-for-rent",
    ]);
  });

  it("publică terenul pe categoria de loturi confirmată", () => {
    const result = mapPropertyToStoria(
      baseProperty({ property_type: "teren", land_surface: 500 }),
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listings[0]?.advert.category_urn).toBe("urn:concept:lots-for-sale");
  });

  it("blochează tipurile fără categorie Storia", () => {
    const result = mapPropertyToStoria(baseProperty({ property_type: "cabana" }), options);
    expect(result.ok).toBe(false);
  });
});

describe("helpers Storia", () => {
  it("normalizează cuvintele cu majuscule", () => {
    expect(softenUppercase("APARTAMENT lux ULTRACENTRAL")).toBe("Apartament lux Ultracentral");
  });

  it("acceptă doar telefoane cu 7–14 cifre", () => {
    expect(storiaPhone("+40 722 333 444")).toBe("40722333444");
    expect(storiaPhone("123")).toBeNull();
  });

  it("serializează referințele celor două anunțuri", () => {
    const refs = { sale: "uuid-a", rent: "uuid-b" };
    const serialized = serializeAdvertRefs(refs);
    expect(serialized).toBe("SALE:uuid-a|RENT:uuid-b");
    expect(parseAdvertRefs(serialized)).toEqual(refs);
    expect(parseAdvertRefs(null)).toEqual({});
  });

  it("traduce statusurile portalului în stări interne", () => {
    expect(storiaListingStatus("active")).toBe("published");
    expect(storiaListingStatus("new")).toBe("pending");
    expect(storiaListingStatus("moderated")).toBe("error");
    expect(storiaListingStatus(null)).toBe("pending");
  });
});
