import { describe, expect, it } from "vitest";
import { hbsyncMarketListingSchema, normalizeHbsyncMarketListing } from "./hbsync";
import { enrichInputHash, type EnrichInputListing } from "@/lib/acp/enrichment";
import { marketReportDescription } from "@/lib/acp/report/photos";
import { ACP_REPORT_FEATURE_ROWS } from "@/lib/acp/report/model";

const base = {
  source: "storia", external_id: "d-1", title: "Apartament 2 camere Militari",
  deal_type: "sale", property_type: "apartment", price: 90000, currency: "EUR",
  surface_built: 52, rooms: 2, city: "București",
};

describe("hbsync: descriere, etaj, an construcție", () => {
  it("câmpurile noi sunt opționale", () => {
    const r = normalizeHbsyncMarketListing(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.listing.description).toBeNull();
      expect(r.listing.floor).toBeNull();
      expect(r.listing.constructionYear).toBeNull();
    }
  });

  it("valori valide sunt păstrate", () => {
    const r = normalizeHbsyncMarketListing({ ...base, description: "Bloc nou, finisat.", floor: -3, year_built: 2021 });
    expect(r.ok && r.listing).toMatchObject({ description: "Bloc nou, finisat.", floor: -3, constructionYear: 2021 });
  });

  it("valori invalide devin null fără respingere", () => {
    const parsed = hbsyncMarketListingSchema.parse({ ...base, description: "x".repeat(3001), floor: 81, year_built: 1799 });
    expect([parsed.description, parsed.floor, parsed.year_built]).toEqual([null, null, null]);
    const r = normalizeHbsyncMarketListing({ ...base, floor: 2.5, year_built: "2001" });
    expect(r.ok && [r.listing.floor, r.listing.constructionYear]).toEqual([null, null]);
  });

  it("descrierea este redactată la import", () => {
    const r = normalizeHbsyncMarketListing({
      ...base,
      description: "Contact: Ion Popescu 0722 123 456, ion@test.ro, vezi https://x.ro/a. Etaj 3.",
    });
    expect(r.ok).toBe(true);
    const d = r.ok ? r.listing.description ?? "" : "";
    expect(d).not.toMatch(/Popescu|0722|ion@test|https/);
    expect(d).toContain("[telefon]");
    expect(d).toContain("Etaj 3.");
  });
});

describe("îmbogățire: input_hash", () => {
  it("se schimbă când apare descrierea", () => {
    const l: EnrichInputListing = {
      id: "1", title: "Apartament", property_type: "apartament", transaction_type: "sale",
      price: 1, currency: "EUR", usable_area: 50, rooms: 2, floor: 1,
    };
    expect(enrichInputHash({ ...l, description: "Bloc 2020, finisat" })).not.toBe(enrichInputHash(l));
  });
});

describe("snapshot raport: fragment și băi", () => {
  it("fragment redactat de ~600 caractere", () => {
    const text = `Sună la 0722123456. ${"cuvânt ".repeat(200)}`;
    const out = marketReportDescription(text) ?? "";
    expect(out).not.toContain("0722123456");
    expect(out.length).toBeLessThanOrEqual(601);
    expect(out.length).toBeGreaterThan(500);
    expect(marketReportDescription(null)).toBeNull();
  });

  it("rândul Băi apare doar cu valoare", () => {
    const row = ACP_REPORT_FEATURE_ROWS.find((r) => r.label === "Băi")!;
    expect(row.value({ bathrooms: 2 })).toBe("2");
    expect(row.value({ bathrooms: null })).toBe("—");
  });
});
