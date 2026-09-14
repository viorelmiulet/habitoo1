/**
 * Market Intelligence (ACP Stage 4) — funcții PURE, deterministe.
 *
 * Reguli:
 *  - nicio metrică nu este simulată: totul provine din rândurile reale primite;
 *  - lipsa datelor NU se completează cu valori implicite — se raportează explicit;
 *  - filtrarea grea se face în baza de date; aici avem doar predicatul echivalent
 *    (folosit în teste și pentru eșantionul plafonat), agregările și pozitionarea;
 *  - fără AI, fără text generat: doar cifre și etichete deterministe.
 */
import { average, median, percentile, pricePerSqm } from "@/lib/acp/statistics";

/* ------------------------------------------------------------------ */
/* Praguri și configurație explicită                                   */
/* ------------------------------------------------------------------ */

/** Sub/în/peste piață: abatere de la mediana €/mp mai mare de atât. */
export const MARKET_POSITION_THRESHOLD_PERCENT = 5;
/** Minimul de oferte cu €/mp pentru statistici principale credibile. */
export const MARKET_MIN_SAMPLE = 5;
/** Minimul de oferte pentru distribuții/percentile. */
export const MARKET_MIN_DISTRIBUTION_SAMPLE = 8;
/** Câte luni consecutive cu date sunt necesare pentru un trend real. */
export const MARKET_MIN_TREND_POINTS = 3;
/** Minimul de observații pe lună ca punctul de trend să fie considerat real. */
export const MARKET_MIN_TREND_POINT_OBSERVATIONS = 3;
/**
 * Plafon de eșantionare: filtrarea și numărarea se fac în DB, dar agregările
 * lucrează pe un eșantion mărginit, ca memoria serverului să rămână constantă
 * chiar dacă pool-ul crește la sute de mii de anunțuri.
 */
export const MARKET_SAMPLE_CAP = 5000;

/** Praguri de prospețime, în zile de la ultima observare a datelor. */
export const MARKET_FRESHNESS_DAYS = { fresh: 7, aging: 30 } as const;

/* ------------------------------------------------------------------ */
/* Model de filtrare                                                   */
/* ------------------------------------------------------------------ */

export type MarketListingStatusFilter = "active" | "inactive" | "archived" | "all";

export type MarketIntelligenceFilters = {
  city?: string | null;
  county?: string | null;
  /** Sector / cartier / adresă — potrivire parțială. */
  area?: string | null;
  propertyType?: string | null;
  transactionType?: string | null;
  roomsMin?: number | null;
  roomsMax?: number | null;
  areaMin?: number | null;
  areaMax?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  pricePerSqmMin?: number | null;
  pricePerSqmMax?: number | null;
  sources?: string[] | null;
  status?: MarketListingStatusFilter | null;
  /** Fereastră temporală pe `last_seen_at` (zile). */
  seenWithinDays?: number | null;
};

/** Rândul minim necesar agregărilor (proiecție îngustă, fără `raw_data`). */
export type MarketIntelligenceRow = {
  id: string;
  source: string;
  status: string;
  city: string | null;
  county: string | null;
  district: string | null;
  neighborhood: string | null;
  address: string | null;
  propertyType: string | null;
  transactionType: string | null;
  rooms: number | null;
  usableArea: number | null;
  price: number | null;
  currency: string | null;
  pricePerSqm: number | null;
  lastSeenAt: string | null;
  firstSeenAt: string | null;
};

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

/** €/mp efectiv al unui rând: valoarea stocată sau, în lipsă, preț / suprafață. */
export function rowPricePerSqm(row: MarketIntelligenceRow): number | null {
  return num(row.pricePerSqm) ?? pricePerSqm(row.price, row.usableArea);
}

/**
 * Predicatul echivalent filtrării din baza de date. Serverul aplică aceleași
 * condiții în SQL; aici sunt folosite pentru teste și pentru filtre care nu au
 * echivalent exact în PostgREST (interval €/mp derivat).
 */
