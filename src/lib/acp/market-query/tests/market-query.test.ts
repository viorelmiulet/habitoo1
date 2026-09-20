/**
 * Teste pentru interogarea live a surselor partenere.
 *
 * Comportamentale: rezultate parțiale, timeout consemnat, sursă dezactivată
 * niciodată întrebată, cache de sesiune, câmpuri persistate și faptul că un
 * motor v1/v2 nu declanșează nicio cerere.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  registerMarketQueryAdapter,
  resetMarketQueryAdapters,
  marketQueryAdapterKeys,
  type MarketQuerySourceConfig,
} from "../port";
import { marketQueryCacheClear } from "../session-cache";
import { runMarketQuery, querySingleSource } from "../run.server";
import {
  normalizeMarketQueryComparable,
  normalizeMarketQueryComparables,
  MARKET_QUERY_PERSISTED_FIELDS,
} from "../normalize";
import { marketQueryCriteria, marketQueryCriteriaKey } from "../criteria";
import {
  ACP_CURRENT_ENGINE_VERSION,
  engineSupportsLiveMarketQuery,
} from "../../engine-version";

type Row = {
  key: string;
  label: string;
  base_url: string;
  enabled: boolean;
  timeout_ms: number;
  radius_km: number;
  price_band_percent: number;
  answered_count: number;
  empty_count: number;
  timeout_count: number;
  error_count: number;
};

function fakeAdmin(rows: Row[]) {
  const queried: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe("market_query_sources");
      let filtered = [...rows];
      const builder: Record<string, unknown> = {
        select(_columns: string) {
          return builder;
        },
        order() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filtered = filtered.filter((r) => (r as never as Record<string, unknown>)[column] === value);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: filtered[0] ?? null, error: null });
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return {
            eq: () => Promise.resolve({ error: null }),
          };
        },
        then(resolve: (value: { data: Row[]; error: null }) => unknown) {
          return Promise.resolve({ data: filtered, error: null }).then(resolve);
        },
      };
      return builder as never;
    },
  };
  return { client: client as never, queried, updates };
}

const source: MarketQuerySourceConfig = {
  key: "test",
  label: "Sursă test",
  baseUrl: "https://example.test",
  enabled: true,
  timeoutMs: 50,
  radiusKm: 5,
  priceBandPercent: 40,
};

const subject = {
  city: "Cluj-Napoca",
  county: "Cluj",
  propertyType: "apartment",
  transactionType: "sale",
  rooms: 3,
  usableArea: 70,
  price: 140000,
};

beforeEach(() => {
  resetMarketQueryAdapters();
  marketQueryCacheClear();
});

describe("registrul de adaptoare", () => {
  it("se livrează gol: nicio sursă nu poate fi interogată implicit", async () => {
    await import("../adapters.register");
    expect(marketQueryAdapterKeys()).toEqual([]);
  });

  it("o sursă fără adaptor este consemnată ca eroare, nu aruncă", async () => {
    const result = await querySingleSource({
      source,
      criteria: marketQueryCriteria(subject),
    });
    expect(result.outcome.outcome).toBe("error");
    expect(result.comparables).toEqual([]);
  });
});

describe("normalizare", () => {
  it("elimină comparabilele fără preț sau fără suprafață", () => {
    expect(normalizeMarketQueryComparable({ price: 100000 })).toBeNull();
    expect(normalizeMarketQueryComparable({ area: 60 })).toBeNull();
    expect(normalizeMarketQueryComparable({ price: 100000, area: 60 })).not.toBeNull();
  });

  it("păstrează exclusiv câmpurile permise", () => {
    const normalized = normalizeMarketQueryComparable({
      price: 100000,
      area: 60,
      currency: "eur",
      rooms: "3",
      locality: " Cluj ",
      zone: "Zorilor",
      listedAt: "2026-01-05",
      url: "https://example.test/a",
      // câmpuri care nu au ce căuta într-o analiză
      phone: "0712345678",
      images: ["https://example.test/img.jpg"],
      sellerName: "Ion",
    } as never);
    expect(normalized).not.toBeNull();
    expect(Object.keys(normalized!).sort()).toEqual([...MARKET_QUERY_PERSISTED_FIELDS].sort());
    expect(normalized!.locality).toBe("Cluj");
    expect(normalized!.currency).toBe("EUR");
  });

  it("nu ghicește ce lipsește", () => {
    const normalized = normalizeMarketQueryComparable({ price: 90000, area: 55 });
    expect(normalized!.rooms).toBeNull();
    expect(normalized!.locality).toBeNull();
    expect(normalized!.listedAt).toBeNull();
    expect(normalized!.url).toBeNull();
  });

  it("nu numără de două ori același anunț", () => {
    const rows = [
      { price: 1, area: 1, url: "https://example.test/a" },
      { price: 1, area: 1, url: "https://example.test/a" },
    ];
    expect(normalizeMarketQueryComparables(rows)).toHaveLength(1);
  });
});

describe("rularea interogării", () => {
  const rows: Row[] = [
    {
      key: "ok",
      label: "Sursa OK",
      base_url: "https://ok.test",
      enabled: true,
      timeout_ms: 200,
      radius_km: 5,
      price_band_percent: 40,
      answered_count: 0,
      empty_count: 0,
      timeout_count: 0,
      error_count: 0,
    },
    {
      key: "slow",
      label: "Sursa lentă",
      base_url: "https://slow.test",
      enabled: true,
      timeout_ms: 20,
      radius_km: 5,
      price_band_percent: 40,
      answered_count: 0,
      empty_count: 0,
      timeout_count: 0,
      error_count: 0,
    },
    {
      key: "off",
      label: "Sursa oprită",
      base_url: "https://off.test",
      enabled: false,
      timeout_ms: 200,
      radius_km: 5,
      price_band_percent: 40,
      answered_count: 0,
      empty_count: 0,
      timeout_count: 0,
      error_count: 0,
    },
  ];

  it("rezultatele parțiale continuă analiza, iar timeout-ul este consemnat", async () => {
    let offCalls = 0;
    let okCalls = 0;
    registerMarketQueryAdapter({
      key: "ok",
      query: async () => {
        okCalls += 1;
        return [{ price: 120000, area: 62, url: "https://ok.test/1" }];
      },
    });
    registerMarketQueryAdapter({
      key: "slow",
      query: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("abort")));
        }),
    });
    registerMarketQueryAdapter({
      key: "off",
      query: async () => {
        offCalls += 1;
        return [];
      },
    });

    const { client } = fakeAdmin(rows);
    const result = await runMarketQuery(client, subject);

    expect(result.comparables).toHaveLength(1);
    expect(offCalls).toBe(0);
    const byKey = new Map(result.outcomes.map((o) => [o.sourceKey, o]));
    expect(byKey.get("ok")!.outcome).toBe("answered");
    expect(byKey.get("slow")!.outcome).toBe("timeout");
    expect(byKey.has("off")).toBe(false);
    expect(okCalls).toBe(1);

    // Cache de sesiune: aceleași criterii nu mai întreabă sursa.
    const again = await runMarketQuery(client, subject);
    expect(again.fromCache).toBe(true);
    expect(okCalls).toBe(1);
  });

  it("fără surse activate nu se face nicio cerere", async () => {
    let calls = 0;
    registerMarketQueryAdapter({
      key: "off",
      query: async () => {
        calls += 1;
        return [];
      },
    });
    const { client } = fakeAdmin([{ ...rows[2]!, enabled: false }]);
    const result = await runMarketQuery(client, subject);
    expect(result.comparables).toEqual([]);
    expect(result.outcomes).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe("criterii și versiuni de motor", () => {
  it("banda de preț și cheia de cache sunt deterministe", () => {
    const criteria = marketQueryCriteria(subject, { priceBandPercent: 40, radiusKm: 5 });
    expect(criteria.priceMin).toBe(84000);
    expect(criteria.priceMax).toBe(196000);
    expect(marketQueryCriteriaKey(criteria)).toBe(
      marketQueryCriteriaKey(marketQueryCriteria(subject, { priceBandPercent: 40, radiusKm: 5 })),
    );
  });

  it("doar motorul v3 cere comparabile live", () => {
    expect(engineSupportsLiveMarketQuery(1)).toBe(false);
    expect(engineSupportsLiveMarketQuery(2)).toBe(false);
    expect(engineSupportsLiveMarketQuery(3)).toBe(true);
    expect(ACP_CURRENT_ENGINE_VERSION).toBe(3);
  });
});
