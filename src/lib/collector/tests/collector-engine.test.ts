/**
 * Colectorul — comportament, nu potriviri de text.
 *
 * Verificăm: robots.txt respectat, pauza per sursă, 403/429 opresc rularea cu
 * motiv, telefonul nu ajunge NICIODATĂ în bază, nu se descarcă bytes de
 * imagine, deduplicarea pe URL și pe hash, iar cu sursele oprite nu rulează
 * nimic.
 */
import { describe, expect, it } from "vitest";
import {
  parseRobotsTxt,
  robotsAllows,
  robotsCrawlDelayMs,
  urlPathForRobots,
} from "@/lib/collector/robots";
import {
  COLLECTOR_ACCEPT_HEADER,
  COLLECTOR_USER_AGENT,
  collectorRequestHeaders,
  effectiveCrawlDelayMs,
  pageCap,
  stopReasonForStatus,
} from "@/lib/collector/politeness";
import { listingHashInput, looksLikePhone, normalizePhoneE164 } from "@/lib/collector/normalize";
import { listingHash, sellerFingerprint } from "@/lib/collector/fingerprint.server";
import { runCollectorSource, stripPhoneFields } from "@/lib/collector/engine.server";
import type { CollectorAdapter } from "@/lib/collector/adapters";

/* --------------------------- bază de date falsă --------------------------- */

type Row = Record<string, unknown>;

class FakeAdmin {
  tables: Record<string, Row[]> = {
    collector_sources: [],
    collector_runs: [],
    collector_items: [],
    collector_seller_fingerprints: [],
  };
  /** Tot ce s-a scris vreodată, ca să putem verifica scurgerile de date. */
  writes: Row[] = [];
  released = 0;

  from(table: string) {
    const rows = (this.tables[table] ??= []);
    const self = this;
    const filters: [string, unknown][] = [];
    const api = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        void _cols;
        void opts;
        return api;
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: match()[0] ?? null }),
      then: undefined,
      insert: (payload: Row | Row[]) => {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const row of list) {
          const stored = { id: `${table}-${rows.length + 1}`, ...row };
          rows.push(stored);
          self.writes.push(stored);
        }
        return api;
      },
      update: (patch: Row) => {
        const chain = {
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
    if (name === "release_collector_source") {
      this.released += 1;
      return { data: null };
    }
    return { data: null };
  }
}

function seedSource(admin: FakeAdmin, overrides: Row = {}) {
  admin.tables["collector_sources"]!.push({
    id: "src-1",
    key: "demo",
    label: "Demo",
    base_url: "https://demo.example/anunturi",
    enabled: true,
    robots_body: "User-agent: *\nDisallow: /privat\nCrawl-delay: 2",
    robots_checked_at: new Date().toISOString(),
    crawl_delay_ms: 1000,
    max_pages_per_run: 2,
    ...overrides,
  });
}

const ITEM_PHONE = "0722 333 444";

function demoAdapter(items: number): CollectorAdapter {
  return {
    key: "demo",
    pageUrl: ({ baseUrl, page }) => (page > 1 ? null : `${baseUrl}?pagina=${page}`),
    parsePage: ({ url }) =>
      Array.from({ length: items }, (_unused, index) => ({
        url: `${url}#item-${index}`,
        sourceItemId: `item-${index}`,
        phone: ITEM_PHONE,
        raw: { contactPhone: ITEM_PHONE, titlu: "Apartament 2 camere" },
        normalized: {
          title: "Apartament 2 camere",
          price: 85000,
          currency: "EUR",
          rooms: 2,
          city: "Cluj-Napoca",
          imageUrls: ["https://demo.example/foto1.jpg"],
        },
      })),
  };
}

function ports(admin: FakeAdmin, fetched: string[], status = 200) {
  return {
    adapter: demoAdapter(1),
    sleep: async () => undefined,
    fetchPage: async (url: string) => {
      fetched.push(url);
      return {
        url,
        status,
        body: "<html>lista</html>",
        etag: 'W/"1"',
        lastModified: null,
        retryAfterMs: null,
      };
    },
  };
}

/* --------------------------------- robots --------------------------------- */