export function matchesMarketFilters(
  row: MarketIntelligenceRow,
  filters: MarketIntelligenceFilters,
  now: number = Date.now(),
): boolean {
  const status = filters.status ?? "active";
  if (status !== "all" && row.status !== status) return false;

  if (filters.city && text(row.city) !== text(filters.city)) return false;
  if (filters.county && text(row.county) !== text(filters.county)) return false;
  if (filters.area) {
    const needle = text(filters.area);
    const haystack = [row.district, row.neighborhood, row.address].map(text).join(" | ");
    if (!haystack.includes(needle)) return false;
  }
  if (filters.propertyType && row.propertyType !== filters.propertyType) return false;
  if (filters.transactionType && row.transactionType !== filters.transactionType) return false;

  const rooms = num(row.rooms);
  if (num(filters.roomsMin) !== null && (rooms === null || rooms < filters.roomsMin!)) return false;
  if (num(filters.roomsMax) !== null && (rooms === null || rooms > filters.roomsMax!)) return false;

  const area = num(row.usableArea);
  if (num(filters.areaMin) !== null && (area === null || area < filters.areaMin!)) return false;
  if (num(filters.areaMax) !== null && (area === null || area > filters.areaMax!)) return false;

  const price = num(row.price);
  if (num(filters.priceMin) !== null && (price === null || price < filters.priceMin!)) return false;
  if (num(filters.priceMax) !== null && (price === null || price > filters.priceMax!)) return false;

  const ppsm = rowPricePerSqm(row);
  if (num(filters.pricePerSqmMin) !== null && (ppsm === null || ppsm < filters.pricePerSqmMin!)) {
    return false;
  }
  if (num(filters.pricePerSqmMax) !== null && (ppsm === null || ppsm > filters.pricePerSqmMax!)) {
    return false;
  }

  if (filters.sources && filters.sources.length > 0 && !filters.sources.includes(row.source)) {
    return false;
  }

  const days = num(filters.seenWithinDays);
  if (days !== null) {
    const seen = row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
    if (!Number.isFinite(seen) || now - seen > days * 86_400_000) return false;
  }

  return true;
}

export function filterMarketRows(
  rows: readonly MarketIntelligenceRow[],
  filters: MarketIntelligenceFilters,
  now?: number,
): MarketIntelligenceRow[] {
  return rows.filter((row) => matchesMarketFilters(row, filters, now));
}

/* ------------------------------------------------------------------ */
/* Agregări                                                            */
/* ------------------------------------------------------------------ */

export type MarketDistributionBucket = {
  key: string;
  label: string;
  from: number | null;
  to: number | null;
  count: number;
  share: number;
};

export type MarketNumericStats = {
  count: number;
  min: number | null;
  max: number | null;
  average: number | null;
  median: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
};

export type MarketSourceMixEntry = {
  source: string;
  count: number;
  share: number;
  lastSeenAt: string | null;
};

export type MarketCoverage = {
  withPrice: number;
  withArea: number;
  withPricePerSqm: number;
  withRooms: number;
  withLocation: number;
  /** 0–100: media de completitudine a câmpurilor esențiale. */
  completeness: number | null;
  level: "good" | "partial" | "poor" | "unknown";
};

export type MarketFreshness = {
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  ageDays: number | null;
  level: "fresh" | "aging" | "stale" | "unknown";
};

export type MarketIntelligenceAggregate = {
  /** Câte rânduri corespund filtrelor în baza de date. */
  totalMatched: number;
  /** Câte rânduri au intrat efectiv în agregare (eșantion plafonat). */
  sampleSize: number;
  sampleCapped: boolean;
  pricePerSqm: MarketNumericStats;
  price: MarketNumericStats;
  usableArea: MarketNumericStats;
  pricePerSqmDistribution: MarketDistributionBucket[];
  areaDistribution: MarketDistributionBucket[];
  roomsDistribution: MarketDistributionBucket[];
  sourceMix: MarketSourceMixEntry[];
  statusMix: { status: string; count: number; share: number }[];
  coverage: MarketCoverage;
  freshness: MarketFreshness;
  insufficient: boolean;
  insufficientReason: string | null;
  distributionsAvailable: boolean;
};

