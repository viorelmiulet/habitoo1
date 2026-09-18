/**
 * Ajustarea în timp a comparabilelor (motor ACP v2), parte pură.
 *
 * Prețul fiecărui comparabil este adus la trimestrul analizei cu raportul
 * index(trimestrul analizei) / index(trimestrul comparabilului), pe seria
 * „total" a indicelui trimestrial al prețurilor locuințelor.
 *
 * Reguli, fără excepții:
 *  - indicele se citește exclusiv din baza de date (`market_price_indices`);
 *    aici nu există rețea;
 *  - dacă lipsește indicele pentru trimestrul comparabilului, NU se aplică
 *    nicio ajustare și se consemnează motivul;
 *  - dacă trimestrul analizei depășește ultimul trimestru publicat, raportul se
 *    plafonează la ultimul trimestru publicat și acest lucru se consemnează;
 *  - un raport în afara intervalului rezonabil este refuzat, ca un import greșit
 *    al indicelui să nu poată deforma o evaluare;
 *  - indicele este NAȚIONAL: nu descrie o localitate sau un cartier.
 */
import {
  comparePeriods,
  indexRatio,
  newestPoint,
  periodLabel,
  quarterOfDate,
  type MarketIndexPoint,
  type QuarterPeriod,
} from "@/lib/market/indices/eurostat";

/** Interval rezonabil pentru raportul indicelui. În afara lui, fără ajustare. */
export const ACP_TIME_ADJUSTMENT_BOUNDS = { minRatio: 0.5, maxRatio: 2 } as const;

/** Indicele citit din baza de date, exact cum a fost publicat. */
export type AcpPriceIndexSnapshot = {
  source: string;
  dataset: string;
  series: string;
  unit: string;
  baseLabel: string;
  region: string;
  points: { year: number; quarter: number; value: number }[];
};

export type AcpTimeAdjustment = {
  applied: boolean;
  /** Explicație în limbaj natural, afișabilă direct în interfață și în PDF. */
  reason: string;
  originalPrice: number | null;
  /** Trimestrul din care provine prețul comparabilului. */
  comparableQuarter: string | null;
  /** Trimestrul analizei. */
  analysisQuarter: string | null;
  /** Trimestrul efectiv folosit ca țintă (poate fi plafonat). */
  usedQuarter: string | null;
  clamped: boolean;
  ratio: number | null;
  adjustedPrice: number | null;
};