describe("robots.txt", () => {
  const rules = parseRobotsTxt(
    "User-agent: *\nDisallow: /privat\nAllow: /privat/public\nCrawl-delay: 3\n\nUser-agent: HabitooCollector\nDisallow: /intern\n",
  );

  it("blochează calea interzisă pentru agentul nostru", () => {
    expect(robotsAllows(rules, COLLECTOR_USER_AGENT, "/intern/lista")).toBe(false);
  });

  it("permite ce nu e interzis", () => {
    expect(robotsAllows(rules, COLLECTOR_USER_AGENT, "/anunturi?pagina=2")).toBe(true);
  });

  it("aplică regulile generice altor agenți, cu Allow mai specific", () => {
    expect(robotsAllows(rules, "OtherBot", "/privat/dosar")).toBe(false);
    expect(robotsAllows(rules, "OtherBot", "/privat/public/x")).toBe(true);
  });

  it("citește Crawl-delay în milisecunde", () => {
    expect(robotsCrawlDelayMs(parseRobotsTxt("User-agent: *\nCrawl-delay: 2.5"), COLLECTOR_USER_AGENT)).toBe(
      2500,
    );
  });

  it("verifică path + query", () => {
    expect(urlPathForRobots("https://x.ro/a/b?c=1")).toBe("/a/b?c=1");
  });
});

/* ------------------------------- politețe -------------------------------- */

describe("politețe", () => {
  it("ia pauza cea mai mare dintre sursă și robots", () => {
    expect(effectiveCrawlDelayMs(3000, 8000)).toBe(8000);
    expect(effectiveCrawlDelayMs(4000, null)).toBe(4000);
    expect(effectiveCrawlDelayMs(0, 0)).toBe(1000);
  });

  it("limitează paginile pe rulare", () => {
    expect(pageCap(0)).toBe(1);
    expect(pageCap(9000)).toBe(500);
  });

  it("oprește rularea la 403 și la 429", () => {
    expect(stopReasonForStatus(403)).toBe("forbidden");
    expect(stopReasonForStatus(429)).toBe("rate_limited");
    expect(stopReasonForStatus(500)).toBeNull();
  });

  it("se prezintă cu agent și contact, cere doar text și trimite cereri condiționate", () => {
    const headers = collectorRequestHeaders({ etag: 'W/"1"', lastModified: "Mon, 1 Jan 2026" });
    expect(headers["User-Agent"]).toContain("contact@habitoo.ro");
    expect(headers["Accept"]).toBe(COLLECTOR_ACCEPT_HEADER);
    expect(headers["Accept"]).not.toContain("image/");
    expect(headers["If-None-Match"]).toBe('W/"1"');
    expect(headers["If-Modified-Since"]).toBe("Mon, 1 Jan 2026");
  });
});

/* -------------------------------- telefon -------------------------------- */

describe("amprenta vânzătorului", () => {
  it("normalizează la E.164", () => {
    expect(normalizePhoneE164("0722 333 444")).toBe("+40722333444");
    expect(normalizePhoneE164("+40 722 333 444")).toBe("+40722333444");
    expect(normalizePhoneE164("722333444")).toBe("+40722333444");
    expect(normalizePhoneE164("12")).toBeNull();
  });

  it("este stabilă și nu conține numărul", () => {
    const a = sellerFingerprint("0722 333 444", "secret");
    const b = sellerFingerprint("+40722333444", "secret");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("722333444");
  });

  it("scoate orice câmp de telefon înainte de salvare", () => {
    const cleaned = stripPhoneFields({
      titlu: "Casă",
      contact_phone: "0722333444",
      nested: { phones: ["0722333444"], city: "Cluj" },
    });
    expect(JSON.stringify(cleaned)).not.toContain("0722333444");
    expect(JSON.stringify(cleaned)).toContain("Cluj");
  });
});

describe("hash de conținut", () => {
  it("aceleași câmpuri → același hash, ordinea imaginilor irelevantă", () => {
    const a = listingHash({ title: "Casă", price: 100, imageUrls: ["b", "a"] });
    const b = listingHash({ title: "casă ", price: 100, imageUrls: ["a", "b"] });
    expect(a).toBe(b);
    expect(listingHashInput({ title: "Casă" })).not.toContain("Casă");
  });

  it("un preț diferit schimbă hash-ul", () => {
    expect(listingHash({ title: "Casă", price: 100 })).not.toBe(
      listingHash({ title: "Casă", price: 110 }),
    );
  });
});

/* -------------------------------- rularea -------------------------------- */

