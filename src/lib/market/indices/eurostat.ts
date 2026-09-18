/**
 * Indicele trimestrial al prețurilor locuințelor (Eurostat) — parte pură.
 *
 * Sursă: API-ul public de diseminare Eurostat, setul de date `prc_hpi_q`
 * („House price index - quarterly data"), filtrat pe România, în formă de
 * indice (nu rată de variație). Parametrii sunt verificați pe API-ul live:
 * `format=JSON`, `lang=EN`, `freq=Q`, `geo=RO`, `unit=I15_Q`
 * („Quarterly index, 2015=100"), `purchase=TOTAL|DW_NEW|DW_EXST`.
 *
 * Fișierul nu face I/O: doar construcția URL-ului, interpretarea răspunsului
 * JSON-stat (prin hărțile de indici ale dimensiunilor, niciodată pozițional)
 * și ajutătoarele de perioadă. Nimic din ACP nu îl folosește încă.
 */

export const EUROSTAT_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

/** Setul de date real folosit, verificat live. */
export const EUROSTAT_HPI_DATASET = "prc_hpi_q";
/** Formă de indice, bază 2015. Rata de variație (`RCH_*`) NU este folosită. */
export const EUROSTAT_HPI_UNIT = "I15_Q";
export const EUROSTAT_HPI_BASE_LABEL = "2015=100";
export const EUROSTAT_HPI_REGION = "RO";
export const EUROSTAT_HPI_FREQ = "Q";
export const EUROSTAT_SOURCE = "eurostat";

/** Surse permise în jurnalul `market_import_runs`, pe lângă cele de anunțuri. */
export const MARKET_INDEX_IMPORT_SOURCES = [EUROSTAT_SOURCE] as const;

/** Defalcările publicate de Eurostat pentru România. */
export type MarketIndexSeries = "total" | "new_dwellings" | "existing_dwellings";

export const EUROSTAT_HPI_SERIES: Record<
  MarketIndexSeries,
  { purchase: string; label: string }
> = {
  total: { purchase: "TOTAL", label: "Total" },
  new_dwellings: { purchase: "DW_NEW", label: "Locuințe nou construite" },
  existing_dwellings: { purchase: "DW_EXST", label: "Locuințe existente" },
};

export const MARKET_INDEX_SERIES_LIST: MarketIndexSeries[] = [
  "total",
  "new_dwellings",
  "existing_dwellings",
];

export function marketIndexSeriesLabel(series: string): string {
  return EUROSTAT_HPI_SERIES[series as MarketIndexSeries]?.label ?? series;
}

export type EurostatQueryOptions = {
  /** Doar ultimele N trimestre — folosit pentru verificarea ieftină „e la zi?". */
  lastTimePeriod?: number;
};

/** URL-ul documentat, cu parametrii exacți folosiți. */
export function eurostatHpiUrl(series: MarketIndexSeries, options: EurostatQueryOptions = {}) {
  const params = new URLSearchParams({
    format: "JSON",
    lang: "EN",
    freq: EUROSTAT_HPI_FREQ,
    purchase: EUROSTAT_HPI_SERIES[series].purchase,
    unit: EUROSTAT_HPI_UNIT,
    geo: EUROSTAT_HPI_REGION,
  });
  if (options.lastTimePeriod && options.lastTimePeriod > 0) {
    params.set("lastTimePeriod", String(options.lastTimePeriod));
  }
  return `${EUROSTAT_API_BASE}/${EUROSTAT_HPI_DATASET}?${params.toString()}`;
}

export type QuarterPeriod = { year: number; quarter: number };

export type MarketIndexPoint = QuarterPeriod & {
  series: MarketIndexSeries;
  value: number;
};

export type EurostatParseResult = {
  dataset: string;
  series: MarketIndexSeries;
  unit: string;
  baseLabel: string;
  /** Momentul publicării raportat de Eurostat (`updated`). */
  publishedAt: string | null;
  points: MarketIndexPoint[];
  /** Valori refuzate (nenumerice, perioadă necitibilă, lipsă). */
  invalid: number;
};

/** „2024-Q3" → { year: 2024, quarter: 3 }. */
export function parseQuarterLabel(label: string): QuarterPeriod | null {
  const match = /^(\d{4})[-]?Q([1-4])$/.exec(label.trim());
  if (!match) return null;
  return { year: Number(match[1]), quarter: Number(match[2]) };
}

/** Trimestrul calendaristic al unei date. */
export function quarterOfDate(value: Date | string): QuarterPeriod {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Dată invalidă pentru trimestru.");
  return { year: date.getUTCFullYear(), quarter: Math.floor(date.getUTCMonth() / 3) + 1 };
}

export function comparePeriods(a: QuarterPeriod, b: QuarterPeriod): number {
  return a.year - b.year || a.quarter - b.quarter;
}

export function samePeriod(a: QuarterPeriod, b: QuarterPeriod): boolean {
  return comparePeriods(a, b) === 0;
}

export function periodLabel(period: QuarterPeriod): string {
  return `${period.year}-Q${period.quarter}`;
}

