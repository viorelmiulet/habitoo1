import { describe, expect, it } from "vitest";
import { publicCoords } from "@/lib/geo";
import { mapPropertyToFeed, type PropertyRow } from "./mapper";
import { mapPartnerListing } from "@/lib/partner-api/schema";
import { kyeroDocument, kyeroProperties } from "@/lib/portals/bazaruldecase/kyero";
import { advertToXml, mapPropertyToProperstar } from "@/lib/portals/properstar/mapper";

const property = {
  id: "11111111-1111-4111-8111-111111111111", organization_id: "agency", reference: "HB-1088",
  title: "Apartament fictiv", description: "Descriere publică", property_type: "apartment",
  transaction_kind: "sale", for_sale: true, for_rent: false, price: 100000, currency: "EUR",
  status: "active", publish_status: "published", features: [],
  city: "București", county: "București", district: "Sector 1", postal_code: "010101",
  address: "Strada Privată 123", street: "Strada Privată", street_number: "123",
  lat: 44.481234, lng: 26.091234, location_precise: false,
} as unknown as PropertyRow;
const baseUrl = "https://www.habitoo.ro";

describe("F2 — address privacy across public feeds", () => {
  it.each([false, null, undefined])("JSON hides address, street and number when precision is %s", precision => {
    const row = { ...property, location_precise: precision } as PropertyRow;
    const feed = mapPropertyToFeed(row, { baseUrl });
    expect(feed.adresa).toBeNull();
    expect(feed.strada).toBeNull();
    expect(feed.numarstradal).toBeNull();
    const coords = publicCoords(row);
    expect(coords).not.toBeNull();
    expect(feed.latitudine).toBe(coords?.lat);
    expect(feed.longitudine).toBe(coords?.lng);
    expect([feed.latitudine, feed.longitudine]).not.toEqual([row.lat, row.lng]);
    const partner = mapPartnerListing(row, [], baseUrl);
    expect(partner.location.street).toBeNull();
    expect(partner.location.street_number).toBeNull();
    expect([partner.location.latitude, partner.location.longitude]).toEqual([feed.latitudine, feed.longitudine]);
    expect(JSON.stringify(feed)).not.toContain("Strada Privată");
  });

  it.each([false, true])("Kyero and Properstar use site coordinates, precision %s", precise => {
    const row = { ...property, location_precise: precise };
    const coords = publicCoords(row);
    const xml = kyeroDocument(kyeroProperties({ property: row, images: [], agent: null, coords }).xml);
    expect(xml).toContain(`<latitude>${coords?.lat}</latitude>`);
    expect(xml).toContain(`<longitude>${coords?.lng}</longitude>`);
    // Kyero has no street/number fields, including for precise locations.
    expect(xml).not.toContain("Strada Privată");
    expect(xml).not.toMatch(/<(?:street|street_number|address)>/);
    const result = mapPropertyToProperstar(row, {
      baseUrl, publicSiteUrl: baseUrl, status: "Active",
      office: { officeId: "agency", officeName: "Agenție fictivă", email: null, phone: null, website: null, address: null, postalCode: null, city: "București", logo: null },
      agent: { agentId: "agent", firstName: "Agent", lastName: "Fictiv", email: "agent@example.com", mobilePhone: null, landPhone: null, photo: null },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.missing.join(", "));
    expect(result.advert.latitude).toBe(coords?.lat);
    expect(result.advert.longitude).toBe(coords?.lng);
    expect(result.advert.address).toBe(precise ? row.address : null);
    expect(result.advert.showAddress).toBe(precise);
    const properstarXml = advertToXml(result.advert);
    if (precise) expect(properstarXml).toContain(`<Address>${row.address}</Address>`);
    else expect(properstarXml).not.toContain("<Address>");
  });

  it("precise JSON preserves the original address and coordinates", () => {
    const row = { ...property, location_precise: true };
    const feed = mapPropertyToFeed(row, { baseUrl });
    expect([feed.adresa, feed.strada, feed.numarstradal]).toEqual([row.address, row.street, row.street_number]);
    expect([feed.latitudine, feed.longitudine]).toEqual([row.lat, row.lng]);
  });
});