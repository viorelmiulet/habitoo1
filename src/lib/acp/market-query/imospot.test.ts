/**
 * Teste pentru adaptorul Imospot: construirea adresei, citirea unei pagini
 * reale salvate ca fixture, eliminarea rezultatelor fără preț sau suprafață,
 * blocul de cifre publicate, plafonul de două pagini și timeout-ul consemnat
 * fără a opri analiza.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { marketQueryCriteria } from "./criteria";
import { createImospotAdapter, IMOSPOT_SOURCE_KEY } from "./imospot/adapter.server";
import { resolveImospotLocation } from "./imospot/locations";
import { parseImospotListings, parseImospotMarketContext, imospotRelativeDate } from "./imospot/parse";
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

  it("folosește calea de cartier pentru un cartier confirmat", () => {
    const built = url({
      city: "București",
      neighborhood: "Militari",
      propertyType: "apartment",
      transactionType: "sale",
    });
    expect(built).toContain("/toate-ofertele-din-bucuresti/militari");
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

describe("Imospot — citirea paginii", () => {
  it("citește camerele, suprafața, prețul, agenția și vechimea din fixture-ul real", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    const listings = parseImospotListings(FIXTURE, now);
    expect(listings.length).toBe(12);
    const first = listings[0]!;
    expect(first.url).toContain("https://www.imospot.ro/anunturi/");
    expect(first.price).toBeGreaterThan(1000);
    expect(first.currency).toBe("EUR");
    expect(first.area).toBeGreaterThan(10);
    expect(first.rooms).toBeGreaterThan(0);
    expect(first.agency).toBeTruthy();
    expect(first.ageText).toBeTruthy();
    expect(first.listedAt).toBeTruthy();
    const sector = listings.find((l) => l.zone?.toLowerCase().startsWith("sector"));
    expect(sector?.locality).toBeTruthy();
  });

  it("transformă vechimea relativă în dată", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    expect(imospotRelativeDate("azi", now)).toBe("2026-09-20T12:00:00.000Z");
    expect(imospotRelativeDate("ieri", now)).toBe("2026-09-19T12:00:00.000Z");
    expect(imospotRelativeDate("2 zile", now)).toBe("2026-09-18T12:00:00.000Z");
    expect(imospotRelativeDate("acum ceva vreme", now)).toBeNull();
  });

  it("aruncă rezultatele fără preț sau fără suprafață", () => {
    const card = (body: string) => `<article data-listing-id="1">${body}</article>`;
    const withoutPrice = card(
      `<h3>Fără preț</h3><div class="mt-3 flex items-center gap-4 text-sm"><span>3 camere</span><span>70 m²</span></div>`,
    );
    const withoutArea = card(
      `<h3>Fără suprafață</h3><p class="leading-none">99.000 €</p><div class="mt-3 flex items-center gap-4 text-sm"><span>3 camere</span></div>`,
    );
    expect(parseImospotListings(withoutPrice)).toHaveLength(0);
    expect(parseImospotListings(withoutArea)).toHaveLength(0);
  });

  it("citește blocul de cifre publicate separat de comparabile", () => {
    const context = parseImospotMarketContext(FIXTURE);
    expect(context).not.toBeNull();
    expect(context!.medianPricePerSqm).toBeGreaterThan(0);
    expect(context!.medianPrice).toBeGreaterThan(0);
    expect(context!.medianRent).toBeGreaterThan(0);
    expect(context!.timeOnMarketText).toBeTruthy();
    expect(context!.byRooms.length).toBeGreaterThan(0);
    expect(context!.byType.length).toBeGreaterThan(0);
    // Cifrele sursei nu apar între comparabilele citite.
    expect(parseImospotListings(FIXTURE).some((l) => l.price === context!.medianPrice)).toBe(false);
  });
});

describe("Imospot — interogarea", () => {
  beforeEach(() => {
    resetMarketQueryAdapters();
    marketQueryCacheClear();
  });

  const page = (count: number) =>
    Array.from({ length: count })
      .map(
        (_, i) =>
          `<article data-listing-id="${i}"><a href="/anunturi/vanzari/apartamente-de-vanzare/bucuresti/x-${i}"></a><h3>Ofertă</h3><p class="leading-none">100.000 €</p><div class="mt-3 flex items-center gap-4 text-sm"><span>2 camere</span><span>55 m²</span></div><span class="truncate">Bucuresti</span><span class="shrink-0">azi</span></article>`,
      )
      .join("");

  it("cere cel mult două pagini", async () => {
    const urls: string[] = [];
    const adapter = createImospotAdapter({
      fetchPage: async (u) => {
        urls.push(u);
        return { url: u, status: 200, body: page(1), error: null };
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

  it("întoarce blocul de cifre publicate alături de comparabile", async () => {
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
    expect(result.marketContext?.title).toContain("Imospot");
    expect(result.marketContext?.lines.length).toBeGreaterThan(0);
    expect(result.requestedUrls[0]).toContain("/toate-ofertele-din-bucuresti");
  });
});
