import { describe, expect, it } from "vitest";
import {
  buildFacebookCatalogCsv,
  csvField,
  FACEBOOK_CATALOG_COLUMNS,
  plainText,
} from "./facebook-catalog";
import { parseCsv } from "@/lib/market/csv";
import type { PropertyImageRow, PropertyRow } from "./mapper";

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  reference: "HB-1088",
  title: 'Apartament 2 camere, "lux"',
  description: "<p>Frumos</p><br>vedere",
  status: "active",
  transaction_kind: "sale",
  for_sale: true,
  for_rent: false,
  price: 89900,
  sale_price: 89900,
  currency: "EUR",
  sale_currency: "EUR",
  lat: 44.4,
  lng: 26.1,
  location_precise: true,
  city: "București",
  county: "București",
  property_type: "studio",
  bedrooms: 1,
  usable_surface: 50,
} as unknown as PropertyRow;

const img = (pid: string) =>
  ({ id: "img1", property_id: pid, include_in_publish: true, is_confidential: false, is_primary: true, position: 0 }) as unknown as PropertyImageRow;

describe("facebook catalog csv", () => {
  it("escapes RFC 4180 and strips HTML", () => {
    expect(csvField('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(plainText("<p>x</p><b>y</b>")).toBe("x\ny");
  });

  it("includes complete listings and excludes incomplete ones", () => {
    const noPrice = { ...base, id: "p2", price: null, sale_price: null } as PropertyRow;
    const noCoords = { ...base, id: "p3", lat: null } as PropertyRow;
    const noImg = { ...base, id: "p4" } as PropertyRow;
    const result = buildFacebookCatalogCsv({
      properties: [base, noPrice, noCoords, noImg],
      imagesByProperty: new Map([
        [base.id, [img(base.id)]],
        ["p2", [img("p2")]],
        ["p3", [img("p3")]],
      ]),
      baseUrl: "https://crm.habitoo.ro",
      publicSiteUrl: "https://habitoo.ro",
    });
    expect(result.included).toBe(1);
    expect(result.excluded).toEqual({ no_price: 1, no_coordinates: 1, no_images: 1, no_city: 0 });
    const parsed = parseCsv(result.csv);
    expect(parsed.headers).toEqual([...FACEBOOK_CATALOG_COLUMNS]);
    const row = parsed.rows[0]!;
    expect(row["home_listing_id"]).toBe("HB-1088");
    expect(row["name"]).toBe('Apartament 2 camere, "lux"');
    expect(row["price"]).toBe("89900 EUR");
    expect(row["availability"]).toBe("for_sale");
    expect(row["property_type"]).toBe("apartment");
    expect(row["listing_type"]).toBe("for_sale_by_agent");
    expect(row["image[0].url"]).toBe("https://crm.habitoo.ro/api/public/sites/v1/media/img1");
    expect(row["address.country"]).toBe("RO");
    expect(row["area_unit"]).toBe("sq_m");
  });

  it("maps reserved sale to sale_pending and hides addr1 for approximate location", () => {
    const p = { ...base, status: "reserved", location_precise: false, address: "Str. X 1" } as PropertyRow;
    const r = buildFacebookCatalogCsv({
      properties: [p],
      imagesByProperty: new Map([[p.id, [img(p.id)]]]),
      baseUrl: "https://b",
      publicSiteUrl: "https://s",
    });
    const row = parseCsv(r.csv).rows[0]!;
    expect(row["availability"]).toBe("sale_pending");
    expect(row["address.addr1"]).toBe("");
    expect(row["latitude"]).not.toBe("44.4");
  });
});

describe("oraș/județ/cartier normalizate pentru Meta", () => {
  const run = (o: Record<string, unknown>) => {
    const p = { ...base, ...o } as PropertyRow;
    const r = buildFacebookCatalogCsv({
      properties: [p],
      imagesByProperty: new Map([[p.id, [img(p.id)]]]),
      baseUrl: "https://b",
      publicSiteUrl: "https://s",
    });
    return { r, row: parseCsv(r.csv).rows[0] };
  };
  it("Bucureşti Sectorul 6 cu zonă", () => {
    const { row } = run({ city: "Bucureşti Sectorul 6", county: "Bucureşti", district: "Militari" });
    expect(row!["address.city"]).toBe("București");
    expect(row!["address.region"]).toBe("București");
    expect(row!["neighborhood[0]"]).toBe("Militari");
  });
  it("fără zonă → Sectorul N", () => {
    const { row } = run({ city: "BUCUREŞTI sector 2", district: null });
    expect(row!["address.city"]).toBe("București");
    expect(row!["neighborhood[0]"]).toBe("Sectorul 2");
  });
  it("Bucuresti și Sector 3", () => {
    expect(run({ city: "Bucuresti" }).row!["address.city"]).toBe("București");
    const s3 = run({ city: "Sector 3", district: null }).row!;
    expect(s3["address.city"]).toBe("București");
    expect(s3["neighborhood[0]"]).toBe("Sectorul 3");
  });
  it("alte orașe păstrate, cu diacritice normalizate", () => {
    expect(run({ city: "Cluj-Napoca", county: "Cluj" }).row!["address.city"]).toBe("Cluj-Napoca");
    expect(run({ city: "Chiajna", county: "Ilfov" }).row!["address.city"]).toBe("Chiajna");
    const t = run({ city: "Târgu Mureş", county: "Mureş", district: "Ţiglina" }).row!;
    expect(t["address.city"]).toBe("Târgu Mureș");
    expect(t["address.region"]).toBe("Mureș");
    expect(t["neighborhood[0]"]).toBe("Țiglina");
  });
  it("oraș gol rămâne exclus", () => {
    expect(run({ city: "  " }).r.excluded.no_city).toBe(1);
  });
});