describe("rularea colectorului", () => {
  it("nu face nimic cât timp sursa e oprită", async () => {
    const admin = new FakeAdmin();
    seedSource(admin, { enabled: false });
    const fetched: string[] = [];
    const outcome = await runCollectorSource(admin as never, "demo", ports(admin, fetched));
    expect(outcome.runId).toBeNull();
    expect(fetched).toHaveLength(0);
    expect(admin.tables["collector_runs"]).toHaveLength(0);
  });

  it("salvează itemii fără telefon și fără să descarce imagini", async () => {
    const admin = new FakeAdmin();
    seedSource(admin);
    const fetched: string[] = [];
    const outcome = await runCollectorSource(admin as never, "demo", ports(admin, fetched));

    expect(outcome.status).toBe("done");
    expect(outcome.itemsNew).toBe(1);
    // Nicio cerere către o imagine: doar pagina de listă.
    expect(fetched).toEqual(["https://demo.example/anunturi?pagina=1"]);
    expect(fetched.some((url) => /\.(jpe?g|png|webp|gif)$/i.test(url))).toBe(false);

    const serialized = JSON.stringify(admin.writes);
    expect(looksLikePhone("0722 333 444")).toBe(true);
    expect(serialized).not.toContain("0722");
    expect(serialized).not.toContain("+40722333444");
    // Adresa imaginii rămâne, dar doar ca text.
    expect(serialized).toContain("https://demo.example/foto1.jpg");

    const fingerprints = admin.tables["collector_seller_fingerprints"]!;
    expect(fingerprints).toHaveLength(1);
    expect(fingerprints[0]!["fingerprint"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("re-listarea identică actualizează rândul, nu creează duplicat", async () => {
    const admin = new FakeAdmin();
    seedSource(admin);
    const fetched: string[] = [];
    await runCollectorSource(admin as never, "demo", ports(admin, fetched));
    const second = await runCollectorSource(admin as never, "demo", ports(admin, fetched));

    expect(second.itemsNew).toBe(0);
    expect(second.itemsUpdated).toBe(1);
    expect(admin.tables["collector_items"]).toHaveLength(1);
  });

  it("oprește rularea sursei la 403 și consemnează motivul", async () => {
    const admin = new FakeAdmin();
    seedSource(admin);
    const fetched: string[] = [];
    const outcome = await runCollectorSource(admin as never, "demo", ports(admin, fetched, 403));

    expect(outcome.status).toBe("stopped");
    expect(outcome.stopReason).toBe("forbidden");
    expect(outcome.errors.join(" ")).toContain("403");
    expect(admin.tables["collector_runs"]![0]!["stop_reason"]).toBe("forbidden");
    expect(admin.tables["collector_items"]).toHaveLength(0);
  });

  it("respectă pauza dintre pagini și eliberează lock-ul", async () => {
    const admin = new FakeAdmin();
    seedSource(admin, { crawl_delay_ms: 4000, max_pages_per_run: 3 });
    const fetched: string[] = [];
    const slept: number[] = [];
    const outcome = await runCollectorSource(admin as never, "demo", {
      adapter: {
        key: "demo",
        pageUrl: ({ baseUrl, page }) => (page > 2 ? null : `${baseUrl}?pagina=${page}`),
        parsePage: () => [],
      },
      sleep: async (ms: number) => {
        slept.push(ms);
      },
      fetchPage: async (url: string) => {
        fetched.push(url);
        return { url, status: 200, body: "<html/>", etag: null, lastModified: null, retryAfterMs: null };
      },
    });

    expect(fetched).toHaveLength(2);
    // robots cere 2s, sursa 4s → 4s.
    expect(slept).toEqual([4000]);
    expect(outcome.stopReason).toBe("no_more_pages");
    expect(admin.released).toBeGreaterThan(0);
  });

  it("nu parcurge o cale interzisă de robots.txt", async () => {
    const admin = new FakeAdmin();
    seedSource(admin, { robots_body: "User-agent: *\nDisallow: /anunturi" });
    const fetched: string[] = [];
    const outcome = await runCollectorSource(admin as never, "demo", ports(admin, fetched));

    expect(fetched).toHaveLength(0);
    expect(outcome.stopReason).toBe("robots_disallow");
  });

  it("fără adaptor de citire nu se conectează nicăieri", async () => {
    const admin = new FakeAdmin();
    seedSource(admin);
    const fetched: string[] = [];
    const outcome = await runCollectorSource(admin as never, "demo", {
      adapter: null,
      sleep: async () => undefined,
      fetchPage: async (url: string) => {
        fetched.push(url);
        return { url, status: 200, body: "", etag: null, lastModified: null, retryAfterMs: null };
      },
    });
    expect(outcome.stopReason).toBe("no_adapter");
    expect(fetched).toHaveLength(0);
  });
});
