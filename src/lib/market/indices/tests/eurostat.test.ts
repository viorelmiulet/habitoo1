/**
 * Teste pentru stratul de date al indicelui Eurostat.
 *
 * Fără apeluri live: răspunsul HTTP este un eșantion capturat de la API-ul
 * real, cu formă JSON-stat 2.0.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  EUROSTAT_HPI_DATASET,
  EUROSTAT_HPI_UNIT,
  eurostatHpiUrl,
  indexRatio,
  parseEurostatHpi,
  parseQuarterLabel,
  quarterOfDate,
  type MarketIndexPoint,
} from "../eurostat";
import {
  EurostatFetchError,
  createIndicesRepository,
  fetchEurostatSeries,
  syncMarketPriceIndices,
  upsertIndexSeries,
  type IndicesRepository,
  type MarketPriceIndexRow,
  type StoredIndexPoint,
} from "../eurostat.server";
import { SAMPLE_HPI_TOTAL, sampleResponse } from "./sample";

const deps = { sleep: async () => {} };

describe("Eurostat — URL și parametri", () => {
  it("folosește setul de date și parametrii verificați live", () => {
    const url = new URL(eurostatHpiUrl("existing_dwellings"));
    expect(url.origin + url.pathname).toBe(
      `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${EUROSTAT_HPI_DATASET}`,
    );
    expect(url.searchParams.get("geo")).toBe("RO");
    expect(url.searchParams.get("unit")).toBe(EUROSTAT_HPI_UNIT);
    expect(url.searchParams.get("purchase")).toBe("DW_EXST");
    expect(url.searchParams.get("freq")).toBe("Q");
    expect(url.searchParams.get("format")).toBe("JSON");
    expect(eurostatHpiUrl("total", { lastTimePeriod: 1 })).toContain("lastTimePeriod=1");
  });
});

describe("Eurostat — interpretarea răspunsului", () => {
  it("citește valorile prin hărțile de indici, nu pozițional", () => {
    const parsed = parseEurostatHpi(SAMPLE_HPI_TOTAL, "total");
    expect(parsed.dataset).toBe(EUROSTAT_HPI_DATASET);
    expect(parsed.points.length).toBe(4);
    expect(parsed.points[0]).toEqual({ series: "total", year: 2024, quarter: 3, value: 155.86 });
    expect(parsed.points.at(-1)).toEqual({
      series: "total",
      year: 2025,
      quarter: 2,
      value: 162.38,
    });
    expect(parsed.publishedAt).toBe(new Date("2026-07-02T11:00:00+0200").toISOString());
    expect(parsed.baseLabel).toBe("2015=100");
  });

  it("ignoră trimestrele nepublicate și numără valorile invalide", () => {
    const payload = sampleResponse({
      "2024-Q3": 100,
      "2024-Q4": null,
      "2025-Q1": Number.NaN,
    });
    const parsed = parseEurostatHpi(payload, "total");
    expect(parsed.points.map((p) => p.quarter)).toEqual([3]);
    expect(parsed.invalid).toBe(1);
  });

  it("respinge un răspuns fără dimensiuni", () => {
    expect(() => parseEurostatHpi({ value: {} }, "total")).toThrow();
  });
});

describe("Eurostat — perioade și raport", () => {
  const points: MarketIndexPoint[] = [
    { series: "total", year: 2024, quarter: 1, value: 100 },
    { series: "total", year: 2025, quarter: 1, value: 110 },
  ];

  it("raportul normal este index(țintă)/index(sursă)", () => {
    const ratio = indexRatio(points, { year: 2024, quarter: 1 }, { year: 2025, quarter: 1 });
    expect(ratio).toBeCloseTo(1.1, 10);
  });

  it("perioade identice dau exact 1", () => {
    expect(indexRatio(points, { year: 2024, quarter: 1 }, { year: 2024, quarter: 1 })).toBe(1);
    expect(indexRatio([], { year: 2030, quarter: 2 }, { year: 2030, quarter: 2 })).toBe(1);
  });

  it("o perioadă lipsă nu produce nicio ajustare", () => {
    expect(indexRatio(points, { year: 2023, quarter: 4 }, { year: 2025, quarter: 1 })).toBeNull();
    expect(indexRatio(points, { year: 2024, quarter: 1 }, { year: 2026, quarter: 1 })).toBeNull();
  });

  it("mapează data în trimestru", () => {
    expect(quarterOfDate("2025-01-15T00:00:00Z")).toEqual({ year: 2025, quarter: 1 });
    expect(quarterOfDate("2025-12-31T23:00:00Z")).toEqual({ year: 2025, quarter: 4 });
    expect(parseQuarterLabel("2025-Q4")).toEqual({ year: 2025, quarter: 4 });
    expect(parseQuarterLabel("2025-Q5")).toBeNull();
  });
});

/** Repository fals, cu cheia unică respectată la scriere. */
function fakeRepository(seed: StoredIndexPoint[] = []) {
  const rows = new Map<string, StoredIndexPoint & { series: string }>();
  for (const point of seed) {
    rows.set(`total-${point.year}-${point.quarter}`, { ...point, series: "total" });
  }
  const runs: { id: string; status: string; counts: unknown; errors: string[] }[] = [];
  const writes: MarketPriceIndexRow[][] = [];

  const repository: IndicesRepository = {
    async listPoints(series) {
      return [...rows.values()]
        .filter((row) => row.series === series)
        .map(({ id, year, quarter, value, publishedAt }) => ({
          id,
          year,
          quarter,
          value,
          publishedAt,
        }));
    },
    async writePoints(batch) {
      writes.push(batch);
      for (const row of batch) {
        const key = `${row.series}-${row.period_year}-${row.period_quarter}`;
        const existing = rows.get(key);
        rows.set(key, {
          id: existing?.id ?? key,
          series: row.series,
          year: row.period_year,
          quarter: row.period_quarter,
          value: row.index_value,
          publishedAt: row.published_at,
        });
      }
    },
    async createRun() {
      const id = `run-${runs.length + 1}`;
      runs.push({ id, status: "running", counts: null, errors: [] });
      return id;
    },
    async finishRun(runId, patch) {
      const run = runs.find((r) => r.id === runId);
      if (run) Object.assign(run, patch);
    },
    async coverage() {
      return [];
    },
    async lastRuns() {
      return [];
    },
  };

  return { repository, rows, runs, writes };
}

