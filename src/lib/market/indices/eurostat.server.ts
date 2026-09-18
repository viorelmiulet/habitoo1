/**
 * Indicele trimestrial al prețurilor locuințelor (Eurostat) — strat server.
 *
 * Aduce istoricul complet publicat pentru România, în formă de indice, și îl
 * scrie în `market_price_indices` prin upsert pe cheia unică. Revizuirile
 * Eurostat (valori schimbate pentru trimestre trecute) actualizează rândul
 * existent și sunt numărate ca `updated`, niciodată duplicate.
 *
 * Rulează exclusiv server-side, cu clientul privilegiat. Nimic din ACP nu
 * citește încă acest tabel.
 */
import {
  EUROSTAT_HPI_BASE_LABEL,
  EUROSTAT_HPI_DATASET,
  EUROSTAT_HPI_REGION,
  EUROSTAT_HPI_UNIT,
  EUROSTAT_SOURCE,
  MARKET_INDEX_SERIES_LIST,
  comparePeriods,
  eurostatHpiUrl,
  newestPoint,
  parseEurostatHpi,
  type EurostatParseResult,
  type MarketIndexPoint,
  type MarketIndexSeries,
  type QuarterPeriod,
} from "./eurostat";

export const EUROSTAT_TIMEOUT_MS = 20_000;
/** Reîncercări doar pentru erori tranzitorii (rețea, timeout, 5xx, 429). */
export const EUROSTAT_MAX_RETRIES = 3;

export class EurostatFetchError extends Error {
  readonly status: number | null;
  readonly transient: boolean;
  readonly attempts: number;

  constructor(message: string, options: { status?: number | null; transient: boolean; attempts: number }) {
    super(message);
    this.name = "EurostatFetchError";
    this.status = options.status ?? null;
    this.transient = options.transient;
    this.attempts = options.attempts;
  }
}

export type FetchDeps = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Un apel HTTPS către API-ul de diseminare, cu timeout și retry controlat. */
export async function fetchEurostatSeries(
  series: MarketIndexSeries,
  options: FetchDeps & { lastTimePeriod?: number } = {},
): Promise<EurostatParseResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? EUROSTAT_TIMEOUT_MS;
  const url = eurostatHpiUrl(series, {
    ...(options.lastTimePeriod ? { lastTimePeriod: options.lastTimePeriod } : {}),
  });

  let attempts = 0;
  let lastError: EurostatFetchError | null = null;

  while (attempts <= EUROSTAT_MAX_RETRIES) {
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const transient = isTransientStatus(response.status);
        lastError = new EurostatFetchError(
          `Eurostat a răspuns cu ${response.status}.`,
          { status: response.status, transient, attempts },
        );
        // 4xx (în afara 429): cerere greșită, nu se reîncearcă.
        if (!transient) throw lastError;
      } else {
        const payload = await response.json();
        return parseEurostatHpi(payload, series);
      }
    } catch (error) {
      if (error instanceof EurostatFetchError) {
        if (!error.transient) throw error;
        lastError = error;
      } else {
        lastError = new EurostatFetchError(
          error instanceof Error ? error.message : "Eroare de rețea către Eurostat.",
          { transient: true, attempts },
        );
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempts > EUROSTAT_MAX_RETRIES) break;
    await sleep(Math.min(1000 * 2 ** (attempts - 1), 8000));
  }

  throw (
    lastError ??
    new EurostatFetchError("Eurostat nu a putut fi contactat.", { transient: true, attempts })
  );
}

export type StoredIndexPoint = QuarterPeriod & {
  id: string;
  value: number;
  publishedAt: string | null;
};

export type IndexSyncCounts = {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  invalid: number;
};

export type IndexSeriesCoverage = {
  series: MarketIndexSeries;
  rows: number;
  first: QuarterPeriod | null;
  last: QuarterPeriod | null;
  publishedAt: string | null;
};

export type IndexRunRecord = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  counts: IndexSyncCounts;
  errors: string[];
};

export type IndicesRepository = {
  listPoints(series: MarketIndexSeries): Promise<StoredIndexPoint[]>;
  writePoints(rows: MarketPriceIndexRow[]): Promise<void>;
  createRun(actorId: string | null): Promise<string>;
  finishRun(
    runId: string,
    patch: { status: string; counts: IndexSyncCounts; errors: string[] },
  ): Promise<void>;
  coverage(): Promise<IndexSeriesCoverage[]>;
  lastRuns(limit: number): Promise<IndexRunRecord[]>;
};

export type MarketPriceIndexRow = {
  source: string;
  dataset: string;
  series: string;
  region: string;
  unit: string;
  period_year: number;
  period_quarter: number;
  index_value: number;
  base_label: string;
  published_at: string | null;
  import_run_id: string | null;
};

