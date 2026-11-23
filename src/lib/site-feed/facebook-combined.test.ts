import { describe, expect, it } from "vitest";
import {
  buildFacebookCombinedCsv, buildFacebookProductsCsv, FACEBOOK_COMBINED_COLUMNS, FACEBOOK_PRODUCTS_COLUMNS,
} from "./facebook-catalog";
import { parseCsv } from "@/lib/market/csv";
import type { PropertyImageRow, PropertyRow } from "./mapper";

const base = {
  id: "11111111-1111-1111-1111-111111111111", reference: "HB-1088", title: "Apartament, 2 camere",
  description: "Frumos", status: "active", transaction_kind: "sale", for_sale: true, for_rent: false,
  price: 84000, sale_price: 84000, currency: "EUR", sale_currency: "EUR", lat: 44.4, lng: 26.1,
  location_precise: true, street: "Str. Lujerului", street_number: "5", city: "București Sector 6",
  district: "Militari", county: "București", property_type: "apartment", rooms: 2,
} as unknown as PropertyRow;
const imgs = (id: string) => [0, 1, 2].map((i) => ({ id: `${id}-img${i}`, property_id: id, include_in_publish: true,
  is_confidential: false, is_primary: i === 1, position: i })) as unknown as PropertyImageRow[];
const props = [
  base,
  { ...base, id: "p2", reference: "HB-2", location_precise: false },
  { ...base, id: "p3", reference: "HB-3", location_precise: false, district: null, city: "Cluj-Napoca" },
] as PropertyRow[];
const input = {
  properties: props, imagesByProperty: new Map(props.map((p) => [p.id, imgs(p.id)])),
  baseUrl: "https://crm.habitoo.ro", publicSiteUrl: "https://www.habitoo.ro", brand: "MVA",
};

function rows(csv: string) {
  const parsed = parseCsv(csv) as unknown as { headers?: string[]; rows: (string[] | Record<string, string>)[] };
  return parsed.rows.map((r) => (k: string) => Array.isArray(r) ? r[FACEBOOK_COMBINED_COLUMNS.indexOf(k as never)] : r[k]);
}

describe("Catalog Facebook combinat", () => {
  const csv = buildFacebookCombinedCsv(input).csv;
  const all = rows(csv);

  it("are toate coloanele Home Listings și de produs pe fiecare rând, cu CRLF", () => {
    const header = csv.split("\r\n")[0]!.split(",");
    for (const c of ["home_listing_id", "name", "availability", "listing_type", "property_type", "num_beds", "num_baths", "area_size", "area_unit", "year_built", "description", "url", "address.addr1", "address.city", "address.region", "address.country", "address.postal_code", "latitude", "longitude", "neighborhood[0]", "id", "title", "link", "image_link", "additional_image_link", "price", "condition", "brand", "inventory", "google_product_category", "custom_label_0", "custom_label_1", "custom_label_2", "custom_label_3", "image", "image[0].url"]) expect(header).toContain(c);
    expect(all).toHaveLength(3);
    expect(csv.endsWith("\r\n")).toBe(true);
    const g = all[0]!;
    expect(g("id")).toBe("HB-1088");
    expect(g("price")).toBe("84000 EUR");
    expect(g("inventory")).toBe("1");
    expect(g("brand")).toBe("MVA");
    expect(g("google_product_category")).toBe("Real Estate > Apartament");
    expect(g("availability")).toBe("for_sale");
  });

  it("address.addr1: strada doar la locație exactă, altfel zona, apoi localitatea; țara Romania", () => {
    expect(all.map((g) => g("address.addr1"))).toEqual(["Str. Lujerului 5", "Militari", "Cluj-Napoca"]);
    for (const g of all) expect(g("address.country")).toBe("Romania");
  });

  it("image e JSON valid, image_link e poza principală", () => {
    const g = all[0]!;
    const list = JSON.parse(String(g("image"))) as { url: string }[];
    expect(list).toHaveLength(3);
    expect(list[0]!.url).toBe(g("image_link"));
    expect(g("image_link")).toContain("img1");
    expect(g("image[0].url")).toBe(g("image_link"));
  });

  it("format=products rămâne neschimbat", () => {
    const p = buildFacebookProductsCsv(input).csv;
    expect(p.split("\r\n")[0]).toBe(FACEBOOK_PRODUCTS_COLUMNS.join(","));
  });
});