describe("Eurostat — upsert pe cheia unică", () => {
  it("scrie rânduri noi o singură dată", async () => {
    const { repository, rows } = fakeRepository();
    const parsed = parseEurostatHpi(SAMPLE_HPI_TOTAL, "total");
    const first = await upsertIndexSeries(repository, parsed, "run-1");
    expect(first).toMatchObject({ received: 4, created: 4, updated: 0, unchanged: 0 });
    const second = await upsertIndexSeries(repository, parsed, "run-2");
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 4 });
    expect(rows.size).toBe(4);
  });

  it("o valoare revizuită actualizează rândul și se numără ca `updated`", async () => {
    const { repository, rows } = fakeRepository();
    await upsertIndexSeries(repository, parseEurostatHpi(SAMPLE_HPI_TOTAL, "total"), "run-1");
    const revised = sampleResponse({
      "2024-Q3": 155.86,
      "2024-Q4": 158.36,
      "2025-Q1": 161.75,
      "2025-Q2": 163.99,
    });
    const counts = await upsertIndexSeries(repository, parseEurostatHpi(revised, "total"), "run-2");
    expect(counts).toMatchObject({ received: 4, created: 0, updated: 1, unchanged: 3 });
    expect(rows.size).toBe(4);
    expect(rows.get("total-2025-2")?.value).toBe(163.99);
  });

  it("cheia de conflict din interogare corespunde constrângerii unice", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: () => ({ upsert }) } as never;
    await createIndicesRepository(admin).writePoints([
      {
        source: "eurostat",
        dataset: EUROSTAT_HPI_DATASET,
        series: "total",
        region: "RO",
        unit: EUROSTAT_HPI_UNIT,
        period_year: 2025,
        period_quarter: 1,
        index_value: 100,
        base_label: "2015=100",
        published_at: null,
        import_run_id: null,
      },
    ]);
    expect(upsert.mock.calls[0]?.[1]).toEqual({
      onConflict: "source,dataset,series,region,unit,period_year,period_quarter",
    });
  });
});

