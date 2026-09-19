/**
 * Adaptorul OLX — comportament pe o fixtură salvată (fără rețea).
 *
 * Verificăm câmpurile citite, clasificarea vânzătorului doar din ce scrie
 * pagina, maparea categoriilor, zona din nomenclator, faptul că imaginile
 * rămân doar adrese, că niciun telefon nu este atins și că politețea și
 * oprirea la 403 sunt respectate și pentru această sursă.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { olxAdapter, OLX_SOURCE_KEY } from "@/lib/collector/olx/adapter";
import { normalizeParseResult, collectorAdapter } from "@/lib/collector/adapters";
import "@/lib/collector/adapters.register";
import {
  classifyOlxSeller,
  mapOlxPropertyType,
  olxPageTarget,
  olxPageUrl,
  parseOlxConfig,
} from "@/lib/collector/olx/mapping";
import { olxItemIdFromUrl, parseOlxPrice } from "@/lib/collector/olx/selectors";
import { runCollectorSource } from "@/lib/collector/engine.server";

const FIXTURE = readFileSync(
  join(process.cwd(), "src/lib/collector/olx/tests/fixtures/olx-listing-page.html"),
  "utf8",
);

const CONFIG = {
  cities: [
    { slug: "cluj-napoca", label: "Cluj-Napoca" },
    { slug: "bucuresti", label: "București" },
  ],
  categoryPath: "imobiliare",
  pagesPerCity: 2,
};

const LOCALITY_INDEX = {
  localities: new Map([
    ["cluj napoca", { locality: "Cluj-Napoca", county: "Cluj", localityId: "loc-1" }],
  ]),
};

function parseFixture() {
  return normalizeParseResult(
    olxAdapter.parsePage({
      url: "https://www.olx.ro/imobiliare/cluj-napoca/",
      baseUrl: "https://www.olx.ro",
      body: FIXTURE,
      config: CONFIG,
      prepared: LOCALITY_INDEX,
    }),
  );
}

function itemByTitle(title: string) {
  const { items } = parseFixture();
  const item = items.find((entry) => String(entry.normalized["title"]).includes(title));
  expect(item, `lipsește itemul „${title}”`).toBeDefined();
  return item!;
}

describe("adaptorul OLX — înregistrare și paginare", () => {
  it("este înregistrat ca sursa „olx”", () => {
    expect(collectorAdapter(OLX_SOURCE_KEY)?.key).toBe("olx");
  });

  it("parcurge orașele din configurație, nu din cod", () => {
    const config = parseOlxConfig(CONFIG);
    expect(olxPageUrl("https://www.olx.ro", config, 1)).toBe(
      "https://www.olx.ro/imobiliare/cluj-napoca/",
    );
    expect(olxPageUrl("https://www.olx.ro", config, 2)).toBe(
      "https://www.olx.ro/imobiliare/cluj-napoca/?page=2",
    );
    expect(olxPageUrl("https://www.olx.ro", config, 3)).toBe(
      "https://www.olx.ro/imobiliare/bucuresti/",
    );
    // După ultima pagină a ultimului oraș nu mai există pagini.
    expect(olxPageUrl("https://www.olx.ro", config, 5)).toBeNull();
    expect(olxPageTarget(parseOlxConfig({ cities: [] }), 1)).toBeNull();
  });
});

describe("adaptorul OLX — câmpuri din fixtură", () => {
  it("citește toate câmpurile unui anunț", () => {
    const item = itemByTitle("Apartament 2 camere");
    expect(item.url).toBe("https://www.olx.ro/d/oferta/apartament-2-camere-zona-centrala-IDabc123.html");
    expect(item.sourceItemId).toBe("781234");
    expect(item.normalized["price"]).toBe(85000);
    expect(item.normalized["currency"]).toBe("EUR");
    expect(item.normalized["rooms"]).toBe(2);
    expect(item.normalized["area"]).toBe(54);
    expect(item.normalized["city"]).toBe("Cluj-Napoca");
    expect(item.normalized["neighbourhood"]).toBe("Mărăști");
    expect(String(item.normalized["publishedAt"])).toContain("2026-09-12");
    expect(item.normalized["imageUrls"]).toEqual([
      "https://ireland.apollo.olxcdn.com/v1/files/demo1.jpg",
      "https://ireland.apollo.olxcdn.com/v1/files/demo1b.jpg",
    ]);
  });

  it("citește prețul în lei și datele relative", () => {
    const item = itemByTitle("Garsonieră mobilată");
    expect(item.normalized["price"]).toBe(1500);
    expect(item.normalized["currency"]).toBe("RON");
    expect(item.normalized["publishedAt"]).not.toBeNull();
    expect(parseOlxPrice("85 000 €")).toEqual({ price: 85000, currency: "EUR" });
    expect(olxItemIdFromUrl("/x/titlu-IDabc123.html")).toBe("abc123");
  });

  it("nu salvează rânduri incomplete: cardul stricat e raportat", () => {
    const { items, failures } = parseFixture();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.reason).toContain("titlu");
    expect(items.every((item) => typeof item.normalized["title"] === "string")).toBe(true);
  });

  it("imaginile sunt doar adrese https, niciodată conținut", () => {
    const { items } = parseFixture();
    for (const item of items) {
      for (const url of (item.normalized["imageUrls"] as string[]) ?? []) {
        expect(url).toMatch(/^https:\/\//);
      }
    }
  });
});

describe("adaptorul OLX — tipul vânzătorului", () => {
  it("firmă → agenție, persoană fizică → proprietar, nemarcat → necunoscut", () => {
    expect(itemByTitle("Vilă cu curte").inferredType).toBe("agency");
    expect(itemByTitle("Apartament 2 camere").inferredType).toBe("owner");
    expect(itemByTitle("Apartament 4 camere").inferredType).toBe("unknown");
  });

  it("păstrează semnalul exact folosit, ca să poată fi explicat", () => {
    const agency = itemByTitle("Vilă cu curte");
    expect(agency.signals).toMatchObject({ source: "olx", badgeText: "Firmă", matched: "business" });
    const unknown = itemByTitle("Apartament 4 camere");
    expect(unknown.signals).toMatchObject({ badgeText: null, matched: null });
    expect(classifyOlxSeller(null).inferredType).toBe("unknown");
  });
});

describe("adaptorul OLX — categorii", () => {
  it("mapează fiecare categorie a noastră", () => {
    expect(mapOlxPropertyType("Apartamente de vânzare", 1)).toBe("garsonieră");
    expect(mapOlxPropertyType("Apartamente de vânzare", 2)).toBe("apartament 2 camere");
    expect(mapOlxPropertyType("Apartamente de vânzare", 3)).toBe("apartament 3 camere");
    expect(mapOlxPropertyType("Apartamente de vânzare", 5)).toBe("apartament 4+ camere");
    expect(mapOlxPropertyType("Case de vânzare", 5)).toBe("casă/vilă");
    expect(mapOlxPropertyType("Terenuri de vânzare", null)).toBe("teren");
    expect(mapOlxPropertyType("Spații comerciale", null)).toBe("spațiu comercial");
  });

  it("ce nu se potrivește curat rămâne „necunoscut”", () => {
    expect(mapOlxPropertyType("Mașini de spălat", null)).toBe("necunoscut");
    expect(mapOlxPropertyType("Apartamente de vânzare", null)).toBe("necunoscut");
    expect(itemByTitle("Mașină de spălat").normalized["propertyType"]).toBe("necunoscut");
    expect(itemByTitle("Garsonieră mobilată").normalized["propertyType"]).toBe("garsonieră");
  });
});

describe("adaptorul OLX — zona", () => {
  it("folosește nomenclatorul doar la potrivire exactă", () => {
    const known = itemByTitle("Apartament 2 camere");
    expect(known.normalized["county"]).toBe("Cluj");
    expect(known.normalized["locality"]).toBe("Cluj-Napoca");

    const unknown = itemByTitle("Teren intravilan");
    // „Florești” nu e în index: zona nu se inventează.
    expect(unknown.normalized["city"]).toBe("Florești");
    expect(unknown.normalized["county"]).toBeNull();
    expect(unknown.normalized["locality"]).toBeNull();
  });
});

describe("adaptorul OLX — telefoane", () => {
  it("nu atinge niciun câmp de telefon", () => {
    const { items } = parseFixture();
    for (const item of items) {
      expect(item.phone).toBeUndefined();
      const serialized = JSON.stringify(item);
      expect(serialized.toLowerCase()).not.toContain("phone");
      expect(serialized.toLowerCase()).not.toContain("telefon");
      expect(/(?:\+?\d[\s().-]?){9,}/.test(serialized)).toBe(false);
    }
  });

  it("codul adaptorului nu conține nicio referire la telefon", () => {
    const files = [
      "src/lib/collector/olx/adapter.ts",
      "src/lib/collector/olx/selectors.ts",
      "src/lib/collector/olx/mapping.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8")
        // comentariile pot menționa telefonul; contează codul
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .toLowerCase();
      expect(source).not.toContain("phone");
      expect(source).not.toContain("telefon");
    }
  });
});

/* ------------------------- politețe pentru sursa OLX ---------------------- */

