import { describe, expect, it } from "vitest";
import {
  extractBucharestSector,
  mapPropertyToRomimo,
  type RomimoMapperContext,
  type RomimoMapperProperty,
} from "../romimo/mapper";

const NOW = new Date("2026-09-22T05:36:00.000Z");

function images(count: number, patch: Partial<RomimoMapperProperty["images"][number]> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `img-${index + 1}`,
    includeInPublish: true,
    isConfidential: false,
    rank: index + 1,
    ...patch,
  }));
}

const baseProperty: RomimoMapperProperty = {
  id: "p-1",
  reference: "HB-1009",
  propertyType: "apartment",
  transactionKind: "sale",
  rooms: 2,
  title: "Apartament 2 camere Militari",
  description:
    "Apartament decomandat, situat la etajul 2, cu vedere spre bulevard, aproape de metrou și de centru comercial.",
  price: 55_000,
  currency: "EUR",
  salePrice: null,
  saleCurrency: null,
  county: "Bucureşti",
  city: "Bucureşti Sectorul 6",
  district: "Militari",
  lat: 44.435,
  lng: 26.02,
  assignedTo: "agent-1",
  usableSurface: 52,
  builtSurface: 120,
  landSurface: 300,
  surface: 58,
  floor: 1,
  layout: "Decomandat",
  buildYear: 1985,
  heatingSystems: ["Centrală proprie", "Încălzire pardoseală"],
  images: images(3),
};

const baseContext: RomimoMapperContext = {
  agent: { fullName: "Marius Grigore", email: "marius@example.com", phone: "+40727151461" },
  organization: { phone: "0212345678", materialPhone: "0700000001" },
  publicBaseUrl: "https://crm.habitoo.ro",
  now: NOW,
};


describe("mapPropertyToRomimo", () => {
  it("mapează o ofertă completă într-un DTO corect", async () => {
    const result = await mapPropertyToRomimo(baseProperty, baseContext);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dto.ad).toMatchObject({
      active: true,
      promoted: false,
      externalid: "HB-1009",
      category: 338,
      price: 55_000,
      currency: "EUR",
      title: baseProperty.title,
      validFrom: NOW.toISOString(),
    });
    const validTo = new Date(result.dto.ad?.validTo as string);
    expect(validTo.getMonth()).toBe((NOW.getMonth() + 12) % 12);
    expect(result.dto.location).toMatchObject({
      countyName: "Bucureşti",
      cityName: "sector 6",
      areaName: "Militari",
      latitude: 44.435,
      longitude: 26.02,
    });
    expect(result.dto.contact).toMatchObject({
      contactName: "Marius Grigore",
      contactEmail: "marius@example.com",
      contactPhone: "+40727151461",
    });
    expect(result.dto.properties).toEqual([
      { key: "livingspace", value: "52" },
      { key: "roomno", value: "2 camere" },
      { key: "yearofbuilding", value: "1985" },
      { key: "storey", value: "Etaj 1" },
      { key: "resfeatures", value: "Decomandat" },
    ]);
    expect(result.dto.pictures).toEqual([
      { url: "https://crm.habitoo.ro/api/public/sites/v1/media/img-1", rank: 1 },
      { url: "https://crm.habitoo.ro/api/public/sites/v1/media/img-2", rank: 2 },
      { url: "https://crm.habitoo.ro/api/public/sites/v1/media/img-3", rank: 3 },
    ]);

  });

  it("generează referința când lipsește, fără să respingă oferta", async () => {
    const result = await mapPropertyToRomimo(
      { ...baseProperty, reference: null },
      { ...baseContext, generateReference: async () => "HB-1010" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dto.ad?.externalid).toBe("HB-1010");
  });

  it("extrage sectorul din „Bucureşti Sectorul 6“, tolerant la diacritice", async () => {
    for (const city of ["Bucureşti Sectorul 6", "Bucuresti sector 5", "București Sectorul 3"]) {
      const result = await mapPropertyToRomimo({ ...baseProperty, city }, baseContext);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.dto.location?.cityName).toMatch(/^sector [1-6]$/);
    }
  });

  it("respinge oferta fără descriere", async () => {
    const result = await mapPropertyToRomimo({ ...baseProperty, description: null }, baseContext);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("descriere");
  });

  it("respinge tipurile de proprietate neacceptate (teren)", async () => {
    const result = await mapPropertyToRomimo(
      { ...baseProperty, propertyType: "land" },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("neacceptat încă");
  });

  it("respinge când nu există niciun telefon de contact", async () => {
    const result = await mapPropertyToRomimo(baseProperty, {
      ...baseContext,
      agent: { fullName: "Marius Grigore", email: "marius@example.com", phone: null },
      organization: { phone: null, materialPhone: null },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("telefon");
  });

  it("folosește telefonul agenției ca fallback", async () => {
    const result = await mapPropertyToRomimo(baseProperty, {
      ...baseContext,
      agent: { fullName: "Marius Grigore", email: "marius@example.com", phone: null },
      organization: { phone: "0212345678", materialPhone: null },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dto.contact?.contactPhone).toBe("0212345678");
  });

  it("respinge titlul peste 100 de caractere", async () => {
    const result = await mapPropertyToRomimo(
      { ...baseProperty, title: "T".repeat(200) },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("100");
  });

  it("respinge Bucureștiul fără sector identificabil", async () => {
    const result = await mapPropertyToRomimo(
      { ...baseProperty, city: "Bucureşti" },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toContain("sector");
  });

  it("mapează categoriile: garsonieră 343, casă vânzare 347, închiriere apartament 313, casă închiriere 44", async () => {
    const cases: [Partial<RomimoMapperProperty>, number][] = [
      [{ rooms: 0 }, 343],
      [{ propertyType: "house" }, 347],
      [{ transactionKind: "rent", rooms: 2 }, 313],
      [{ propertyType: "house", transactionKind: "rent" }, 44],
      [{ rooms: 7 }, 342],
    ];
    for (const [patch, expected] of cases) {
      const result = await mapPropertyToRomimo({ ...baseProperty, ...patch }, baseContext);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.dto.ad?.category).toBe(expected);
    }
  });

  it("trunchiază descrierea peste 10.000 de caractere fără respingere", async () => {
    const result = await mapPropertyToRomimo(
      { ...baseProperty, description: "D".repeat(12_000) },
      baseContext,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.dto.ad?.text as string).length).toBe(10_000);
      expect(result.warnings.join(" ")).toContain("trunchiată");
    }
  });

  it("adună toate motivele de respingere, nu doar primul", async () => {
    const result = await mapPropertyToRomimo(
      { ...baseProperty, title: null, description: null, propertyType: "land" },
      baseContext,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("preferă sale_price/sale_currency când există", async () => {
    const result = await mapPropertyToRomimo(
      { ...baseProperty, price: 50_000, salePrice: 55_500.4, saleCurrency: "eur" },
      baseContext,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.ad?.price).toBe(55_500);
      expect(result.dto.ad?.currency).toBe("EUR");
    }
  });
});

describe("extractBucharestSector", () => {
  it("recunoaște variantele cu/fără diacritice", () => {
    expect(extractBucharestSector("Bucureşti Sectorul 6")).toBe(6);
    expect(extractBucharestSector("Bucuresti Sector 2")).toBe(2);
    expect(extractBucharestSector("sectorul 1")).toBe(1);
    expect(extractBucharestSector("Bucureşti")).toBeNull();
    expect(extractBucharestSector(null)).toBeNull();
  });
});