describe("Eurostat — politica de reîncercare", () => {
  function jsonResponse(payload: unknown) {
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  }

  it("reîncearcă erorile tranzitorii și reușește", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(jsonResponse(SAMPLE_HPI_TOTAL));
    const parsed = await fetchEurostatSeries("total", { ...deps, fetchImpl: fetchImpl as never });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(parsed.points.length).toBe(4);
  });

  it("nu reîncearcă un 4xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(
      fetchEurostatSeries("total", { ...deps, fetchImpl: fetchImpl as never }),
    ).rejects.toBeInstanceOf(EurostatFetchError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("se oprește după 3 reîncercări tranzitorii", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(
      fetchEurostatSeries("total", { ...deps, fetchImpl: fetchImpl as never }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe("Eurostat — worker", () => {
  function fetcher(payloads: Record<string, unknown>) {
    return vi.fn(async (input: string) => {
      const purchase = new URL(input).searchParams.get("purchase") ?? "";
      return { ok: true, status: 200, json: async () => payloads[purchase] } as unknown as Response;
    });
  }

  it("nu face nimic când cel mai nou trimestru e deja stocat", async () => {
    const published = new Date("2026-07-02T11:00:00+0200").toISOString();
    const { repository, runs, writes } = fakeRepository();
    // Seed pe toate seriile: cel mai nou trimestru publicat, deja stocat.
    await repository.writePoints(
      ["total", "new_dwellings", "existing_dwellings"].map((series) => ({
        source: "eurostat",
        dataset: EUROSTAT_HPI_DATASET,
        series,
        region: "RO",
        unit: EUROSTAT_HPI_UNIT,
        period_year: 2025,
        period_quarter: 2,
        index_value: 162.38,
        base_label: "2015=100",
        published_at: published,
        import_run_id: null,
      })),
    );
    writes.length = 0;

    const payload = sampleResponse({ "2025-Q2": 162.38 });
    const fetchImpl = fetcher({
      TOTAL: payload,
      DW_NEW: payload,
      DW_EXST: payload,
    });
    const outcome = await syncMarketPriceIndices(repository, {
      deps: { ...deps, fetchImpl: fetchImpl as never },
    });
    expect(outcome.status).toBe("skipped");
    expect(outcome.counts).toMatchObject({ received: 0, created: 0, updated: 0 });
    expect(writes.length).toBe(0);
    expect(runs.at(-1)).toMatchObject({ status: "skipped" });
  });

  it("aduce istoricul și jurnalizează rularea când apar date noi", async () => {
    const { repository, runs } = fakeRepository();
    const payload = sampleResponse({ "2025-Q1": 161.75, "2025-Q2": 162.38 });
    const fetchImpl = fetcher({ TOTAL: payload, DW_NEW: payload, DW_EXST: payload });
    const outcome = await syncMarketPriceIndices(repository, {
      deps: { ...deps, fetchImpl: fetchImpl as never },
    });
    expect(outcome.status).toBe("completed");
    expect(outcome.counts.created).toBe(6);
    expect(runs.at(-1)).toMatchObject({ status: "completed", errors: [] });
  });

  it("jurnalizează erorile fără să piardă seriile reușite", async () => {
    const { repository, runs } = fakeRepository();
    const payload = sampleResponse({ "2025-Q2": 162.38 });
    const fetchImpl = vi.fn(async (input: string) => {
      const purchase = new URL(input).searchParams.get("purchase");
      if (purchase === "DW_NEW") return { ok: false, status: 404 } as Response;
      return { ok: true, status: 200, json: async () => payload } as unknown as Response;
    });
    const outcome = await syncMarketPriceIndices(repository, {
      force: true,
      deps: { ...deps, fetchImpl: fetchImpl as never },
    });
    expect(outcome.status).toBe("completed");
    expect(outcome.errors.length).toBe(1);
    expect(runs.at(-1)).toMatchObject({ status: "completed" });
  });
});

describe("Eurostat — acces și izolare", () => {
  const migration = readFileSync("drizzle/migrations/0057_market_price_indices.sql", "utf8");

  it("tabelul este protejat prin RLS, citibil doar de superadmin", () => {
    expect(migration).toContain("ALTER TABLE public.market_price_indices ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("GRANT SELECT ON public.market_price_indices TO authenticated");
    expect(migration).toContain("GRANT ALL ON public.market_price_indices TO service_role");
    expect(migration).not.toContain("TO anon");
    expect(migration).toContain("public.is_superadmin()");
    expect(migration).not.toMatch(/FOR (INSERT|UPDATE|DELETE) TO (authenticated|anon)/);
  });

  it("cheia unică include toate coloanele de identitate", () => {
    expect(migration).toContain(
      "(source, dataset, series, region, unit, period_year, period_quarter)",
    );
  });

  it("funcțiile de server cer superadmin", async () => {
    const source = readFileSync("src/lib/market/indices/indices.functions.ts", "utf8");
    expect(source).toContain("requireSuperadmin");
    expect(source.match(/requireSuperadmin\(context/g)?.length).toBe(2);
  });

  it("niciun cod de analiză ACP nu citește încă tabelul", () => {
    const files = readdirSync("src/lib/acp", { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => join("src/lib/acp", entry));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("market_price_indices");
      expect(source).not.toContain("market/indices");
    }
  });
});