/**
 * Raportul indicelui între două trimestre: index(țintă) / index(sursă).
 * `null` dacă lipsește oricare perioadă — o valoare lipsă nu se inventează.
 * `1` când perioadele coincid.
 */
export function indexRatio(
  points: readonly MarketIndexPoint[],
  from: QuarterPeriod,
  to: QuarterPeriod,
): number | null {
  if (samePeriod(from, to)) return 1;
  const find = (period: QuarterPeriod) =>
    points.find((point) => samePeriod(point, period)) ?? null;
  const source = find(from);
  const target = find(to);
  if (!source || !target) return null;
  if (!Number.isFinite(source.value) || source.value <= 0) return null;
  if (!Number.isFinite(target.value) || target.value <= 0) return null;
  return target.value / source.value;
}

type JsonStatDimension = {
  category?: { index?: Record<string, number> | string[] };
};

type JsonStatDataset = {
  updated?: string;
  id?: string[];
  size?: number[];
  value?: Record<string, number | null> | (number | null)[];
  dimension?: Record<string, JsonStatDimension>;
};

function categoryIndex(dimension: JsonStatDimension | undefined): Record<string, number> {
  const index = dimension?.category?.index;
  if (!index) return {};
  if (Array.isArray(index)) {
    return Object.fromEntries(index.map((code, position) => [code, position]));
  }
  return index;
}

/**
 * Interpretează răspunsul JSON-stat 2.0 folosind hărțile de indici ale
 * dimensiunilor și pașii calculați din `size` — fără ghiciri poziționale.
 */
export function parseEurostatHpi(
  payload: unknown,
  series: MarketIndexSeries,
): EurostatParseResult {
  const data = payload as JsonStatDataset | null;
  if (!data || typeof data !== "object" || !Array.isArray(data.id) || !Array.isArray(data.size)) {
    throw new Error("Răspuns Eurostat neașteptat: lipsesc dimensiunile.");
  }
  const ids = data.id;
  const sizes = data.size;
  if (ids.length !== sizes.length) {
    throw new Error("Răspuns Eurostat neașteptat: dimensiuni inconsistente.");
  }
  const timeAxis = ids.indexOf("time");
  if (timeAxis < 0) throw new Error("Răspuns Eurostat neașteptat: lipsește dimensiunea `time`.");

  const expected: Record<string, string> = {
    freq: EUROSTAT_HPI_FREQ,
    purchase: EUROSTAT_HPI_SERIES[series].purchase,
    unit: EUROSTAT_HPI_UNIT,
    geo: EUROSTAT_HPI_REGION,
  };

  // Pașii (strides) în ordinea dimensiunilor raportată de Eurostat.
  const strides: number[] = new Array(ids.length).fill(1);
  for (let axis = ids.length - 2; axis >= 0; axis -= 1) {
    strides[axis] = (strides[axis + 1] ?? 1) * (sizes[axis + 1] ?? 1);
  }

  let base = 0;
  for (let axis = 0; axis < ids.length; axis += 1) {
    const id = ids[axis]!;
    if (axis === timeAxis) continue;
    const map = categoryIndex(data.dimension?.[id]);
    const code = expected[id];
    const position = code === undefined ? undefined : map[code];
    if (position === undefined) {
      // Dimensiune necerută explicit: acceptăm doar dacă are o singură categorie.
      const entries = Object.values(map);
      if (entries.length !== 1) {
        throw new Error(`Răspuns Eurostat neașteptat: dimensiunea \`${id}\` nu este filtrată.`);
      }
      base += (entries[0] ?? 0) * (strides[axis] ?? 1);
      continue;
    }
    base += position * (strides[axis] ?? 1);
  }

  const values = data.value ?? {};
  const readValue = (flat: number): number | null | undefined =>
    Array.isArray(values) ? values[flat] : values[String(flat)];

  const timeMap = categoryIndex(data.dimension?.["time"]);
  const points: MarketIndexPoint[] = [];
  let invalid = 0;

  for (const [label, position] of Object.entries(timeMap)) {
    const period = parseQuarterLabel(label);
    const raw = readValue(base + position * (strides[timeAxis] ?? 1));
    if (raw === undefined || raw === null) continue; // trimestru nepublicat
    if (!period) {
      invalid += 1;
      continue;
    }
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      invalid += 1;
      continue;
    }
    points.push({ series, year: period.year, quarter: period.quarter, value });
  }

  points.sort(comparePeriods);

  return {
    dataset: EUROSTAT_HPI_DATASET,
    series,
    unit: EUROSTAT_HPI_UNIT,
    baseLabel: EUROSTAT_HPI_BASE_LABEL,
    publishedAt: typeof data.updated === "string" ? new Date(data.updated).toISOString() : null,
    points,
    invalid,
  };
}

export function newestPoint(points: readonly MarketIndexPoint[]): MarketIndexPoint | null {
  return points.reduce<MarketIndexPoint | null>(
    (best, point) => (best === null || comparePeriods(point, best) > 0 ? point : best),
    null,
  );
}
