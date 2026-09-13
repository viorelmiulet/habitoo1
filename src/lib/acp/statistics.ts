/**
 * Statistici ACP: funcții pure, deterministe și explicabile.
 * Nu există „preț AI” aici — estimarea se bazează exclusiv pe comparabile.
 */
import { ACP_OUTLIER_IQR_MULTIPLIER } from "./config";

function cleanNumbers(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Percentilă prin interpolare liniară (metoda „linear”, ca în R type 7). */
export function percentile(values: readonly number[], p: number): number | null {
  const sorted = cleanNumbers(values).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return round2(sorted[0]!);
  const pos = ((sorted.length - 1) * Math.min(1, Math.max(0, p))) / 1;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return round2(sorted[lower]!);
  const weight = pos - lower;
  return round2(sorted[lower]! * (1 - weight) + sorted[upper]! * weight);
}

export function median(values: readonly number[]): number | null {
  return percentile(values, 0.5);
}

export function average(values: readonly (number | null | undefined)[]): number | null {
  const clean = cleanNumbers(values);
  if (clean.length === 0) return null;
  return round2(clean.reduce((a, b) => a + b, 0) / clean.length);
}

/** Preț pe metru pătrat, calculat determinist. */
export function pricePerSqm(
  price: number | null | undefined,
  area: number | null | undefined,
): number | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  if (typeof area !== "number" || !Number.isFinite(area) || area <= 0) return null;
  return round2(price / area);
}

export type OutlierResult = {
  /** Câte o intrare pentru fiecare valoare primită, în aceeași ordine. */
  flags: { value: number | null; isOutlier: boolean; reason: "low" | "high" | null }[];
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  /** Valorile rămase după excluderea outlierilor (datele nu se șterg niciodată). */
  cleanValues: number[];
  outlierCount: number;
};

/**
 * Detectează valorile suspecte prin metoda IQR. Nu șterge nimic: doar
 * marchează, ca UI-ul să le poată afișa separat, iar statistica principală
 * să le poată ignora.
 */
export function detectPriceOutliers(
  values: readonly (number | null | undefined)[],
): OutlierResult {
  const clean = cleanNumbers(values);
  const q1 = percentile(clean, 0.25);
  const q3 = percentile(clean, 0.75);
  const iqr = q1 !== null && q3 !== null ? round2(q3 - q1) : null;
  // Sub 4 valori, IQR nu este robust: nu marcăm nimic.
  const usable = clean.length >= 4 && iqr !== null && iqr > 0;
  const lowerBound = usable && q1 !== null ? round2(q1 - ACP_OUTLIER_IQR_MULTIPLIER * iqr!) : null;
  const upperBound = usable && q3 !== null ? round2(q3 + ACP_OUTLIER_IQR_MULTIPLIER * iqr!) : null;

  const flags = values.map((raw) => {
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    if (value === null || lowerBound === null || upperBound === null) {
      return { value, isOutlier: false, reason: null as "low" | "high" | null };
    }
    if (value < lowerBound) return { value, isOutlier: true, reason: "low" as const };
    if (value > upperBound) return { value, isOutlier: true, reason: "high" as const };
    return { value, isOutlier: false, reason: null };
  });

  const cleanValues = flags.filter((f) => f.value !== null && !f.isOutlier).map((f) => f.value!);
  return {
    flags,
    q1,
    q3,
    iqr,
    lowerBound,
    upperBound,
    cleanValues,
    outlierCount: flags.filter((f) => f.isOutlier).length,
  };
}

export type AcpStatComparable = {
  price?: number | null;
  usableArea?: number | null;
  pricePerSqm?: number | null;
  isOutlier?: boolean | null;
};

export type MarketStatistics = {
  count: number;
  usedCount: number;
  outlierCount: number;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  averagePricePerSqm: number | null;
  medianPricePerSqm: number | null;
};

/**
 * Statistici de piață pe baza comparabilelor. Outlierii marcați nu influențează
 * statistica principală, dar rămân numărați pentru transparență.
 */
export function calculateMarketStatistics(
  comparables: readonly AcpStatComparable[],
): MarketStatistics {
  const used = comparables.filter((c) => !c.isOutlier);
  const prices = cleanNumbers(used.map((c) => c.price));
  const ppsm = cleanNumbers(
    used.map((c) => c.pricePerSqm ?? pricePerSqm(c.price, c.usableArea)),
  );

  return {
    count: comparables.length,
    usedCount: used.length,
    outlierCount: comparables.length - used.length,
    minimum: prices.length ? round2(Math.min(...prices)) : null,
    maximum: prices.length ? round2(Math.max(...prices)) : null,
    average: average(prices),
    median: median(prices),
    p25: percentile(prices, 0.25),
    p75: percentile(prices, 0.75),
    averagePricePerSqm: average(ppsm),
    medianPricePerSqm: median(ppsm),
  };
}
