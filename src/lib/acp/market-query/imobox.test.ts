import { describe, expect, it, beforeEach } from "vitest";
import { marketQueryCriteria } from "./criteria";
import { createImoboxAdapter, IMOBOX_SOURCE_KEY } from "./imobox/adapter.server";
import { buildImoboxQuery, buildImoboxUrl, imoboxExclusion, mapImoboxResult } from "./imobox/query";
import { normalizeMarketQueryComparable } from "./normalize";
import { registerMarketQueryAdapter, resetMarketQueryAdapters, type MarketQuerySourceConfig } from "./port";
import { querySingleSource } from "./run.server";

const source: MarketQuerySourceConfig = {
  key: IMOBOX_SOURCE_KEY,
  label: "ImoBox.ro",
  baseUrl: "https://api.imobox.ro",
  enabled: true,
  timeoutMs: 8000,
  radiusKm: 5,
  priceBandPercent: 40,
};

const NOW = new Date("2026-10-14T12:00:00Z");

/** Forma unui rezultat `AnuntLocuinta` din specificația OpenAPI ImoBox. */
const DOC_RESULT = {
  id_anunt: "abcdf123",
  titlu_anunt: "Apartament 2 camere Militari",
  pret_total: 98000,
  moneda: "EUR",
  oras: "Bucuresti",
  judet: "Bucuresti",
  imobil: "apartament",
  tip_anunt: "vanzare-cumparare",
  latitudine: "44.4352",
  longitudine: "26.0162",
  data_actualizare: "2026-09-14T12:00:00+03:00",
  url: "https://imobox.ro/apartament-2-camere-militari/anunt/abcdf123",
  imagine_url: "https://imobox.ro/img/abcdf123.jpg",
  suprafata_casa: 54,
  camere: 2,
};

const criteria = marketQueryCriteria(
  {
    propertyType: "apartment",
    transactionType: "sale",
    rooms: 2,
    neighborhood: "Militari",
    city: "București",
    price: 100000,
    usableArea: 55,
  } as never,
  { radiusKm: 5, priceBandPercent: 40 },
);

describe("ImoBox — textul q", () => {
  it("construiește tip, camere, tranzacție, zonă și oraș fără diacritice", () => {
    expect(buildImoboxQuery(criteria)).toBe("apartament 2 camere vanzare Militari Bucuresti");
    expect(buildImoboxQuery(criteria, { withZone: false })).toBe("apartament 2 camere vanzare Bucuresti");
    const u = buildImoboxUrl(source.baseUrl, buildImoboxQuery(criteria), 2);
    expect(u).toContain("/v1/anunturi?");
    expect(u).toContain("limit=100");
    expect(u).toContain("pagina=2");
  });
});

describe("ImoBox — maparea", () => {
  it("mapează exemplul din documentație", () => {
    const n = normalizeMarketQueryComparable(mapImoboxResult(DOC_RESULT));
    expect(n).toEqual({
      price: 98000,
      currency: "EUR",
      area: 54,
      rooms: 2,
      locality: "Bucuresti",
      zone: null,
      latitude: 44.4352,
      longitude: 26.0162,
      listedAt: new Date("2026-09-14T09:00:00Z").toISOString(),
      url: "https://imobox.ro/apartament-2-camere-militari/anunt/abcdf123",
    });
    expect(imoboxExclusion(DOC_RESULT, criteria, NOW)).toBeNull();
  });

  it("exclude fără suprafață, altă tranzacție și mai vechi de 12 luni", () => {
    const { suprafata_casa: _a, ...noArea } = DOC_RESULT;
    expect(imoboxExclusion(noArea, criteria, NOW)).toBe("no_area");
    expect(imoboxExclusion({ ...DOC_RESULT, tip_anunt: "inchiriere" }, criteria, NOW)).toBe("transaction");
    expect(imoboxExclusion({ ...DOC_RESULT, data_actualizare: "2025-09-01T00:00:00Z" }, criteria, NOW)).toBe("too_old");
  });
});

describe("ImoBox — adaptorul", () => {
  beforeEach(() => resetMarketQueryAdapters());

  it("reîncearcă fără zonă sub 5 rezultate, max 3 pagini, User-Agent HabitooBot", async () => {
    const urls: string[] = [];
    const agents: (string | undefined)[] = [];
    const adapter = createImoboxAdapter({
      now: () => NOW,
      fetchPage: async (url, opts) => {
        urls.push(url);
        agents.push(opts.userAgent);
        const { suprafata_casa: _a, ...noArea } = DOC_RESULT;
        return {
          url,
          status: 200,
          error: null,
          body: JSON.stringify({ requestInfo: { totalPages: 9 }, results: [{ ...DOC_RESULT, id_anunt: url }, { ...noArea, id_anunt: `x${url}` }] }),
        };
      },
    });
    const r = (await adapter.query({ criteria, source, signal: new AbortController().signal })) as {
      items: unknown[];
      detail: string;
    };
    expect(urls).toHaveLength(3);
    expect(urls.some((u) => !u.includes("Militari"))).toBe(true);
    expect(agents.every((a) => a === "HabitooBot/1.0 (+https://www.habitoo.ro)")).toBe(true);
    expect(r.items).toHaveLength(3);
    expect(r.detail).toBe("Găsite 6, folosite 3, excluse 3.");
  });

  it("la timeout analiza continuă: rezultatul e consemnat, fără excepție", async () => {
    registerMarketQueryAdapter(
      createImoboxAdapter({ fetchPage: () => new Promise(() => {}) }),
    );
    const result = await querySingleSource({ source: { ...source, timeoutMs: 300 }, criteria });
    expect(result.outcome.outcome).toBe("timeout");
    expect(result.comparables).toEqual([]);
  });
});
