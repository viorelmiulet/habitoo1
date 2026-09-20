/**
 * Teste pentru adaptorul Imospot: construirea adresei, citirea structurii reale
 * a paginii (`<article data-listing-id data-lat data-lon>`), eliminarea
 * rezultatelor fără preț sau suprafață, cartierele învățate din linkurile
 * paginii, blocul de cifre publicate, plafonul de două pagini și timeout-ul
 * consemnat fără a opri analiza.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { marketQueryCriteria } from "./criteria";
import { createImospotAdapter, IMOSPOT_SOURCE_KEY } from "./imospot/adapter.server";
import {
  learnImospotNeighborhoods,
  resetImospotNeighborhoods,
  resolveImospotLocation,
} from "./imospot/locations";
import {
  parseImospotListings,
  parseImospotMarketContext,
  parseImospotNeighborhoods,
  imospotRelativeDate,
} from "./imospot/parse";
import { buildImospotSearchUrl } from "./imospot/url";
import {
  registerMarketQueryAdapter,
  resetMarketQueryAdapters,
  type MarketQuerySourceConfig,
} from "./port";
import { querySingleSource } from "./run.server";
import { marketQueryCacheClear } from "./session-cache";

const FIXTURE = readFileSync(
  join(process.cwd(), "src/lib/acp/market-query/imospot/fixtures/results-bucuresti.html"),
  "utf8",
);

const source: MarketQuerySourceConfig = {
  key: IMOSPOT_SOURCE_KEY,
  label: "Imospot.ro",
  baseUrl: "https://www.imospot.ro",
  enabled: true,
  timeoutMs: 4000,
  radiusKm: 5,
  priceBandPercent: 40,
};

function criteriaFor(subject: Record<string, unknown>) {
  return marketQueryCriteria(subject as never, {
    radiusKm: source.radiusKm,
    priceBandPercent: source.priceBandPercent,
  });
}

function url(subject: Record<string, unknown>, page = 1): string {
  const criteria = criteriaFor(subject);
  const location = resolveImospotLocation({ city: criteria.city, zone: criteria.zone });
  expect(location).not.toBeNull();
  return buildImospotSearchUrl({ baseUrl: source.baseUrl, location: location!, criteria, page });
}

describe("Imospot — adresa de căutare", () => {
  it("mapează fiecare tip de proprietate la categoria sursei, pentru vânzare", () => {
    const expected: Record<string, string> = {
      apartment: "apartamente-de-vanzare",
      studio: "apartamente-de-vanzare",
      house: "case-vile-de-vanzare",
      land: "terenuri-de-vanzare",
      commercial: "birouri-si-spatii-comerciale-de-vanzare",
      office: "birouri-si-spatii-comerciale-de-vanzare",
      industrial: "hale-si-depozite-de-vanzare",
    };
    for (const [propertyType, slug] of Object.entries(expected)) {
      const built = url({ city: "București", propertyType, transactionType: "sale" });
      expect(built).toContain("/toate-ofertele-din-bucuresti");
      expect(built).toContain("tranzactie=vanzari");
      expect(built).toContain(`categorie=${slug}`);
      expect(built).toContain("sort=-cele-mai-noi");
    }
  });

  it("mapează fiecare tip de proprietate la categoria de închiriere", () => {
    const expected: Record<string, string> = {
      apartment: "apartamente-de-inchiriat",
      studio: "apartamente-de-inchiriat",
      house: "case-vile-de-inchiriat",
      land: "terenuri-de-inchiriat",
      commercial: "birouri-si-spatii-comerciale-de-inchiriat",
      office: "birouri-si-spatii-comerciale-de-inchiriat",
      industrial: "hale-si-depozite-de-inchiriat",
    };
    for (const [propertyType, slug] of Object.entries(expected)) {
      const built = url({ city: "București", propertyType, transactionType: "rent" });
      expect(built).toContain("tranzactie=inchirieri");
      expect(built).toContain(`categorie=${slug}`);
    }
  });

  it("folosește slug-ul de sector când zona este un sector", () => {
    const built = url({
      city: "București",
      district: "Sector 6",
      propertyType: "apartment",
      transactionType: "sale",
    });
    expect(built).toContain("/toate-ofertele-din-sectorul-6-bucuresti");
  });

  it("coboară la nivelul orașului pentru o zonă necunoscută, fără a ghici slug-ul", () => {
    const criteria = criteriaFor({ city: "București", neighborhood: "Zonă inventată" });
    const location = resolveImospotLocation({ city: criteria.city, zone: criteria.zone });
    expect(location?.path).toBe("/toate-ofertele-din-bucuresti");
    expect(location?.zoneFallback).toBe(true);
  });

  it("nu întoarce nicio adresă pentru o localitate fără corespondent", () => {
    expect(resolveImospotLocation({ city: "Localitate inexistentă", zone: null })).toBeNull();
  });

  it("trimite doar restricțiile pe care le impunem și paginează de la pagina 2", () => {
    const built = url(
      { city: "București", propertyType: "apartment", transactionType: "sale", rooms: 3 },
      2,
    );
    expect(built).toContain("rooms=3");
    expect(built).toContain("page=2");
    expect(built).not.toContain("bai=");
    expect(built).not.toContain("city_id=");
    expect(url({ city: "București" })).not.toContain("page=");
  });
});

describe("Imospot — cartierele publicate de pagină", () => {
  beforeEach(() => {
    resetImospotNeighborhoods();
  });

  it("colectează slug-urile de cartier din linkurile paginii", () => {
    const found = parseImospotNeighborhoods(FIXTURE);
    expect(found.map((n) => n.slug)).toEqual(["militari", "domenii", "rahova", "berceni"]);
    expect(found.every((n) => n.citySlug === "bucuresti")).toBe(true);
    expect(found[0]!.label).toBe("Militari");
  });

  it("fără cartiere învățate nu se ghicește nicio cale de cartier", () => {
    const criteria = criteriaFor({ city: "București", neighborhood: "Militari" });
    const before = resolveImospotLocation({ city: criteria.city, zone: criteria.zone });
    expect(before?.path).toBe("/toate-ofertele-din-bucuresti");
    expect(before?.zoneFallback).toBe(true);
  });

  it("folosește calea de cartier după ce a învățat-o din pagină", () => {
    learnImospotNeighborhoods(parseImospotNeighborhoods(FIXTURE));
    const criteria = criteriaFor({ city: "București", neighborhood: "Militari" });
    const after = resolveImospotLocation({ city: criteria.city, zone: criteria.zone });
    expect(after?.path).toBe("/toate-ofertele-din-bucuresti/militari");
    expect(after?.level).toBe("neighborhood");
    expect(after?.zoneFallback).toBe(false);
    expect(after?.neighborhoodId).toBeNull();
  });
});

describe("Imospot — citirea paginii", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");

  it("citește identificatorul, coordonatele și câmpurile fiecărui card", () => {
    const listings = parseImospotListings(FIXTURE, now);
    // Două carduri sunt aruncate: unul fără preț, unul fără suprafață.
    expect(listings).toHaveLength(4);

    const first = listings[0]!;
    expect(first.listingId).toBe("21765");
    expect(first.latitude).toBeCloseTo(44.4267674, 6);
    expect(first.longitude).toBeCloseTo(26.1025384, 6);
    expect(first.url).toBe(
      "https://www.imospot.ro/anunturi/vanzari/apartamente-de-vanzare/sector-1/apartament-2-camere-domenii-21765",
    );
    expect(first.title).toBe("Apartament 2 camere, Domenii, bloc reabilitat");
    expect(first.price).toBe(99000);
    expect(first.currency).toBe("EUR");
    expect(first.monthly).toBe(false);
    expect(first.rooms).toBe(2);
    expect(first.area).toBe(50);
    expect(first.zone).toBe("Sector 1");
    expect(first.locality).toBe("București");
    expect(first.agency).toBe("Imobiliare Domenii SRL");
    expect(first.ageText).toBe("azi");
    expect(first.listedAt).toBe("2026-09-20T12:00:00.000Z");

    const second = listings[1]!;
    expect(second.area).toBe(82.5);
    expect(second.listedAt).toBe("2026-09-19T12:00:00.000Z");

    const rent = listings.find((l) => l.listingId === "20911")!;
    expect(rent.monthly).toBe(true);
    expect(rent.price).toBe(450);
    expect(rent.ageText).toBe("o lună");
    expect(rent.listedAt).toBe("2026-08-21T12:00:00.000Z");
  });

  it("tratează coordonatele ca fiind la nivel de zonă, nu de clădire", () => {
    const listings = parseImospotListings(FIXTURE, now);
    const shared = listings.filter((l) => l.latitude === 44.4267674);
    expect(shared.length).toBeGreaterThan(1);
  });

  it("transformă vechimea relativă în dată", () => {
    expect(imospotRelativeDate("azi", now)).toBe("2026-09-20T12:00:00.000Z");
    expect(imospotRelativeDate("ieri", now)).toBe("2026-09-19T12:00:00.000Z");
    expect(imospotRelativeDate("2 zile", now)).toBe("2026-09-18T12:00:00.000Z");
    expect(imospotRelativeDate("o lună", now)).toBe("2026-08-21T12:00:00.000Z");
    expect(imospotRelativeDate("acum ceva vreme", now)).toBeNull();
  });

  it("aruncă rezultatele fără preț sau fără suprafață", () => {
    const listings = parseImospotListings(FIXTURE, now);
    const ids = listings.map((l) => l.listingId);
    // 19003 nu are preț („Preț la cerere"), 18740 nu are suprafață.
    expect(ids).not.toContain("19003");
    expect(ids).not.toContain("18740");
  });

  it("citește blocul de cifre publicate separat de comparabile", () => {
    const context = parseImospotMarketContext(FIXTURE);
    expect(context).not.toBeNull();
    expect(context!.cityLabel).toBe("București");
    expect(context!.activeListings).toBe(18402);
    expect(context!.medianPricePerSqm).toBe(2350);
    expect(context!.medianPrice).toBe(115000);
    expect(context!.medianRent).toBe(520);
    expect(context!.rentListings).toBe(3184);
    expect(context!.timeOnMarketText).toBe("4 luni");
    expect(context!.byRooms.length).toBeGreaterThan(0);
    expect(context!.byType.length).toBeGreaterThan(0);
    expect(context!.note).toContain("nu din tranzacții încheiate");
    // Cifrele sursei nu apar între comparabilele citite.
    expect(parseImospotListings(FIXTURE, now).some((l) => l.price === context!.medianPrice)).toBe(
      false,
    );
  });
});

describe("Imospot — interogarea", () => {
  beforeEach(() => {
    resetMarketQueryAdapters();
    resetImospotNeighborhoods();
    marketQueryCacheClear();
  });

  const page = (count: number, offset = 0) =>
    Array.from({ length: count })
      .map(
        (_, i) =>
          `<article data-listing-id="${offset + i}" data-lat="44.43" data-lon="26.04"><a href="/anunturi/vanzari/apartamente-de-vanzare/bucuresti/x-${offset + i}"></a><h3>Ofertă</h3><p class="leading-none">100.000 €</p><span class="truncate">Sector 6, București</span><span class="inline-flex items-center gap-1.5">2 camere</span><span class="inline-flex items-center gap-1.5">55 m²</span><span class="truncate font-medium">Agenție</span><span class="shrink-0">azi</span></article>`,
      )
      .join("");

  it("cere cel mult două pagini", async () => {
    const urls: string[] = [];
    const adapter = createImospotAdapter({
      fetchPage: async (u) => {
        urls.push(u);
        return { url: u, status: 200, body: page(1, urls.length * 10), error: null };
      },
    });
    const result = await adapter.query({
      criteria: criteriaFor({ city: "București", propertyType: "apartment", transactionType: "sale" }),
      source,
      signal: new AbortController().signal,
    });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("page=2");
    expect(Array.isArray(result) ? result : result.items).toHaveLength(2);
  });

  it("se oprește după prima pagină când are destule comparabile", async () => {
    const urls: string[] = [];
    const adapter = createImospotAdapter({
      fetchPage: async (u) => {
        urls.push(u);
        return { url: u, status: 200, body: page(12), error: null };
      },
    });
    await adapter.query({
      criteria: criteriaFor({ city: "București", propertyType: "apartment", transactionType: "sale" }),
      source,
      signal: new AbortController().signal,
    });
    expect(urls).toHaveLength(1);
  });

  it("consemnează timeout-ul fără să arunce", async () => {
    registerMarketQueryAdapter(
      createImospotAdapter({
        fetchPage: (u) =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ url: u, status: 200, body: page(1), error: null }), 5000);
          }),
      }),
    );
    const result = await querySingleSource({
      source: { ...source, timeoutMs: 500 },
      criteria: criteriaFor({ city: "București", propertyType: "apartment", transactionType: "sale" }),
    });
    expect(result.outcome.outcome).toBe("timeout");
    expect(result.comparables).toHaveLength(0);
    expect(result.outcome.detail).toContain("500");
  });

  it("consemnează refuzul sursei ca eroare, nu ca excepție", async () => {
    registerMarketQueryAdapter(
      createImospotAdapter({
        fetchPage: async (u) => ({ url: u, status: 429, body: null, error: null }),
      }),
    );
    const result = await querySingleSource({
      source,
      criteria: criteriaFor({ city: "București", propertyType: "apartment", transactionType: "sale" }),
    });
    expect(result.outcome.outcome).toBe("error");
    expect(result.outcome.detail).toContain("429");
  });

  it("întoarce comparabile cu coordonate, cifrele publicate și adresele cerute", async () => {
    registerMarketQueryAdapter(
      createImospotAdapter({
        fetchPage: async (u) => ({ url: u, status: 200, body: FIXTURE, error: null }),
      }),
    );
    const result = await querySingleSource({
      source,
      criteria: criteriaFor({ city: "București", propertyType: "apartment", transactionType: "sale" }),
    });
    expect(result.outcome.outcome).toBe("answered");
    expect(result.comparables.length).toBeGreaterThan(0);
    expect(result.comparables[0]!.latitude).toBeCloseTo(44.4267674, 6);
    expect(result.comparables[0]!.longitude).toBeCloseTo(26.1025384, 6);
    expect(result.marketContext?.title).toContain("Imospot");
    expect(result.marketContext?.lines.length).toBeGreaterThan(0);
    expect(result.requestedUrls[0]).toContain("/toate-ofertele-din-bucuresti");
  });

  it("învață cartierele din pagina interogată", async () => {
    const adapter = createImospotAdapter({
      fetchPage: async (u) => ({ url: u, status: 200, body: FIXTURE, error: null }),
    });
    await adapter.query({
      criteria: criteriaFor({ city: "București", propertyType: "apartment", transactionType: "sale" }),
      source,
      signal: new AbortController().signal,
    });
    expect(resolveImospotLocation({ city: "București", zone: "Berceni" })?.path).toBe(
      "/toate-ofertele-din-bucuresti/berceni",
    );
  });
});
