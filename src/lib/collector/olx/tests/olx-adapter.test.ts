/**
 * Adaptorul OLX pe JSON-ul încorporat: comportament, nu potrivire de text.
 * Fixtura are structura reală (ads, params pe cheie, location cu cartier,
 * price object, photos), dar date inventate — nicio persoană reală.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { olxAdapter } from "../adapter";
import { readOlxAd, olxSellerFromIsBusiness } from "../ads";
import { adsFromState, extractPrerenderedState } from "../prerendered";
import { mapOlxCategoryId } from "../mapping";
import {
  OLX_PAGE_CAP,
  OLX_SEARCH_CAP,
  olxNeedsNarrowing,
  olxPageUrl,
  olxPassEstimate,
  olxRoundRobin,
  olxTargetUrl,
  parseOlxConfig,
  type OlxConfig,
} from "../targets";

const BASE_URL = "https://www.olx.ro";
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const SEARCH_PAGE = fixture("olx-search-state.html");
const OVER_CAP_PAGE = fixture("olx-search-over-cap.html");

const CONFIG = parseOlxConfig({
  pagesPerTarget: 25,
  categoryTypes: { "1001": "apartament 2 camere", "2001": "casă/vilă" },
  targets: [
    {
      type: "apartament 2 camere",
      path: "imobiliare/apartamente-garsoniere-de-vanzare/2-camere",
      county: "cluj",
      categoryId: 1001,
    },
    { type: "casă/vilă", path: "imobiliare/case-de-vanzare", county: "cluj", categoryId: 2001 },
  ],
});

const LIST_URL = `${BASE_URL}/imobiliare/apartamente-garsoniere-de-vanzare/2-camere/cluj/`;

function parse(body: string, url = LIST_URL, config: OlxConfig = CONFIG) {
  const result = olxAdapter.parsePage({ url, body, baseUrl: BASE_URL, config });
  if (Array.isArray(result)) return { items: result, failures: [] as { url?: string | null; reason: string }[] };
  return { items: result.items, failures: result.failures ?? [] };
}

describe("starea încorporată", () => {
  it("citește JSON-ul din window.__PRERENDERED_STATE__ și lista de anunțuri", () => {
    const state = extractPrerenderedState(SEARCH_PAGE);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    const ads = adsFromState(state.state);
    expect(ads.ok).toBe(true);
    if (!ads.ok) return;
    expect(ads.ads).toHaveLength(3);
    expect(ads.totalCount).toBe(320);
  });

  it("citește și un anunț singular din ad.ad", () => {
    const html = `<script>window.__PRERENDERED_STATE__ = ${JSON.stringify(
      JSON.stringify({ ad: { ad: { id: 1, title: "x" } } }),
    )};</script>`;
    const state = extractPrerenderedState(html);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    const ads = adsFromState(state.state);
    expect(ads.ok && ads.ads).toHaveLength(1);
  });

  it("JSON invalid dă eroare de citire consemnată, nu rânduri goale", () => {
    const html = '<script>window.__PRERENDERED_STATE__ = "{ceva stricat";</script>';
    const { items, failures } = parse(html);
    expect(items).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.reason).toMatch(/JSON/i);
  });

  it("lipsa marcajului este raportată explicit", () => {
    const { items, failures } = parse("<html><body>fără stare</body></html>");
    expect(items).toHaveLength(0);
    expect(failures[0]!.reason).toMatch(/__PRERENDERED_STATE__/);
  });
});

describe("câmpurile unui anunț", () => {
  it("extrage toate câmpurile documentate", () => {
    const { items } = parse(SEARCH_PAGE);
    const first = items[0]!;
    expect(first.sourceItemId).toBe("411111111");
    expect(first.url).toContain("/d/oferta/apartament-2-camere-lux-IDabc1.html");
    expect(first.normalized["title"]).toBe("Apartament 2 camere, bloc nou");
    expect(first.normalized["description"]).toBe("Apartament luminos, centrala proprie.");
    expect(first.normalized["price"]).toBe(92500);
    expect(first.normalized["currency"]).toBe("EUR");
    expect(first.normalized["publishedAt"]).toBe("2026-09-10T08:12:00+03:00");
    expect(first.normalized["refreshedAt"]).toBe("2026-09-18T07:00:00+03:00");
    expect(first.normalized["status"]).toBe("active");
    expect(first.normalized["isPromoted"]).toBe(true);
    expect(first.normalized["area"]).toBe(58);
    expect(first.normalized["floor"]).toBe("Etaj 3");
    expect(first.normalized["construction"]).toBe("2020");
    expect(first.normalized["layout"]).toBe("Decomandat");
    expect(first.normalized["city"]).toBe("Cluj-Napoca");
    expect(first.normalized["county"]).toBe("Cluj");
    expect(first.normalized["neighbourhood"]).toBe("Mărăști");
    expect(first.normalized["categoryId"]).toBe(1001);
    // Poziția are rază declarată și nu este prezentată ca exactă.
    expect(first.normalized["lat"]).toBe(46.7712);
    expect(first.normalized["lng"]).toBe(23.6236);
    expect(first.normalized["locationRadiusMeters"]).toBe(1000);
    expect(first.normalized["locationPrecise"]).toBe(false);
  });

  it("păstrează doar adrese de imagini, cu dimensiunile completate", () => {
    const { items } = parse(SEARCH_PAGE);
    expect(items[0]!.imageUrls).toEqual([
      "https://ireland.apollo.olxcdn.com/v1/files/abc1/image;s=1000x800",
    ]);
    expect(items[2]!.imageUrls).toEqual([]);
  });

  it("locația din anunț păstrează identificatorii OLX", () => {
    const state = extractPrerenderedState(SEARCH_PAGE);
    if (!state.ok) throw new Error("fixtura nu s-a putut citi");
    const ads = adsFromState(state.state);
    if (!ads.ok) throw new Error("fixtura nu conține anunțuri");
    const read = readOlxAd(ads.ads[0], { categoryTypes: CONFIG.categoryTypes });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.fields.location).toEqual({
      cityName: "Cluj-Napoca",
      cityId: 1,
      regionName: "Cluj",
      regionId: 6,
      districtName: "Mărăști",
      districtId: 51,
      pathName: "cluj-napoca",
    });
    expect(read.fields.point.precise).toBe(false);
  });

  it("un anunț fără identificator sau adresă este raportat, nu salvat", () => {
    const read = readOlxAd({ title: "fără id" }, { categoryTypes: {} });
    expect(read.ok).toBe(false);
  });
});

describe("proprietar vs agenție", () => {
  it("vine exclusiv din isBusiness, fără prag de număr de anunțuri", () => {
    expect(olxSellerFromIsBusiness(false)).toBe("owner");
    expect(olxSellerFromIsBusiness(true)).toBe("agency");
    expect(olxSellerFromIsBusiness(null)).toBe("unknown");
    expect(olxSellerFromIsBusiness(undefined)).toBe("unknown");

    const { items } = parse(SEARCH_PAGE);
    expect(items[0]!.inferredType).toBe("owner");
    expect(items[1]!.inferredType).toBe("agency");
    expect(items[2]!.inferredType).toBe("unknown");
    // Semnalul păstrat este steagul declarat.
    expect(items[0]!.signals).toEqual({ source: "olx", isBusiness: false });
    expect(items[2]!.signals).toEqual({ source: "olx", isBusiness: null });
  });

  it("regula „cinci anunțuri = agenție” nu mai există", async () => {
    const { inferSellerType } = await import("../../normalize");
    expect(inferSellerType({ itemsCount: 50 })).toBe("unknown");
    expect(inferSellerType({ itemsCount: 1, declaredAgency: true })).toBe("agency");
    expect(inferSellerType({ itemsCount: 1, declaredOwner: true })).toBe("owner");
  });
});

describe("tipul proprietății", () => {
  it("vine din categoria de căutare, nu din titlu", () => {
    const { items } = parse(SEARCH_PAGE);
    expect(items[0]!.normalized["propertyType"]).toBe("apartament 2 camere");
    expect(items[1]!.normalized["propertyType"]).toBe("casă/vilă");
  });

  it("o categorie nemapată dă „necunoscut”", () => {
    expect(mapOlxCategoryId(9999, CONFIG.categoryTypes)).toBe("necunoscut");
    const noTargetConfig = parseOlxConfig({
      pagesPerTarget: 1,
      categoryTypes: {},
      targets: [{ type: "necunoscut", path: "imobiliare", county: "cluj" }],
    });
    const { items } = parse(SEARCH_PAGE, `${BASE_URL}/imobiliare/cluj/`, noTargetConfig);
    expect(items.every((i) => i.normalized["propertyType"] === "necunoscut")).toBe(true);
  });
});

describe("acoperirea și plafonul OLX", () => {
  it("construiește adresele cu județ, oraș, cartier și paginare", () => {
    expect(olxTargetUrl(BASE_URL, CONFIG.targets[0]!, 1)).toBe(LIST_URL);
    expect(olxTargetUrl(BASE_URL, CONFIG.targets[0]!, 3)).toContain("page=3");
    const narrowed = {
      ...CONFIG.targets[0]!,
      city: "bucuresti",
      districtId: 5,
    };
    const url = olxTargetUrl(BASE_URL, narrowed, 1);
    expect(url).toContain("/bucuresti/");
    expect(url).toContain("search%5Bdistrict_id%5D=5");
  });

  it("parcurge țintele round-robin, ca niciun județ să nu rămână nevizitat", () => {
    expect(olxRoundRobin(CONFIG, 1)).toEqual({ target: CONFIG.targets[0], targetPage: 1 });
    expect(olxRoundRobin(CONFIG, 2)).toEqual({ target: CONFIG.targets[1], targetPage: 1 });
    expect(olxRoundRobin(CONFIG, 3)).toEqual({ target: CONFIG.targets[0], targetPage: 2 });
    expect(olxPageUrl(BASE_URL, CONFIG, 2)).toContain("/case-de-vanzare/cluj/");
    const single = parseOlxConfig({ pagesPerTarget: 1, targets: [CONFIG.targets[0]] });
    expect(olxRoundRobin(single, 2)).toBeNull();
  });

  it("o țintă peste plafonul de 25×50 este marcată de îngustat", () => {
    expect(olxNeedsNarrowing(OLX_SEARCH_CAP)).toBe(false);
    expect(olxNeedsNarrowing(OLX_SEARCH_CAP + 1)).toBe(true);
    const { items, failures } = parse(OVER_CAP_PAGE);
    expect(items).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.reason).toMatch(/de îngustat/);
    expect(failures[0]!.reason).toContain("4200");
  });

  it("estimează o trecere națională la pauza configurată", () => {
    const estimate = olxPassEstimate(CONFIG, 6000);
    expect(estimate.targets).toBe(2);
    expect(estimate.pages).toBe(2 * OLX_PAGE_CAP);
    expect(estimate.hours).toBeGreaterThan(0);
  });
});

describe("telefoane", () => {
  it("niciun modul OLX nu atinge vreun câmp de telefon", () => {
    const sources = ["../adapter.ts", "../ads.ts", "../prerendered.ts", "../targets.ts", "../mapping.ts"]
      .map((file) => readFileSync(join(__dirname, file), "utf8"))
      .join("\n")
      .toLowerCase();
    for (const forbidden of ["phone", "telefon", "mobile", "contact_phone"]) {
      // Excepție: comentariile care spun explicit că nu citim telefoane.
      const hits = sources
        .split("\n")
        .filter((line) => line.includes(forbidden) && !line.trimStart().startsWith("*"));
      expect(hits).toEqual([]);
    }
  });
});