const EMPTY_COUNTS: IndexSyncCounts = {
  received: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  invalid: 0,
};

function addCounts(a: IndexSyncCounts, b: IndexSyncCounts): IndexSyncCounts {
  return {
    received: a.received + b.received,
    created: a.created + b.created,
    updated: a.updated + b.updated,
    unchanged: a.unchanged + b.unchanged,
    invalid: a.invalid + b.invalid,
  };
}

/** Comparație tolerantă la reprezentarea numerică din baza de date. */
function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

export function buildIndexRow(
  point: MarketIndexPoint,
  meta: { publishedAt: string | null; runId: string | null },
): MarketPriceIndexRow {
  return {
    source: EUROSTAT_SOURCE,
    dataset: EUROSTAT_HPI_DATASET,
    series: point.series,
    region: EUROSTAT_HPI_REGION,
    unit: EUROSTAT_HPI_UNIT,
    period_year: point.year,
    period_quarter: point.quarter,
    index_value: point.value,
    base_label: EUROSTAT_HPI_BASE_LABEL,
    published_at: meta.publishedAt,
    import_run_id: meta.runId,
  };
}

/**
 * Scrie punctele unei serii: rândurile noi sunt `created`, valorile schimbate
 * (revizuiri Eurostat) `updated`, restul `unchanged`.
 */
export async function upsertIndexSeries(
  repository: IndicesRepository,
  parsed: EurostatParseResult,
  runId: string | null,
): Promise<IndexSyncCounts> {
  const stored = await repository.listPoints(parsed.series);
  const key = (period: QuarterPeriod) => `${period.year}-${period.quarter}`;
  const existing = new Map(stored.map((point) => [key(point), point]));

  const rows: MarketPriceIndexRow[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const point of parsed.points) {
    const previous = existing.get(key(point));
    if (!previous) {
      created += 1;
      rows.push(buildIndexRow(point, { publishedAt: parsed.publishedAt, runId }));
      continue;
    }
    if (!sameValue(previous.value, point.value)) {
      updated += 1;
      rows.push(buildIndexRow(point, { publishedAt: parsed.publishedAt, runId }));
      continue;
    }
    unchanged += 1;
  }

  if (rows.length > 0) await repository.writePoints(rows);

  return {
    received: parsed.points.length,
    created,
    updated,
    unchanged,
    invalid: parsed.invalid,
  };
}

export type IndexSyncOutcome = {
  runId: string | null;
  status: "completed" | "skipped" | "failed";
  counts: IndexSyncCounts;
  errors: string[];
  series: { series: MarketIndexSeries; counts: IndexSyncCounts; newest: QuarterPeriod | null }[];
};

/**
 * Verificare ieftină: cel mai nou trimestru publicat este deja stocat și
 * publicarea Eurostat nu este mai nouă decât ce avem? Atunci nu se face nimic.
 */
async function isUpToDate(
  repository: IndicesRepository,
  deps: FetchDeps,
): Promise<boolean> {
  for (const series of MARKET_INDEX_SERIES_LIST) {
    const probe = await fetchEurostatSeries(series, { ...deps, lastTimePeriod: 1 });
    const remote = newestPoint(probe.points);
    if (!remote) continue;
    const stored = await repository.listPoints(series);
    const local = newestPoint(
      stored.map((point) => ({
        series,
        year: point.year,
        quarter: point.quarter,
        value: point.value,
      })),
    );
    if (!local || comparePeriods(remote, local) > 0) return false;
    const storedPublished = stored.reduce<string | null>(
      (best, point) =>
        point.publishedAt && (best === null || point.publishedAt > best) ? point.publishedAt : best,
      null,
    );
    // O republicare Eurostat mai nouă poate conține revizuiri pe trimestre trecute.
    if (probe.publishedAt && (!storedPublished || probe.publishedAt > storedPublished)) {
      return false;
    }
  }
  return true;
}