function stats(values: readonly (number | null)[]): MarketNumericStats {
  const clean = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (clean.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      average: null,
      median: null,
      p10: null,
      p25: null,
      p75: null,
      p90: null,
    };
  }
  return {
    count: clean.length,
    min: Math.min(...clean),
    max: Math.max(...clean),
    average: average(clean),
    median: median(clean),
    p10: percentile(clean, 0.1),
    p25: percentile(clean, 0.25),
    p75: percentile(clean, 0.75),
    p90: percentile(clean, 0.9),
  };
}

function share(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/**
 * Intervale calculate din date reale: împărțim [min, max] în `buckets` benzi
 * egale. Fără date, nu producem benzi.
 */
function numericBuckets(
  values: readonly number[],
  buckets: number,
  labelFor: (from: number, to: number) => string,
): MarketDistributionBucket[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!(max > min)) {
    return [
      {
        key: `${min}`,
        label: labelFor(min, max),
        from: min,
        to: max,
        count: values.length,
        share: 100,
      },
    ];
  }
  const width = (max - min) / buckets;
  const out: MarketDistributionBucket[] = [];
  for (let i = 0; i < buckets; i += 1) {
    const from = min + i * width;
    const to = i === buckets - 1 ? max : min + (i + 1) * width;
    const count = values.filter((v) =>
      i === buckets - 1 ? v >= from && v <= to : v >= from && v < to,
    ).length;
    out.push({
      key: `${Math.round(from)}-${Math.round(to)}`,
      label: labelFor(Math.round(from), Math.round(to)),
      from: Math.round(from),
      to: Math.round(to),
      count,
      share: share(count, values.length),
    });
  }
  return out;
}

function roomsBuckets(rows: readonly MarketIntelligenceRow[]): MarketDistributionBucket[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const rooms = num(row.rooms);
    if (rooms === null) continue;
    const key = rooms >= 5 ? "5+" : String(Math.round(rooms));
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  const order = ["1", "2", "3", "4", "5+"];
  return [...counts.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([key, count]) => ({
      key,
      label: key === "5+" ? "5+ camere" : `${key} ${key === "1" ? "cameră" : "camere"}`,
      from: key === "5+" ? 5 : Number(key),
      to: key === "5+" ? null : Number(key),
      count,
      share: share(count, total),
    }));
}

export function computeFreshness(
  lastSeenAt: string | null,
  lastSyncAt: string | null,
  now: number = Date.now(),
): MarketFreshness {
  const parsed = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  if (!Number.isFinite(parsed)) {
    return { lastSeenAt: null, lastSyncAt, ageDays: null, level: "unknown" };
  }
  const ageDays = Math.max(0, Math.floor((now - parsed) / 86_400_000));
  const level =
    ageDays <= MARKET_FRESHNESS_DAYS.fresh
      ? "fresh"
      : ageDays <= MARKET_FRESHNESS_DAYS.aging
        ? "aging"
        : "stale";
  return { lastSeenAt, lastSyncAt, ageDays, level };
}

function coverage(rows: readonly MarketIntelligenceRow[]): MarketCoverage {
  if (rows.length === 0) {
    return {
      withPrice: 0,
      withArea: 0,
      withPricePerSqm: 0,
      withRooms: 0,
      withLocation: 0,
      completeness: null,
      level: "unknown",
    };
  }
  const withPrice = rows.filter((r) => num(r.price) !== null).length;
  const withArea = rows.filter((r) => num(r.usableArea) !== null).length;
  const withPricePerSqm = rows.filter((r) => rowPricePerSqm(r) !== null).length;
  const withRooms = rows.filter((r) => num(r.rooms) !== null).length;
  const withLocation = rows.filter((r) => Boolean(r.city || r.district || r.neighborhood)).length;
  const completeness =
    Math.round(
      ((withPrice + withArea + withPricePerSqm + withRooms + withLocation) / (rows.length * 5)) *
        1000,
    ) / 10;
  return {
    withPrice,
    withArea,
    withPricePerSqm,
    withRooms,
    withLocation,
    completeness,
    level: completeness >= 80 ? "good" : completeness >= 50 ? "partial" : "poor",
  };
}

/**
 * Agregarea principală. `totalMatched` vine din DB (COUNT exact), iar `rows`
 * este eșantionul plafonat pe care se calculează statisticile.
 */
