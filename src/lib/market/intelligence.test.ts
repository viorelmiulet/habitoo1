/**
 * Teste Market Intelligence (ACP Stage 4).
 *
 * Acoperă: agregări, percentile/distribuții, filtre individuale și combinate,
 * date lipsă/zero, insufficient data, mixul surselor, prospețimea, trendurile
 * (cu și fără istoric), poziționarea față de piață, consistența cu statistica
 * ACP, traducerea filtrelor în interogări reale, stabilitatea snapshot-ului și
 * regresia pentru raportul Stage 3.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateMarketStatistics } from "@/lib/acp/statistics";
import { buildAcpReportModel, type AcpReportVersionInput } from "@/lib/acp/report/model";
import {
  MARKET_MIN_DISTRIBUTION_SAMPLE,
  MARKET_MIN_SAMPLE,
  MARKET_POSITION_THRESHOLD_PERCENT,
  aggregateMarketRows,
  buildAcpMarketInsights,
  buildSourceQuality,
  computeMarketPosition,
  computeMarketTrend,
  filterMarketRows,
  marketFiltersFromSubject,
  matchesMarketFilters,
  percentileRank,
  type MarketIntelligenceRow,
} from "./intelligence";
import { computeMarketIntelligence, loadMarketIntelligenceRows } from "./intelligence.server";

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

function row(overrides: Partial<MarketIntelligenceRow> = {}): MarketIntelligenceRow {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    source: "habitoo_internal",
    status: "active",
    city: "București",
    county: "București",
    district: "Sector 1",
    neighborhood: "Aviatorilor",
    address: "Bd. Aviatorilor 10",
    propertyType: "apartament",
    transactionType: "sale",
    rooms: 3,
    usableArea: 80,
    price: 160_000,
    currency: "EUR",
    pricePerSqm: 2000,
    lastSeenAt: new Date("2026-09-14T10:00:00.000Z").toISOString(),
    firstSeenAt: new Date("2026-08-01T10:00:00.000Z").toISOString(),
    ...overrides,
  };
}

/** 10 oferte cu €/mp de la 1800 la 2700. */
function sampleRows(): MarketIntelligenceRow[] {
  return Array.from({ length: 10 }, (_, index) => {
    const ppsm = 1800 + index * 100;
    return row({
      id: `listing-${index}`,
      pricePerSqm: ppsm,
      price: ppsm * 80,
      usableArea: 80,
      rooms: 2 + (index % 3),
    });
  });
}

const NOW = new Date("2026-09-15T12:00:00.000Z").getTime();

/* ------------------------------------------------------------------ */
/* A. Agregări                                                         */
/* ------------------------------------------------------------------ */

