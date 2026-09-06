import { describe, expect, it } from "vitest";
import {
  IMOVE_CSV_HEADER,
  imoveCsvDocument,
  imoveCsvEscape,
  imoveCsvImageUrls,
  imoveCsvRow,
} from "./csv";
import type { ImoveListing } from "./mapper";

/** Headerul oficial din exemplul CSV iMove, byte-for-byte. */
const OFFICIAL_HEADER =
  "externalId,title,description,price,currency,transactionType,propertyType,city,district,addressPublic,rooms,bathrooms,usableArea,floor,totalFloors,constructionYear,agentPhone,agentEmail,imageUrls";

const base: ImoveListing = {
  externalId: "RF-1004",
  title: "Apartament 2 camere",
  description: "Luminos, complet mobilat.",
  price: 89000,
  currency: "EUR",
  transactionType: "SALE",
  propertyType: "APARTMENT",
  citySlug: "cluj-napoca",
  districtSlug: "gheorgheni",
  addressPublic: "Strada Bucegi",
  rooms: 2,
  bathrooms: 1,
  usableArea: 54,
  floor: 3,
  totalFloors: 8,
  constructionYear: 2019,
  imageUrls: ["https://cdn.test/cover.jpg", "https://cdn.test/living.jpg"],
  agentPhone: "+40712345678",
  agentEmail: "agent@habitoo.ro",
  url: "https://habitoo.ro/oferta/1",
  updatedAt: "2026-09-06T00:00:00.000Z",
};

describe("CSV iMove — structură", () => {
  it("headerul are exact coloanele, numărul și ordinea oficiale", () => {
    expect(IMOVE_CSV_HEADER.join(",")).toBe(OFFICIAL_HEADER);
    expect(IMOVE_CSV_HEADER).toHaveLength(19);
  });

  it("prima linie a documentului este headerul, separator virgulă, linii CRLF", () => {
    const doc = imoveCsvDocument([base]);
    const lines = doc.split("\r\n");
    expect(lines[0]).toBe(OFFICIAL_HEADER);
    expect(doc.endsWith("\r\n")).toBe(true);
    expect(lines[1]?.split(",")[0]).toBe("RF-1004");
  });

  it("fiecare linie are același număr de coloane ca headerul", () => {
    const row = imoveCsvRow(base);
    // Parsare CSV simplă respectând ghilimelele.
    const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.slice(0, -1);
    expect(cells).toHaveLength(IMOVE_CSV_HEADER.length);
  });
});

describe("CSV iMove — valori", () => {
  it("numerele sunt trimise fără ghilimele", () => {
    const cells = imoveCsvRow(base).split(",");
    expect(cells[3]).toBe("89000");
    expect(cells[10]).toBe("2");
  });

  it("câmpurile numerice absente rămân goale, fără valori inventate", () => {
    const row = imoveCsvRow({
      ...base,
      rooms: null,
      bathrooms: null,
      usableArea: null,
      floor: null,
      totalFloors: null,
      constructionYear: 2023,
    });
    expect(row).toContain(",2023,");
    expect(row).toContain(",,,,,2023,");
  });

  it("enum-urile folosesc doar valorile documentate", () => {
    const cells = imoveCsvRow(base).split(",");
    expect(["SALE", "RENT"]).toContain(cells[5]);
    expect(["APARTMENT", "STUDIO", "HOUSE", "LAND", "COMMERCIAL", "OFFICE"]).toContain(cells[6]);
  });

  it("escapează virgula, ghilimelele și newline conform CSV standard", () => {
    expect(imoveCsvEscape("Apartament, 2 camere")).toBe('"Apartament, 2 camere"');
    expect(imoveCsvEscape('Zona "centrala"')).toBe('"Zona ""centrala"""');
    expect(imoveCsvEscape("Linia 1\nLinia 2")).toBe('"Linia 1\nLinia 2"');
    expect(imoveCsvEscape("simplu")).toBe("simplu");
    expect(imoveCsvEscape(null)).toBe("");
  });

  it("imageUrls este un singur câmp, separat prin `;`, doar HTTPS, maximum 40", () => {
    const many = Array.from({ length: 45 }, (_, i) => `https://cdn.test/${i}.jpg`);
    const joined = imoveCsvImageUrls([...many, "http://nesigur.test/x.jpg"]);
    expect(joined.split(";")).toHaveLength(40);
    expect(joined).not.toContain("http://");

    const row = imoveCsvRow({ ...base, imageUrls: many });
    // Câmpul conține `;`, nu virgulă, deci nu este încadrat în ghilimele.
    expect(row.endsWith(many.slice(0, 40).join(";"))).toBe(true);
  });

  it("externalId rămâne stabil între generări succesive", () => {
    expect(imoveCsvRow(base).split(",")[0]).toBe(imoveCsvRow({ ...base, price: 1 }).split(",")[0]);
  });

  it("city/district folosesc valorile canonice publicabile", () => {
    const cells = imoveCsvRow(base).split(",");
    expect(cells[7]).toBe("cluj-napoca");
    expect(cells[8]).toBe("gheorgheni");
  });
});