export function aggregateMarketRows(params: {
  rows: readonly MarketIntelligenceRow[];
  totalMatched?: number;
  lastSyncAt?: string | null;
  now?: number;
}): MarketIntelligenceAggregate {
  const rows = params.rows;
  const now = params.now ?? Date.now();
  const totalMatched = params.totalMatched ?? rows.length;

  const ppsmValues = rows.map(rowPricePerSqm);
  const cleanPpsm = ppsmValues.filter((v): v is number => v !== null);
  const priceStats = stats(rows.map((r) => num(r.price)));
  const areaStats = stats(rows.map((r) => num(r.usableArea)));
  const ppsmStats = stats(ppsmValues);

  const sourceCounts = new Map<string, { count: number; lastSeenAt: string | null }>();
  for (const row of rows) {
    const entry = sourceCounts.get(row.source) ?? { count: 0, lastSeenAt: null };
    entry.count += 1;
    if (row.lastSeenAt && (!entry.lastSeenAt || row.lastSeenAt > entry.lastSeenAt)) {
      entry.lastSeenAt = row.lastSeenAt;
    }
    sourceCounts.set(row.source, entry);
  }
  const sourceMix: MarketSourceMixEntry[] = [...sourceCounts.entries()]
    .map(([source, entry]) => ({
      source,
      count: entry.count,
      share: share(entry.count, rows.length),
      lastSeenAt: entry.lastSeenAt,
    }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));

  const statusCounts = new Map<string, number>();
  for (const row of rows) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  const statusMix = [...statusCounts.entries()]
    .map(([status, count]) => ({ status, count, share: share(count, rows.length) }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

  const lastSeenAt = rows.reduce<string | null>(
    (acc, row) => (row.lastSeenAt && (!acc || row.lastSeenAt > acc) ? row.lastSeenAt : acc),
    null,
  );

  const distributionsAvailable = cleanPpsm.length >= MARKET_MIN_DISTRIBUTION_SAMPLE;
  const insufficient = cleanPpsm.length < MARKET_MIN_SAMPLE;
  const insufficientReason = insufficient
    ? rows.length === 0
      ? "Nu există oferte de piață care să corespundă filtrelor selectate."
      : `Doar ${cleanPpsm.length} ${cleanPpsm.length === 1 ? "ofertă are" : "oferte au"} preț și suprafață utilizabile; sunt necesare minimum ${MARKET_MIN_SAMPLE} pentru statistici de piață.`
    : null;

  return {
    totalMatched,
    sampleSize: rows.length,
    sampleCapped: rows.length >= MARKET_SAMPLE_CAP && totalMatched > rows.length,
    pricePerSqm: ppsmStats,
    price: priceStats,
    usableArea: areaStats,
    pricePerSqmDistribution: distributionsAvailable
      ? numericBuckets(cleanPpsm, 6, (from, to) => `${from}–${to} €/mp`)
      : [],
    areaDistribution: distributionsAvailable
      ? numericBuckets(
          rows.map((r) => num(r.usableArea)).filter((v): v is number => v !== null),
          6,
          (from, to) => `${from}–${to} mp`,
        )
      : [],
    roomsDistribution: rows.length > 0 ? roomsBuckets(rows) : [],
    sourceMix,
    statusMix,
    coverage: coverage(rows),
    freshness: computeFreshness(lastSeenAt, params.lastSyncAt ?? null, now),
    insufficient,
    insufficientReason,
    distributionsAvailable,
  };
}

/* ------------------------------------------------------------------ */
/* Poziționare față de piață                                           */
/* ------------------------------------------------------------------ */

export type MarketPositionBand = "under" | "in" | "over" | "unknown";

export type MarketPosition = {
  band: MarketPositionBand;
  label: string;
  /** €/mp evaluat (proprietatea sau prețul recomandat de ACP). */
  valuePerSqm: number | null;
  medianPerSqm: number | null;
  averagePerSqm: number | null;
  deltaVsMedianPercent: number | null;
  deltaVsAveragePercent: number | null;
  /** Percentila în distribuția eșantionului (0–100), dacă există suficiente date. */
  percentileRank: number | null;
  thresholdPercent: number;
  reason: string | null;
};

const BAND_LABELS: Record<MarketPositionBand, string> = {
  under: "Sub piață",
  in: "În piață",
  over: "Peste piață",
  unknown: "Nedeterminat",
};

function pct(value: number, reference: number): number {
  return Math.round(((value - reference) / reference) * 1000) / 10;
}

/** Percentila valorii în eșantion: procentul de oferte cu €/mp mai mic. */
export function percentileRank(values: readonly number[], value: number): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < MARKET_MIN_DISTRIBUTION_SAMPLE) return null;
  const below = clean.filter((v) => v < value).length;
  return Math.round((below / clean.length) * 1000) / 10;
}