type Row = Record<string, unknown>;

class FakeAdmin {
  tables: Record<string, Row[]> = {
    collector_sources: [],
    collector_runs: [],
    collector_items: [],
    collector_seller_fingerprints: [],
  };
  writes: Row[] = [];

  from(table: string) {
    const rows = (this.tables[table] ??= []);
    const self = this;
    const filters: [string, unknown][] = [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return api;
      },
      in: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: match()[0] ?? null }),
      insert: (payload: Row | Row[]) => {
        for (const row of Array.isArray(payload) ? payload : [payload]) {
          const stored = { id: `${table}-${rows.length + 1}`, ...row };
          rows.push(stored);
          self.writes.push(stored);
        }
        return api;
      },
      update: (patch: Row) => {
        const chain: Record<string, unknown> = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return chain;
          },
          then: (resolve: (value: { data: null }) => unknown) => {
            for (const row of match()) Object.assign(row, patch);
            self.writes.push({ ...patch });
            return Promise.resolve({ data: null }).then(resolve);
          },
        };
        return chain;
      },
    };
    function match(): Row[] {
      return rows.filter((row) => filters.every(([column, value]) => row[column] === value));
    }
    return api as never;
  }

  async rpc(name: string, params?: Row) {
    if (name === "claim_collector_source") {
      const source = this.tables["collector_sources"]!.find(
        (row) => row["key"] === params?.["_key"] && row["enabled"] === true,
      );
      return { data: source ? [source] : [] };
    }
    return { data: null };
  }
}