describe("agregări de piață", () => {
  it("calculează mediană, medie, min și max din datele reale", () => {
    const aggregate = aggregateMarketRows({ rows: sampleRows(), now: NOW });
    expect(aggregate.pricePerSqm.count).toBe(10);
    expect(aggregate.pricePerSqm.min).toBe(1800);
    expect(aggregate.pricePerSqm.max).toBe(2700);
    expect(aggregate.pricePerSqm.median).toBe(2250);
    expect(aggregate.pricePerSqm.average).toBe(2250);
    expect(aggregate.price.median).toBe(180_000);
    expect(aggregate.usableArea.median).toBe(80);
  });

  it("raportează totalul din baza de date, nu doar eșantionul agregat", () => {
    const aggregate = aggregateMarketRows({ rows: sampleRows(), totalMatched: 4210, now: NOW });
    expect(aggregate.totalMatched).toBe(4210);
    expect(aggregate.sampleSize).toBe(10);
  });

  it("calculează percentile și distribuții când eșantionul este suficient", () => {
    const aggregate = aggregateMarketRows({ rows: sampleRows(), now: NOW });
    expect(aggregate.distributionsAvailable).toBe(true);
    expect(aggregate.pricePerSqm.p25).not.toBeNull();
    expect(aggregate.pricePerSqm.p75).not.toBeNull();
    const total = aggregate.pricePerSqmDistribution.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(10);
    const shares = aggregate.pricePerSqmDistribution.reduce((sum, b) => sum + b.share, 0);
    expect(shares).toBeGreaterThan(99);
    expect(shares).toBeLessThan(101);
    expect(aggregate.roomsDistribution.reduce((sum, b) => sum + b.count, 0)).toBe(10);
    expect(aggregate.areaDistribution.reduce((sum, b) => sum + b.count, 0)).toBe(10);
  });

  it("nu produce distribuții sub pragul minim de oferte", () => {
    const rows = sampleRows().slice(0, MARKET_MIN_DISTRIBUTION_SAMPLE - 1);
    const aggregate = aggregateMarketRows({ rows, now: NOW });
    expect(aggregate.distributionsAvailable).toBe(false);
    expect(aggregate.pricePerSqmDistribution).toEqual([]);
  });

  it("semnalează explicit datele insuficiente", () => {
    const aggregate = aggregateMarketRows({
      rows: sampleRows().slice(0, MARKET_MIN_SAMPLE - 1),
      now: NOW,
    });
    expect(aggregate.insufficient).toBe(true);
    expect(aggregate.insufficientReason).toBeTruthy();
  });

  it("pe zero rânduri nu inventează nicio metrică", () => {
    const aggregate = aggregateMarketRows({ rows: [], now: NOW });
    expect(aggregate.totalMatched).toBe(0);
    expect(aggregate.pricePerSqm.median).toBeNull();
    expect(aggregate.pricePerSqm.average).toBeNull();
    expect(aggregate.insufficient).toBe(true);
    expect(aggregate.freshness.level).toBe("unknown");
    expect(aggregate.coverage.level).toBe("unknown");
  });

  it("tratează valorile null, zero și negative fără NaN sau Infinity", () => {
    const rows = [
      row({ id: "a", price: null, pricePerSqm: null, usableArea: null, rooms: null }),
      row({ id: "b", price: 0, pricePerSqm: null, usableArea: 0 }),
      row({ id: "c", price: -5, pricePerSqm: null, usableArea: 50 }),
      row({ id: "d", price: 100_000, pricePerSqm: null, usableArea: 50 }),
    ];
    const aggregate = aggregateMarketRows({ rows, now: NOW });
    const numbers = [
      aggregate.pricePerSqm.median,
      aggregate.pricePerSqm.average,
      aggregate.price.median,
      aggregate.usableArea.median,
      aggregate.coverage.completeness,
    ];
    for (const value of numbers) {
      if (value !== null) expect(Number.isFinite(value)).toBe(true);
    }
    expect(aggregate.pricePerSqm.count).toBe(1); // doar „d” are €/mp derivabil
    expect(aggregate.pricePerSqm.median).toBe(2000);
  });

  it("calculează mixul surselor și ponderile reale", () => {
    const rows = [
      ...sampleRows().slice(0, 6),
      row({ id: "x1", source: "imobiliare_ro" }),
      row({ id: "x2", source: "imobiliare_ro" }),
    ];
    const aggregate = aggregateMarketRows({ rows, now: NOW });
    const mix = new Map(aggregate.sourceMix.map((entry) => [entry.source, entry]));
    expect(mix.get("habitoo_internal")?.count).toBe(6);
    expect(mix.get("imobiliare_ro")?.count).toBe(2);
    expect(mix.get("imobiliare_ro")?.share).toBeCloseTo(25, 1);
    expect(aggregate.statusMix[0]?.status).toBe("active");
  });

  it("clasifică prospețimea după vechimea datelor", () => {
    const fresh = aggregateMarketRows({
      rows: [row({ lastSeenAt: new Date(NOW - 2 * 86_400_000).toISOString() })],
      now: NOW,
    });
    const aging = aggregateMarketRows({
      rows: [row({ lastSeenAt: new Date(NOW - 12 * 86_400_000).toISOString() })],
      now: NOW,
    });
    const stale = aggregateMarketRows({
      rows: [row({ lastSeenAt: new Date(NOW - 200 * 86_400_000).toISOString() })],
      now: NOW,
    });
    expect(fresh.freshness.level).toBe("fresh");
    expect(aging.freshness.level).toBe("aging");
    expect(stale.freshness.level).toBe("stale");
    expect(stale.freshness.ageDays).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/* B. Filtre                                                           */
/* ------------------------------------------------------------------ */

describe("filtre de piață", () => {
  const rows = [
    row({ id: "1", city: "București", propertyType: "apartament", rooms: 2, usableArea: 55, pricePerSqm: 2000, price: 110_000 }),
    row({ id: "2", city: "Cluj-Napoca", propertyType: "apartament", rooms: 3, usableArea: 80, pricePerSqm: 2600, price: 208_000 }),
    row({ id: "3", city: "București", propertyType: "casa", rooms: 5, usableArea: 180, pricePerSqm: 1500, price: 270_000 }),
    row({ id: "4", city: "București", propertyType: "apartament", rooms: 3, usableArea: 78, pricePerSqm: 2100, price: 163_800, status: "inactive" }),
  ];

  it("filtrează pe localitate, indiferent de diacritice majuscule", () => {
    expect(filterMarketRows(rows, { city: "bucurești" }).map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("filtrează pe zonă prin potrivire parțială", () => {
    expect(filterMarketRows(rows, { area: "aviator" }).length).toBe(3);
    expect(filterMarketRows(rows, { area: "titan" }).length).toBe(0);
  });

  it("filtrează pe tip, camere, suprafață, preț și €/mp", () => {
    expect(filterMarketRows(rows, { propertyType: "casa" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterMarketRows(rows, { roomsMin: 3, roomsMax: 3 }).map((r) => r.id)).toEqual(["2"]);
    expect(filterMarketRows(rows, { areaMin: 100 }).map((r) => r.id)).toEqual(["3"]);
    expect(filterMarketRows(rows, { priceMax: 150_000 }).map((r) => r.id)).toEqual(["1"]);
    expect(filterMarketRows(rows, { pricePerSqmMin: 2500 }).map((r) => r.id)).toEqual(["2"]);
  });

  it("filtrează pe status și pe sursă", () => {
    expect(filterMarketRows(rows, { status: "inactive" }).map((r) => r.id)).toEqual(["4"]);
    expect(filterMarketRows(rows, { status: "all" }).length).toBe(4);
    expect(filterMarketRows(rows, { sources: ["storia"] }).length).toBe(0);
    expect(filterMarketRows(rows, { sources: ["habitoo_internal"], status: "all" }).length).toBe(4);
  });

  it("combină filtrele cumulativ", () => {
    const result = filterMarketRows(rows, {
      city: "București",
      propertyType: "apartament",
      roomsMin: 2,
      roomsMax: 3,
      pricePerSqmMax: 2050,
      status: "active",
    });
    expect(result.map((r) => r.id)).toEqual(["1"]);
  });

  it("respectă fereastra temporală pe ultima observare", () => {
    const old = row({ id: "old", lastSeenAt: new Date(NOW - 90 * 86_400_000).toISOString() });
    expect(matchesMarketFilters(old, { seenWithinDays: 30 }, NOW)).toBe(false);
    expect(matchesMarketFilters(old, { seenWithinDays: 180 }, NOW)).toBe(true);
    expect(matchesMarketFilters(row({ lastSeenAt: null }), { seenWithinDays: 30 }, NOW)).toBe(false);
  });

  it("filtrele schimbă efectiv agregările", () => {
    const all = aggregateMarketRows({ rows, now: NOW });
    const filtered = aggregateMarketRows({
      rows: filterMarketRows(rows, { propertyType: "apartament" }),
      now: NOW,
    });
    expect(filtered.sampleSize).toBeLessThan(all.sampleSize);
    expect(filtered.pricePerSqm.median).not.toBe(all.pricePerSqm.median);
  });
});

/* ------------------------------------------------------------------ */
/* C. Trenduri                                                         */
/* ------------------------------------------------------------------ */

describe("trenduri de piață", () => {
  function observations() {
    const months = ["2026-06", "2026-07", "2026-08"];
    return months.flatMap((month, index) =>
      Array.from({ length: 3 }, (_, i) => ({
        listingId: `l-${i}`,
        capturedAt: `${month}-10T00:00:00.000Z`,
        price: 160_000 + index * 4000,
        pricePerSqm: 2000 + index * 50,
      })),
    );
  }

  it("construiește puncte lunare din snapshot-uri reale", () => {
    const trend = computeMarketTrend(observations());
    expect(trend.available).toBe(true);
    expect(trend.points.map((p) => p.bucket)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(trend.points[0]?.medianPricePerSqm).toBe(2000);
    expect(trend.points[2]?.medianPricePerSqm).toBe(2100);
    expect(trend.changePercent).toBeCloseTo(5, 1);
  });

  it("nu fabricăm serii când istoricul lipsește", () => {
    const trend = computeMarketTrend([]);
    expect(trend.available).toBe(false);
    expect(trend.points).toEqual([]);
    expect(trend.changePercent).toBeNull();
    expect(trend.reason).toContain("Date istorice insuficiente");
  });

  it("marchează trendul indisponibil când lunile au prea puține observații", () => {
    const trend = computeMarketTrend([
      { listingId: "a", capturedAt: "2026-06-10T00:00:00Z", price: 1, pricePerSqm: 2000 },
      { listingId: "b", capturedAt: "2026-07-10T00:00:00Z", price: 1, pricePerSqm: 2100 },
      { listingId: "c", capturedAt: "2026-08-10T00:00:00Z", price: 1, pricePerSqm: 2200 },
    ]);
    expect(trend.available).toBe(false);
    expect(trend.points.length).toBe(3);
    expect(trend.reason).toContain("insuficiente");
  });
});

/* ------------------------------------------------------------------ */
/* D. Poziționare                                                      */
/* ------------------------------------------------------------------ */

describe("poziționarea față de piață", () => {
  const aggregate = aggregateMarketRows({ rows: sampleRows(), now: NOW });
  const sample = sampleRows().map((r) => r.pricePerSqm!);

  it("aplică pragurile sub/în/peste piață în mod determinist", () => {
    const median = aggregate.pricePerSqm.median!;
    const under = computeMarketPosition({ valuePerSqm: median * 0.8, aggregate });
    const inside = computeMarketPosition({ valuePerSqm: median, aggregate });
    const over = computeMarketPosition({ valuePerSqm: median * 1.2, aggregate });
    expect(under.band).toBe("under");
    expect(inside.band).toBe("in");
    expect(over.band).toBe("over");
    expect(inside.thresholdPercent).toBe(MARKET_POSITION_THRESHOLD_PERCENT);
    expect(over.deltaVsMedianPercent).toBeCloseTo(20, 1);
  });

  it("este stabilă exact la limita pragului", () => {
    const median = aggregate.pricePerSqm.median!;
    const atThreshold = computeMarketPosition({
      valuePerSqm: median * (1 + MARKET_POSITION_THRESHOLD_PERCENT / 100),
      aggregate,
    });
    expect(atThreshold.band).toBe("in");
  });

  it("rămâne nedeterminată fără preț sau fără date suficiente", () => {
    expect(computeMarketPosition({ valuePerSqm: null, aggregate }).band).toBe("unknown");
    const thin = aggregateMarketRows({ rows: [], now: NOW });
    const result = computeMarketPosition({ valuePerSqm: 2000, aggregate: thin });
    expect(result.band).toBe("unknown");
    expect(result.reason).toBeTruthy();
  });

  it("calculează percentila doar cu eșantion suficient", () => {
    expect(percentileRank(sample, 2250)).toBeCloseTo(50, 1);
    expect(percentileRank([1000, 1100], 1050)).toBeNull();
    const position = computeMarketPosition({ valuePerSqm: 2250, aggregate, sampleValues: sample });
    expect(position.percentileRank).toBeCloseTo(50, 1);
  });
});

/* ------------------------------------------------------------------ */
/* E. Consistență cu ACP                                               */
/* ------------------------------------------------------------------ */

describe("consistența cu statistica ACP", () => {
  it("mediana Market Intelligence coincide cu mediana motorului ACP pe același set", () => {
    const rows = sampleRows();
    const aggregate = aggregateMarketRows({ rows, now: NOW });
    const acp = calculateMarketStatistics(
      rows.map((r) => ({ price: r.price, usableArea: r.usableArea, pricePerSqm: r.pricePerSqm })),
    );
    expect(aggregate.price.median).toBe(acp.median);
    expect(aggregate.price.average).toBe(acp.average);
    expect(aggregate.pricePerSqm.median).toBe(acp.medianPricePerSqm);
    expect(aggregate.pricePerSqm.average).toBe(acp.averagePricePerSqm);
  });

  it("derivă filtrele relevante din proprietatea analizată", () => {
    const filters = marketFiltersFromSubject({
      propertyType: "apartament",
      transactionType: "sale",
      city: "București",
      county: "București",
      rooms: 3,
      usableArea: 80,
    });
    expect(filters.propertyType).toBe("apartament");
    expect(filters.roomsMin).toBe(2);
    expect(filters.roomsMax).toBe(4);
    expect(filters.areaMin).toBe(56);
    expect(filters.areaMax).toBe(104);
    expect(filters.status).toBe("active");
  });

  it("suprascrierile utilizatorului au prioritate față de derivare", () => {
    const filters = marketFiltersFromSubject({ city: "București", rooms: 3 }, { city: "Cluj-Napoca", roomsMin: 1 });
    expect(filters.city).toBe("Cluj-Napoca");
    expect(filters.roomsMin).toBe(1);
  });

  it("reflectă numărul de comparabile eligibile și excluse", () => {
    const aggregate = aggregateMarketRows({ rows: sampleRows(), now: NOW });
    const insights = buildAcpMarketInsights({
      aggregate,
      samplePricePerSqm: sampleRows().map((r) => r.pricePerSqm!),
      targetPricePerSqm: 2250,
      estimatedValue: 180_000,
      recommendedListingPrice: 189_000,
      usableArea: 80,
      comparables: [
        { isSelected: true, isOutlier: false },
        { isSelected: true, isOutlier: false },
        { isSelected: false, isOutlier: true },
      ],
    });
    expect(insights.comparables).toEqual({ total: 3, used: 2, excluded: 1, outliers: 1 });
    expect(insights.property.band).toBe("in");
    expect(insights.recommended.band).toBe("in");
    expect(insights.estimateVsMarketPercent).toBeCloseTo(0, 1);
  });

  it("nu produce procente pe suprafață lipsă sau zero", () => {
    const aggregate = aggregateMarketRows({ rows: sampleRows(), now: NOW });
    const insights = buildAcpMarketInsights({
      aggregate,
      targetPricePerSqm: null,
      estimatedValue: 180_000,
      recommendedListingPrice: 189_000,
      usableArea: 0,
      comparables: [],
    });
    expect(insights.estimateVsMarketPercent).toBeNull();
    expect(insights.recommended.band).toBe("unknown");
    expect(insights.property.band).toBe("unknown");
  });
});

/* ------------------------------------------------------------------ */
/* F. Surse                                                            */
/* ------------------------------------------------------------------ */

describe("calitatea și prospețimea surselor", () => {
  it("păstrează sursele neconfigurate ca neconfigurate, fără cifre inventate", () => {
    const quality = buildSourceQuality({
      sources: [
        {
          id: "storia",
          name: "Storia.ro",
          configured: false,
          syncStatus: null,
          lastSyncAt: null,
          lastSuccessAt: null,
          lastError: null,
          total: 0,
          active: 0,
          duplicates: 0,
          itemsInvalidLastRun: null,
          lastSeenAt: null,
        },
      ],
      now: NOW,
    });
    expect(quality[0]?.configured).toBe(false);
    expect(quality[0]?.recordsTotal).toBe(0);
    expect(quality[0]?.recordsRejected).toBeNull();
    expect(quality[0]?.freshness.level).toBe("unknown");
    expect(quality[0]?.sharePercent).toBeNull();
  });

  it("raportează starea reală și ponderea sursei configurate", () => {
    const quality = buildSourceQuality({
      sources: [
        {
          id: "habitoo_internal",
          name: "Portofoliul Habitoo",
          configured: true,
          syncStatus: "success",
          lastSyncAt: new Date(NOW - 3600_000).toISOString(),
          lastSuccessAt: new Date(NOW - 3600_000).toISOString(),
          lastError: null,
          total: 120,
          active: 100,
          duplicates: 4,
          itemsInvalidLastRun: 2,
          lastSeenAt: new Date(NOW - 86_400_000).toISOString(),
        },
      ],
      mix: [{ source: "habitoo_internal", count: 100, share: 100, lastSeenAt: null }],
      now: NOW,
    });
    expect(quality[0]?.syncStatus).toBe("success");
    expect(quality[0]?.recordsActive).toBe(100);
    expect(quality[0]?.recordsDeduplicated).toBe(4);
    expect(quality[0]?.recordsRejected).toBe(2);
    expect(quality[0]?.freshness.level).toBe("fresh");
    expect(quality[0]?.sharePercent).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/* G. Integrare cu stratul de date (client Supabase simulat)           */
/* ------------------------------------------------------------------ */

type Call = { method: string; args: unknown[] };

/** Constructor de interogări care înregistrează exact ce s-a cerut bazei. */
function fakeAdmin(tables: Record<string, { rows: unknown[]; count?: number }>) {
  const calls: { table: string; calls: Call[] }[] = [];

  function builder(table: string) {
    const record: { table: string; calls: Call[] } = { table, calls: [] };
    calls.push(record);
    const data = tables[table]?.rows ?? [];
    const count = tables[table]?.count ?? data.length;
    const result = { data, count, error: null };
    const single = { data: data[0] ?? null, count, error: null };

    const proxy: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "neq",
      "in",
      "gte",
      "lte",
      "ilike",
      "or",
      "not",
      "order",
      "limit",
      "range",
    ]) {
      proxy[method] = (...args: unknown[]) => {
        record.calls.push({ method, args });
        return proxy;
      };
    }
    proxy["maybeSingle"] = () => {
      record.calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(single);
    };
    proxy["then"] = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return proxy;
  }

  return {
    client: {
      from: (table: string) => builder(table),
      rpc: () => Promise.resolve({ data: true, error: null }),
    },
    calls,
  };
}

describe("stratul de date Market Intelligence", () => {
  const dbRows = [
    {
      id: "db-1",
      source: "habitoo_internal",
      status: "active",
      city: "București",
      county: "București",
      district: "Sector 1",
      neighborhood: "Aviatorilor",
      address: "Bd. Aviatorilor 10",
      property_type: "apartament",
      transaction_type: "sale",
      rooms: 3,
      usable_area: 80,
      total_area: 90,
      price: 176_000,
      currency: "EUR",
      price_per_sqm: 2200,
      last_seen_at: "2026-09-14T10:00:00.000Z",
      first_seen_at: "2026-08-01T10:00:00.000Z",
    },
  ];

  it("traduce filtrele în condiții SQL și plafonează eșantionul", async () => {
    const { client, calls } = fakeAdmin({ market_listings: { rows: dbRows, count: 731 } });
    const { rows, totalMatched } = await loadMarketIntelligenceRows(client as never, {
      city: "București",
      area: "Aviatorilor",
      propertyType: "apartament",
      transactionType: "sale",
      roomsMin: 2,
      roomsMax: 4,
      areaMin: 56,
      areaMax: 104,
      priceMin: 100_000,
      priceMax: 300_000,
      pricePerSqmMin: 1500,
      pricePerSqmMax: 3000,
      sources: ["habitoo_internal"],
      status: "active",
      seenWithinDays: 30,
    });

    expect(totalMatched).toBe(731);
    expect(rows[0]?.pricePerSqm).toBe(2200);
    const used = calls[0]!.calls;
    const methods = used.map((c) => c.method);
    expect(methods).toContain("ilike");
    expect(methods).toContain("or");
    expect(methods.filter((m) => m === "gte").length).toBeGreaterThanOrEqual(4);
    expect(methods.filter((m) => m === "lte").length).toBeGreaterThanOrEqual(4);
    expect(used.find((c) => c.method === "in")?.args[1]).toEqual(["habitoo_internal"]);
    expect(used.find((c) => c.method === "limit")?.args[0]).toBe(5000);
    expect(used.find((c) => c.method === "eq" && c.args[0] === "status")?.args[1]).toBe("active");
  });

  it("nu filtrează pe status când se cer toate anunțurile", async () => {
    const { client, calls } = fakeAdmin({ market_listings: { rows: dbRows } });
    await loadMarketIntelligenceRows(client as never, { status: "all" });
    expect(calls[0]!.calls.some((c) => c.method === "eq" && c.args[0] === "status")).toBe(false);
  });

  it("agregă pe pool gol fără metrici estimate", async () => {
    const { client } = fakeAdmin({ market_listings: { rows: [], count: 0 } });
    const result = await computeMarketIntelligence(client as never, { status: "active" });
    expect(result.aggregate.totalMatched).toBe(0);
    expect(result.aggregate.pricePerSqm.median).toBeNull();
    expect(result.trend?.available).toBe(false);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((s) => s.recordsTotal === 0)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* H. Snapshot / raport (regresie Stage 2 + Stage 3)                   */
/* ------------------------------------------------------------------ */

function reportVersion(overrides: Partial<AcpReportVersionInput> = {}): AcpReportVersionInput {
  return {
    analysisId: "analysis-1",
    rootAnalysisId: "analysis-1",
    title: "Analiză test",
    status: "completed",
    errorMessage: null,
    version: 2,
    createdAt: "2026-09-14T10:00:00.000Z",
    snapshotAt: "2026-09-14T10:00:00.000Z",
    authorName: "Agent Test",
    currency: "EUR",
    target: {
      title: "Apartament 3 camere",
      reference: "HB-1001",
      locationLabel: "București, Sector 1",
      capturedAt: "2026-09-14T10:00:00.000Z",
      pricePerSqm: 2250,
      subject: { propertyType: "apartament", usableArea: 80, price: 180_000, currency: "EUR" },
    },
    estimate: {
      estimatedMin: 170_000,
      estimatedValue: 180_000,
      estimatedMax: 190_000,
      recommendedListingPrice: 189_000,
    },
    statistics: {
      medianPricePerSqm: 2250,
      averagePricePerSqm: 2250,
      median: 180_000,
      average: 180_000,
      minimum: 144_000,
      maximum: 216_000,
      p25: 162_000,
      p75: 198_000,
    },
    confidence: { score: 72, quantity: 70, quality: 75, dispersion: 70 },
    explanation: [],
    comparables: [],
    sources: [],
    ai: null,
    ...overrides,
  };
}

describe("raportul ACP și snapshot-ul de piață", () => {
  const marketSnapshot = {
    capturedAt: "2026-09-14T10:00:00.000Z",
    aggregate: {
      totalMatched: 42,
      sampleSize: 42,
      pricePerSqm: {
        count: 40,
        min: 1800,
        max: 2700,
        average: 2250,
        median: 2250,
        p25: 2025,
        p75: 2475,
      },
      freshness: {
        lastSeenAt: "2026-09-13T10:00:00.000Z",
        lastSyncAt: "2026-09-13T11:00:00.000Z",
        level: "fresh",
      },
      coverage: { level: "good", completeness: 92 },
      sourceMix: [{ source: "habitoo_internal", count: 42, share: 100 }],
      insufficient: false,
      insufficientReason: null,
    },
    insights: {
      property: { label: "În piață", deltaVsMedianPercent: 0, percentileRank: 50 },
      recommended: { label: "Peste piață", deltaVsMedianPercent: 5 },
      estimateVsMarketPercent: 0,
    },
  };

  it("include în raport statisticile de piață din snapshotul versiunii", () => {
    const model = buildAcpReportModel({
      version: reportVersion({ market: marketSnapshot }),
      agency: { name: "Habitoo" },
      reportNumber: 1,
      generatedAt: "2026-09-20T09:00:00.000Z",
    });
    expect(model.market).not.toBeNull();
    expect(model.market!.capturedAt).toBe("2026-09-14T10:00:00.000Z");
    const labels = model.market!.rows.map((r) => r.label);
    expect(labels).toContain("Mediană € / mp piață");
    expect(labels).toContain("Poziționarea prețului proprietății");
    expect(model.market!.note).toBeNull();
  });

  it("raportul unei versiuni istorice nu se schimbă când piața evoluează ulterior", () => {
    const historic = buildAcpReportModel({
      version: reportVersion({ market: marketSnapshot }),
      agency: { name: "Habitoo" },
      reportNumber: 1,
      generatedAt: "2026-12-01T09:00:00.000Z",
    });
    const medianRow = historic.market!.rows.find((r) => r.label === "Mediană € / mp piață");
    expect(medianRow?.value).toContain("2.250");
    // Piața live s-a schimbat, dar snapshotul rămâne autoritar.
    const live = aggregateMarketRows({
      rows: sampleRows().map((r) => ({ ...r, pricePerSqm: 3000, price: 240_000 })),
      now: NOW,
    });
    expect(live.pricePerSqm.median).toBe(3000);
    expect(historic.market!.rows.find((r) => r.label === "Mediană € / mp piață")?.value).toBe(
      medianRow?.value,
    );
  });

  it("marchează explicit datele de piață insuficiente în raport", () => {
    const model = buildAcpReportModel({
      version: reportVersion({
        market: {
          ...marketSnapshot,
          aggregate: {
            ...marketSnapshot.aggregate,
            insufficient: true,
            insufficientReason: "Prea puține oferte comparabile în zonă.",
          },
        },
      }),
      agency: { name: "Habitoo" },
      reportNumber: 1,
      generatedAt: "2026-09-20T09:00:00.000Z",
    });
    expect(model.market!.note).toBe("Prea puține oferte comparabile în zonă.");
  });

  it("rămâne compatibil cu rapoartele fără snapshot de piață (regresie Stage 3)", () => {
    const model = buildAcpReportModel({
      version: reportVersion(),
      agency: { name: "Habitoo" },
      reportNumber: 1,
      generatedAt: "2026-09-20T09:00:00.000Z",
    });
    expect(model.market).toBeNull();
    expect(model.summary.length).toBeGreaterThan(0);
    expect(model.analysisVersion).toBe(2);
    expect(model.ai).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* I. Securitate                                                       */
/* ------------------------------------------------------------------ */

describe("securitatea funcțiilor Market Intelligence", () => {
  const source = readFileSync("src/lib/market/intelligence.functions.ts", "utf8");

  it("cere autentificare cu organizație activă", () => {
    expect(source).toContain("requireActiveOrgAuth");
    expect(source.match(/middleware\(\[requireActiveOrgAuth\]\)/g)?.length).toBe(2);
  });

  it("validează intrările cu Zod", () => {
    expect(source).toContain("inputValidator");
    expect(source).toContain("z.string().uuid()");
  });

  it("izolează analizele pe organizație", () => {
    expect(source).toContain('.eq("organization_id", organizationId)');
    expect(source).toContain("Analiza nu a fost găsită în agenția ta.");
  });

  it("limitează frecvența interogărilor costisitoare", () => {
    expect(source).toContain("rate_limit_hit");
    expect(source).toContain("market_intelligence:user:");
  });

  it("nu relaxează politicile RLS existente", () => {
    const migration = readFileSync(
      "drizzle/migrations/0037_market_intelligence_indexes.sql",
      "utf8",
    );
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/DROP/i);
    expect(migration).not.toMatch(/GRANT/i);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS/);
  });
});