/**
 * Poziționare deterministă: abaterea de la mediana €/mp a pieței, cu prag
 * explicit. Fără mediană sau fără valoare de referință → „nedeterminat”.
 */
export function computeMarketPosition(params: {
  valuePerSqm: number | null | undefined;
  aggregate: Pick<MarketIntelligenceAggregate, "pricePerSqm" | "insufficient">;
  sampleValues?: readonly number[];
  thresholdPercent?: number;
}): MarketPosition {
  const threshold = params.thresholdPercent ?? MARKET_POSITION_THRESHOLD_PERCENT;
  const value = num(params.valuePerSqm ?? null);
  const medianPerSqm = num(params.aggregate.pricePerSqm.median);
  const averagePerSqm = num(params.aggregate.pricePerSqm.average);

  const base: MarketPosition = {
    band: "unknown",
    label: BAND_LABELS.unknown,
    valuePerSqm: value,
    medianPerSqm,
    averagePerSqm,
    deltaVsMedianPercent: null,
    deltaVsAveragePercent: null,
    percentileRank: null,
    thresholdPercent: threshold,
    reason: null,
  };

  if (value === null) {
    return { ...base, reason: "Proprietatea analizată nu are un preț pe metru pătrat calculabil." };
  }
  if (medianPerSqm === null || medianPerSqm <= 0 || params.aggregate.insufficient) {
    return { ...base, reason: "Datele de piață sunt insuficiente pentru o poziționare fiabilă." };
  }

  const deltaMedian = pct(value, medianPerSqm);
  const band: MarketPositionBand =
    deltaMedian < -threshold ? "under" : deltaMedian > threshold ? "over" : "in";

  return {
    band,
    label: BAND_LABELS[band],
    valuePerSqm: value,
    medianPerSqm,
    averagePerSqm,
    deltaVsMedianPercent: deltaMedian,
    deltaVsAveragePercent:
      averagePerSqm !== null && averagePerSqm > 0 ? pct(value, averagePerSqm) : null,
    percentileRank: params.sampleValues ? percentileRank(params.sampleValues, value) : null,
    thresholdPercent: threshold,
    reason: null,
  };
}

/* ------------------------------------------------------------------ */
/* Trenduri                                                            */
/* ------------------------------------------------------------------ */

export type MarketTrendObservation = {
  /** Momentul observației (snapshot `captured_at`). */
  capturedAt: string;
  pricePerSqm: number | null;
  price: number | null;
  listingId: string;
};

export type MarketTrendPoint = {
  /** Luna în format YYYY-MM. */
  bucket: string;
  observations: number;
  listings: number;
  medianPricePerSqm: number | null;
  averagePricePerSqm: number | null;
  medianPrice: number | null;
};

export type MarketTrend = {
  points: MarketTrendPoint[];
  available: boolean;
  reason: string | null;
  /** Variația medianei €/mp între primul și ultimul punct real, în procente. */
  changePercent: number | null;
};