function seedOlxSource(admin: FakeAdmin, overrides: Row = {}) {
  admin.tables["collector_sources"]!.push({
    id: "src-olx",
    key: "olx",
    label: "OLX.ro",
    base_url: "https://www.olx.ro",
    enabled: true,
    robots_body: "User-agent: *\nDisallow: /d/cont\nCrawl-delay: 6",
    robots_checked_at: new Date().toISOString(),
    crawl_delay_ms: 6000,
    max_pages_per_run: 2,
    config: { ...CONFIG, pagesPerCity: 2 },
    ...overrides,
  });
}

describe("rularea sursei OLX", () => {
  it("respectă pauza cerută și salvează anunțurile publice fără telefon", async () => {
    const admin = new FakeAdmin();
    seedOlxSource(admin);
    const fetched: string[] = [];
    const slept: number[] = [];

    const outcome = await runCollectorSource(admin as never, "olx", {
      adapter: { ...olxAdapter, prepare: async () => LOCALITY_INDEX },
      sleep: async (ms: number) => {
        slept.push(ms);
      },
      fetchPage: async (url: string) => {
        fetched.push(url);
        return { url, status: 200, body: FIXTURE, etag: null, lastModified: null, retryAfterMs: null };
      },
    });

    expect(fetched).toEqual([
      "https://www.olx.ro/imobiliare/cluj-napoca/",
      "https://www.olx.ro/imobiliare/cluj-napoca/?page=2",
    ]);
    expect(slept).toEqual([6000]);
    expect(outcome.itemsFound).toBeGreaterThan(0);
    // Cardul stricat este raportat, nu salvat.
    expect(outcome.errors.join(" ")).toContain("titlu");

    const serialized = JSON.stringify(admin.writes).toLowerCase();
    expect(serialized).not.toContain("phone");
    expect(admin.tables["collector_seller_fingerprints"]).toHaveLength(0);
  });

  it("se oprește la 403 fără să salveze nimic", async () => {
    const admin = new FakeAdmin();
    seedOlxSource(admin);
    const outcome = await runCollectorSource(admin as never, "olx", {
      adapter: { ...olxAdapter, prepare: async () => LOCALITY_INDEX },
      sleep: async () => undefined,
      fetchPage: async (url: string) => ({
        url,
        status: 403,
        body: null,
        etag: null,
        lastModified: null,
        retryAfterMs: null,
      }),
    });
    expect(outcome.status).toBe("stopped");
    expect(outcome.stopReason).toBe("forbidden");
    expect(admin.tables["collector_items"]).toHaveLength(0);
  });

  it("nu atinge o cale interzisă de robots.txt", async () => {
    const admin = new FakeAdmin();
    seedOlxSource(admin, { robots_body: "User-agent: *\nDisallow: /imobiliare" });
    const fetched: string[] = [];
    const outcome = await runCollectorSource(admin as never, "olx", {
      adapter: { ...olxAdapter, prepare: async () => LOCALITY_INDEX },
      sleep: async () => undefined,
      fetchPage: async (url: string) => {
        fetched.push(url);
        return { url, status: 200, body: FIXTURE, etag: null, lastModified: null, retryAfterMs: null };
      },
    });
    expect(fetched).toHaveLength(0);
    expect(outcome.stopReason).toBe("robots_disallow");
  });
});