/** Sincronizarea completă, jurnalizată în `market_import_runs`. */
export async function syncMarketPriceIndices(
  repository: IndicesRepository,
  options: { actorId?: string | null; force?: boolean; deps?: FetchDeps } = {},
): Promise<IndexSyncOutcome> {
  const deps = options.deps ?? {};

  if (!options.force) {
    try {
      if (await isUpToDate(repository, deps)) {
        const runId = await repository.createRun(options.actorId ?? null);
        await repository.finishRun(runId, {
          status: "skipped",
          counts: EMPTY_COUNTS,
          errors: [],
        });
        return { runId, status: "skipped", counts: EMPTY_COUNTS, errors: [], series: [] };
      }
    } catch (error) {
      // Verificarea ieftină a eșuat: continuăm cu sincronizarea completă.
      console.error("[market-indices] verificarea „e la zi?" a eșuat", error);
    }
  }

  const runId = await repository.createRun(options.actorId ?? null);
  let total = EMPTY_COUNTS;
  const errors: string[] = [];
  const perSeries: IndexSyncOutcome["series"] = [];

  for (const series of MARKET_INDEX_SERIES_LIST) {
    try {
      const parsed = await fetchEurostatSeries(series, deps);
      const counts = await upsertIndexSeries(repository, parsed, runId);
      total = addCounts(total, counts);
      perSeries.push({ series, counts, newest: newestPoint(parsed.points) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Eroare necunoscută.";
      errors.push(`${series}: ${message}`);
      perSeries.push({ series, counts: EMPTY_COUNTS, newest: null });
    }
  }

  const status = errors.length === MARKET_INDEX_SERIES_LIST.length ? "failed" : "completed";
  await repository.finishRun(runId, { status, counts: total, errors });
  return { runId, status, counts: total, errors, series: perSeries };
}

type AdminClient = {
  from: (table: string) => any;
};

/** Implementarea reală, peste clientul privilegiat. */
export function createIndicesRepository(admin: AdminClient): IndicesRepository {
  const base = () =>
    admin
      .from("market_price_indices")
      .select("id, series, period_year, period_quarter, index_value, published_at")
      .eq("source", EUROSTAT_SOURCE)
      .eq("dataset", EUROSTAT_HPI_DATASET)
      .eq("region", EUROSTAT_HPI_REGION)
      .eq("unit", EUROSTAT_HPI_UNIT);

  return {
    async listPoints(series) {
      const { data, error } = await base().eq("series", series);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: any) => ({
        id: row.id as string,
        year: Number(row.period_year),
        quarter: Number(row.period_quarter),
        value: Number(row.index_value),
        publishedAt: (row.published_at as string | null) ?? null,
      }));
    },
    async writePoints(rows) {
      if (rows.length === 0) return;
      const { error } = await admin.from("market_price_indices").upsert(rows, {
        onConflict: "source,dataset,series,region,unit,period_year,period_quarter",
      });
      if (error) throw new Error(error.message);
    },
    async createRun(actorId) {
      const { data, error } = await admin
        .from("market_import_runs")
        .insert({
          source: EUROSTAT_SOURCE,
          format: "json",
          mode: "full",
          status: "running",
          triggered_by: actorId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    async finishRun(runId, patch) {
      await admin
        .from("market_import_runs")
        .update({
          status: patch.status,
          finished_at: new Date().toISOString(),
          items_received: patch.counts.received,
          items_created: patch.counts.created,
          items_updated: patch.counts.updated,
          items_unchanged: patch.counts.unchanged,
          items_invalid: patch.counts.invalid,
          errors: patch.errors,
        })
        .eq("id", runId);
    },
    async coverage() {
      const result: IndexSeriesCoverage[] = [];
      for (const series of MARKET_INDEX_SERIES_LIST) {
        const points = await this.listPoints(series);
        const sorted = [...points].sort(comparePeriods);
        const publishedAt = points.reduce<string | null>(
          (best, point) =>
            point.publishedAt && (best === null || point.publishedAt > best)
              ? point.publishedAt
              : best,
          null,
        );
        result.push({
          series,
          rows: points.length,
          first: sorted[0] ? { year: sorted[0].year, quarter: sorted[0].quarter } : null,
          last: sorted.at(-1)
            ? { year: sorted.at(-1)!.year, quarter: sorted.at(-1)!.quarter }
            : null,
          publishedAt,
        });
      }
      return result;
    },
    async lastRuns(limit) {
      const { data } = await admin
        .from("market_import_runs")
        .select(
          "id, status, started_at, finished_at, items_received, items_created, items_updated, items_unchanged, items_invalid, errors",
        )
        .eq("source", EUROSTAT_SOURCE)
        .order("started_at", { ascending: false })
        .limit(limit);
      return (data ?? []).map((row: any) => ({
        id: row.id as string,
        status: row.status as string,
        startedAt: row.started_at as string,
        finishedAt: (row.finished_at as string | null) ?? null,
        counts: {
          received: Number(row.items_received ?? 0),
          created: Number(row.items_created ?? 0),
          updated: Number(row.items_updated ?? 0),
          unchanged: Number(row.items_unchanged ?? 0),
          invalid: Number(row.items_invalid ?? 0),
        },
        errors: Array.isArray(row.errors) ? row.errors.map((e: unknown) => String(e)) : [],
      }));
    },
  };
}