function monthBucket(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Trend lunar din snapshot-urile reale. Nu inventăm serii: dacă istoricul are
 * mai puțin de `MARKET_MIN_TREND_POINTS` luni cu date suficiente, trendul este
 * marcat indisponibil, iar punctele existente rămân vizibile ca informativ.
 */
export function computeMarketTrend(
  observations: readonly MarketTrendObservation[],
): MarketTrend {
  const buckets = new Map<
    string,
    { ppsm: number[]; prices: number[]; listings: Set<string>; observations: number }
  >();
  for (const obs of observations) {
    const bucket = monthBucket(obs.capturedAt);
    if (!bucket) continue;
    const entry =
      buckets.get(bucket) ?? { ppsm: [], prices: [], listings: new Set<string>(), observations: 0 };
    const ppsm = num(obs.pricePerSqm);
    if (ppsm !== null) entry.ppsm.push(ppsm);
    const price = num(obs.price);
    if (price !== null) entry.prices.push(price);
    entry.listings.add(obs.listingId);
    entry.observations += 1;
    buckets.set(bucket, entry);
  }

  const points: MarketTrendPoint[] = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, entry]) => ({
      bucket,
      observations: entry.observations,
      listings: entry.listings.size,
      medianPricePerSqm: median(entry.ppsm),
      averagePricePerSqm: average(entry.ppsm),
      medianPrice: median(entry.prices),
    }));

  const solid = points.filter(
    (p) => p.observations >= MARKET_MIN_TREND_POINT_OBSERVATIONS && p.medianPricePerSqm !== null,
  );
  if (solid.length < MARKET_MIN_TREND_POINTS) {
    return {
      points,
      available: false,
      reason:
        points.length === 0
          ? "Date istorice insuficiente: nu există încă snapshot-uri de piață pentru filtrele selectate."
          : `Date istorice insuficiente: sunt necesare minimum ${MARKET_MIN_TREND_POINTS} luni cu cel puțin ${MARKET_MIN_TREND_POINT_OBSERVATIONS} observații fiecare.`,
      changePercent: null,
    };
  }

  const first = solid[0]!.medianPricePerSqm!;
  const last = solid[solid.length - 1]!.medianPricePerSqm!;
  return {
    points,
    available: true,
    reason: null,
    changePercent: first > 0 ? pct(last, first) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Calitatea surselor                                                  */
/* ------------------------------------------------------------------ */

export type MarketSourceQuality = {
  id: string;
  name: string;
  configured: boolean;
  /** Starea sincronizării, exact cum este în `market_source_state`. */
  syncStatus: string | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  recordsTotal: number;
  recordsActive: number;
  /** Anunțuri unificate ca duplicate (dedupe_status = merged). */
  recordsDeduplicated: number;
  /** Înregistrări respinse la validare în ultima rulare, dacă există jurnal. */
  recordsRejected: number | null;
  freshness: MarketFreshness;
  /** Ponderea sursei în pool-ul filtrat curent. */
  sharePercent: number | null;
};

export function buildSourceQuality(params: {
  sources: readonly {
    id: string;
    name: string;
    configured: boolean;
    syncStatus: string | null;
    lastSyncAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    total: number;
    active: number;
    duplicates: number;
    itemsInvalidLastRun: number | null;
    lastSeenAt: string | null;
  }[];
  mix?: readonly MarketSourceMixEntry[];
  now?: number;
}): MarketSourceQuality[] {
  const now = params.now ?? Date.now();
  const mix = new Map((params.mix ?? []).map((m) => [m.source, m.share]));
  return params.sources.map((src) => ({
    id: src.id,
    name: src.name,
    configured: src.configured,
    syncStatus: src.syncStatus,
    lastSyncAt: src.lastSyncAt,
    lastSuccessAt: src.lastSuccessAt,
    lastError: src.lastError,
    recordsTotal: src.total,
    recordsActive: src.active,
    recordsDeduplicated: src.duplicates,
    recordsRejected: src.itemsInvalidLastRun,
    freshness: computeFreshness(src.lastSeenAt, src.lastSyncAt, now),
    sharePercent: mix.get(src.id) ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Legătura cu ACP                                                     */
/* ------------------------------------------------------------------ */

export type MarketSubjectLike = {
  propertyType?: string | null;
  transactionType?: string | null;
  city?: string | null;
  county?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  rooms?: number | null;
  usableArea?: number | null;
};

/** Toleranțe folosite pentru piața „din jurul” proprietății analizate. */
export const MARKET_SCOPE_ROOMS_TOLERANCE = 1;
export const MARKET_SCOPE_AREA_TOLERANCE_PERCENT = 30;

/**
 * Filtrele implicite pentru piața relevantă a unei proprietăți: același tip și
 * tranzacție, aceeași localitate, camere ±1 și suprafață ±30%. Câmpurile
 * necunoscute nu generează filtre.
 */
export function marketFiltersFromSubject(
  subject: MarketSubjectLike,
  overrides: MarketIntelligenceFilters = {},
): MarketIntelligenceFilters {
  const rooms = num(subject.rooms ?? null);
  const area = num(subject.usableArea ?? null);
  const base: MarketIntelligenceFilters = {
    propertyType: subject.propertyType ?? null,
    transactionType: subject.transactionType ?? null,
    city: subject.city ?? null,
    county: subject.county ?? null,
    area: null,
    roomsMin: rooms === null ? null : Math.max(1, rooms - MARKET_SCOPE_ROOMS_TOLERANCE),
    roomsMax: rooms === null ? null : rooms + MARKET_SCOPE_ROOMS_TOLERANCE,
    areaMin:
      area === null
        ? null
        : Math.round(area * (1 - MARKET_SCOPE_AREA_TOLERANCE_PERCENT / 100) * 100) / 100,
    areaMax:
      area === null
        ? null
        : Math.round(area * (1 + MARKET_SCOPE_AREA_TOLERANCE_PERCENT / 100) * 100) / 100,
    status: "active",
  };
  return { ...base, ...overrides };
}

export type AcpMarketInsights = {
  /** Poziționarea prețului actual al proprietății față de piață. */
  property: MarketPosition;
  /** Poziționarea prețului recomandat de ACP față de piață. */
  recommended: MarketPosition;
  /** Raportul dintre valoarea estimată ACP și mediana pieței (€/mp). */
  estimateVsMarketPercent: number | null;
  /** Comparabile eligibile vs. excluse în versiunea ACP. */
  comparables: { total: number; used: number; excluded: number; outliers: number };
};

/**
 * Insight-urile deterministe afișate în analiză. Nicio propoziție nu este
 * generată de AI: sunt doar cifre și benzi calculate din date.
 */
export function buildAcpMarketInsights(params: {
  aggregate: MarketIntelligenceAggregate;
  samplePricePerSqm?: readonly number[];
  targetPricePerSqm: number | null | undefined;
  estimatedValue: number | null | undefined;
  recommendedListingPrice: number | null | undefined;
  usableArea: number | null | undefined;
  comparables: readonly { isSelected: boolean; isOutlier: boolean }[];
}): AcpMarketInsights {
  const area = num(params.usableArea ?? null);
  const perSqm = (value: number | null | undefined): number | null => {
    const amount = num(value ?? null);
    if (amount === null || area === null || area <= 0) return null;
    return Math.round((amount / area) * 100) / 100;
  };

  const property = computeMarketPosition({
    valuePerSqm: params.targetPricePerSqm ?? null,
    aggregate: params.aggregate,
    sampleValues: params.samplePricePerSqm,
  });
  const recommended = computeMarketPosition({
    valuePerSqm: perSqm(params.recommendedListingPrice),
    aggregate: params.aggregate,
    sampleValues: params.samplePricePerSqm,
  });

  const estimatePerSqm = perSqm(params.estimatedValue);
  const marketMedian = num(params.aggregate.pricePerSqm.median);
  const used = params.comparables.filter((c) => c.isSelected).length;
  const outliers = params.comparables.filter((c) => c.isOutlier).length;

  return {
    property,
    recommended,
    estimateVsMarketPercent:
      estimatePerSqm !== null && marketMedian !== null && marketMedian > 0
        ? pct(estimatePerSqm, marketMedian)
        : null,
    comparables: {
      total: params.comparables.length,
      used,
      excluded: params.comparables.length - used,
      outliers,
    },
  };
}

/** Rezultatul complet returnat de layerul de date (tip client-safe). */
export type MarketIntelligenceResult = {
  filters: MarketIntelligenceFilters;
  aggregate: MarketIntelligenceAggregate;
  /** Valorile €/mp ale eșantionului — necesare pentru percentila proprietății. */
  samplePricePerSqm: number[];
  trend: MarketTrend | null;
  sources: MarketSourceQuality[];
  sourceNames: Record<string, string>;
  computedAt: string;
};
