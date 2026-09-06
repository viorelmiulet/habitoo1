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


/** Parser CSV minimal (RFC 4180) folosit doar în teste. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

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
    const cells = parseCsvLine(row);
    expect(cells).toHaveLength(IMOVE_CSV_HEADER.length);
  });
});

describe("CSV iMove — valori", () => {
  it("numerele sunt trimise fără ghilimele", () => {
    const cells = parseCsvLine(imoveCsvRow(base));
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
    const cells = parseCsvLine(imoveCsvRow(base));
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
    expect(parseCsvLine(imoveCsvRow(base))[0]).toBe(parseCsvLine(imoveCsvRow({ ...base, price: 1 }))[0]);
  });

  it("city/district folosesc valorile canonice publicabile", () => {
    const cells = parseCsvLine(imoveCsvRow(base));
    expect(cells[7]).toBe("cluj-napoca");
    expect(cells[8]).toBe("gheorgheni");
  });
});

describe("conformitate cu exemplul oficial iMove", () => {
  const official = readFileSync(
    new URL("./__fixtures__/imove-feed-example.csv", import.meta.url),
    "utf-8",
  );

  it("headerul nostru este identic caracter-cu-caracter cu exemplul oficial", () => {
    const officialHeader = official.split(/\r?\n/)[0];
    expect(IMOVE_CSV_HEADER.join(",")).toBe(officialHeader);
    expect(IMOVE_CSV_HEADER).toHaveLength(19);
  });

  it("exemplul oficial folosește `;` pentru imageUrls și lasă numericele lipsă goale", () => {
    expect(official).toContain("cover.jpg;https://");
    expect(official).toContain(",140,,,2023,");
  });
});
