import { describe, expect, it } from "vitest";
import {
  buildFacebookCatalogCsv,
  buildFacebookProductsCsv,
  FACEBOOK_CATALOG_COLUMNS,
  FACEBOOK_PRODUCTS_COLUMNS,
} from "./facebook-catalog";
import { parseCsv } from "@/lib/market/csv";
import type { PropertyImageRow, PropertyRow } from "./mapper";

const p = {
  id: "11111111-1111-1111-1111-111111111111", reference: "HB-1088", title: "Apartament 2 camere",
  description: "<p>**Frumos**</p>", status: "active", transaction_kind: "sale", for_sale: true,
  for_rent: false, price: 75000, sale_price: 75000, currency: "EUR", sale_currency: "EUR",
  lat: 44.4, lng: 26.1, location_precise: true, city: "Cluj-Napoca", county: "Cluj",
  property_type: "apartment", rooms: 2,
} as unknown as PropertyRow;
const imgs = [0, 1, 2].map((i) => ({
  id: `img${i}`, property_id: p.id, include_in_publish: true, is_confidential: false,
  is_primary: i === 0, position: i,
})) as unknown as PropertyImageRow[];
const input = {
  properties: [p], imagesByProperty: new Map([[p.id, imgs]]),
  baseUrl: "https://crm.habitoo.ro", publicSiteUrl: "https://habitoo.ro",
};

describe("facebook catalog products format", () => {
  it("has the exact Meta products header", () => {
    const csv = buildFacebookProductsCsv({ ...input, brand: "MRM" }).csv;
    expect(csv.split("\r\n")[0]).toBe(
      "id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,google_product_category,custom_label_0,custom_label_1,custom_label_2,custom_label_3",
    );
    expect(FACEBOOK_PRODUCTS_COLUMNS).toHaveLength(15);
  });

  it("maps a complete listing", () => {
    const csv = buildFacebookProductsCsv({ ...input, brand: "MRM" }).csv;
    const row = csv.split("\r\n")[1]!;
    expect(row).toContain('"https://crm.habitoo.ro/');
    const [r] = parseCsv(csv).rows as unknown as Record<string, string>[];
    const get = (k: string) => (Array.isArray(r) ? r[FACEBOOK_PRODUCTS_COLUMNS.indexOf(k as never)] : r![k]);
    expect(get("id")).toBe("HB-1088");
    expect(get("price")).toBe("75000 EUR");
    expect(get("condition")).toBe("used");
    expect(get("description")).toBe("Frumos");
    expect(String(get("additional_image_link")).split(",")).toHaveLength(2);
    expect(get("brand")).toBe("MRM");
  });

  it("leaves the default feed unchanged", () => {
    const csv = buildFacebookCatalogCsv(input).csv;
    expect(csv.split("\r\n")[0]).toBe(FACEBOOK_CATALOG_COLUMNS.join(","));
    expect(csv.split("\r\n")[0]!.startsWith("home_listing_id,name,")).toBe(true);
  });
});