export type AcpTimeAdjustmentSummary = {
  applied: boolean;
  /** Nota de nivel analiză: indicele, sursa, baza și plafonarea, dacă a fost. */
  note: string;
  index: {
    source: string;
    dataset: string;
    series: string;
    unit: string;
    baseLabel: string;
    region: string;
    newestQuarter: string | null;
    quarters: number;
  } | null;
  analysisQuarter: string;
  /** Trimestrul la care s-a oprit ajustarea, când analiza îl depășește. */
  clampedTo: string | null;
  appliedCount: number;
  skippedCount: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function points(index: AcpPriceIndexSnapshot | null): MarketIndexPoint[] {
  if (!index) return [];
  return index.points.map((point) => ({
    series: "total",
    year: point.year,
    quarter: point.quarter,
    value: point.value,
  }));
}

function empty(reason: string, price: number | null, analysisQuarter: string | null): AcpTimeAdjustment {
  return {
    applied: false,
    reason,
    originalPrice: price,
    comparableQuarter: null,
    analysisQuarter,
    usedQuarter: null,
    clamped: false,
    ratio: null,
    adjustedPrice: price,
  };
}

/**
 * Ajustarea în timp pentru un singur comparabil. `observedAt` este momentul
 * real la care prețul a fost confirmat (ultima observare a ofertei).
 */
export function computeAcpTimeAdjustment(input: {
  index: AcpPriceIndexSnapshot | null;
  price: number | null;
  observedAt: string | null;
  analysisAt: string;
}): AcpTimeAdjustment {
  const price =
    typeof input.price === "number" && Number.isFinite(input.price) && input.price > 0
      ? input.price
      : null;
  const analysisPeriod = quarterOfDate(input.analysisAt);
  const analysisQuarter = periodLabel(analysisPeriod);

  if (price === null) {
    return empty("Fără ajustare în timp: comparabilul nu are preț.", null, analysisQuarter);
  }
  const series = points(input.index);
  if (series.length === 0) {
    return empty(
      "Fără ajustare în timp: indicele trimestrial nu este disponibil în baza de date.",
      price,
      analysisQuarter,
    );
  }
  if (!input.observedAt) {
    return empty(
      "Fără ajustare în timp: nu se cunoaște trimestrul din care provine prețul comparabilului.",
      price,
      analysisQuarter,
    );
  }

  let observedPeriod: QuarterPeriod;
  try {
    observedPeriod = quarterOfDate(input.observedAt);
  } catch {
    return empty(
      "Fără ajustare în timp: data prețului comparabilului nu poate fi citită.",
      price,
      analysisQuarter,
    );
  }
  const comparableQuarter = periodLabel(observedPeriod);

  const newest = newestPoint(series);
  const clamped = newest !== null && comparePeriods(analysisPeriod, newest) > 0;
  const targetPeriod = clamped && newest ? { year: newest.year, quarter: newest.quarter } : analysisPeriod;
  const usedQuarter = periodLabel(targetPeriod);

  const ratio = indexRatio(series, observedPeriod, targetPeriod);
  if (ratio === null) {
    return {
      applied: false,
      reason: `Fără ajustare în timp: indicele nu are valoare pentru ${comparableQuarter}.`,
      originalPrice: price,
      comparableQuarter,
      analysisQuarter,
      usedQuarter,
      clamped,
      ratio: null,
      adjustedPrice: price,
    };
  }
  if (
    !Number.isFinite(ratio) ||
    ratio < ACP_TIME_ADJUSTMENT_BOUNDS.minRatio ||
    ratio > ACP_TIME_ADJUSTMENT_BOUNDS.maxRatio
  ) {
    return {
      applied: false,
      reason: `Fără ajustare în timp: raportul indicelui (${round4(ratio)}) este în afara intervalului acceptat ${ACP_TIME_ADJUSTMENT_BOUNDS.minRatio}–${ACP_TIME_ADJUSTMENT_BOUNDS.maxRatio}.`,
      originalPrice: price,
      comparableQuarter,
      analysisQuarter,
      usedQuarter,
      clamped,
      ratio: round4(ratio),
      adjustedPrice: price,
    };
  }

  const rounded = round4(ratio);
  const adjustedPrice = round2(price * rounded);
  const clampNote = clamped
    ? ` Indicele este publicat până la ${usedQuarter}, deci ajustarea se oprește acolo.`
    : "";
  return {
    applied: true,
    reason:
      rounded === 1
        ? `Fără ajustare în timp: prețul provine din același trimestru (${comparableQuarter}).${clampNote}`
        : `Preț adus din ${comparableQuarter} în ${usedQuarter} cu indicele național (raport ${rounded}).${clampNote}`,
    originalPrice: price,
    comparableQuarter,
    analysisQuarter,
    usedQuarter,
    clamped,
    ratio: rounded,
    adjustedPrice,
  };
}

/** Nota de nivel analiză: indicele, sursa, baza, caracterul național, plafonarea. */
export function buildAcpTimeAdjustmentSummary(input: {
  index: AcpPriceIndexSnapshot | null;
  analysisAt: string;
  adjustments: readonly AcpTimeAdjustment[];
}): AcpTimeAdjustmentSummary {
  const analysisQuarter = periodLabel(quarterOfDate(input.analysisAt));
  const series = points(input.index);
  const newest = newestPoint(series);
  const appliedCount = input.adjustments.filter((a) => a.applied).length;
  const skippedCount = input.adjustments.length - appliedCount;
  const clampedTo = input.adjustments.find((a) => a.clamped)?.usedQuarter ?? null;

  if (!input.index || series.length === 0) {
    return {
      applied: false,
      note: "Fără ajustare în timp: indicele trimestrial al prețurilor locuințelor nu este disponibil în baza de date, deci prețurile comparabilelor sunt folosite așa cum au fost observate.",
      index: null,
      analysisQuarter,
      clampedTo: null,
      appliedCount: 0,
      skippedCount,
    };
  }

  const parts = [
    `Prețurile comparabilelor sunt aduse la trimestrul analizei (${analysisQuarter}) cu indicele trimestrial al prețurilor locuințelor, seria „${input.index.series}", sursa ${input.index.source} (set de date ${input.index.dataset}, bază ${input.index.baseLabel}).`,
    "Indicele este NAȚIONAL (România): nu reflectă evoluția unei localități sau a unui cartier anume.",
  ];
  if (clampedTo) {
    parts.push(
      `Indicele este publicat până la ${clampedTo}; ajustarea se oprește la acest trimestru și nu extrapolează mai departe.`,
    );
  }
  if (skippedCount > 0) {
    parts.push(
      `${skippedCount} comparabile au rămas neajustate (motivul este consemnat pe fiecare); o valoare lipsă nu este niciodată inventată.`,
    );
  }

  return {
    applied: appliedCount > 0,
    note: parts.join(" "),
    index: {
      source: input.index.source,
      dataset: input.index.dataset,
      series: input.index.series,
      unit: input.index.unit,
      baseLabel: input.index.baseLabel,
      region: input.index.region,
      newestQuarter: newest ? periodLabel(newest) : null,
      quarters: series.length,
    },
    analysisQuarter,
    clampedTo,
    appliedCount,
    skippedCount,
  };
}
