/**
 * Stage 7 — precizie ACP: prospețime, calitatea datelor, istoricul prețului și
 * scorul de relevanță al comparabilelor.
 *
 * Toate funcțiile sunt pure și deterministe. Ele NU modifică estimarea
 * deterministă (baseline); doar descriu cât de bune sunt datele pe care se
 * bazează analiza, astfel încât ordonarea comparabilelor și avertismentele să
 * fie explicabile.
 *
 * Distincția cerută explicit:
 *  - similarity score  = cât de asemănător este comparabilul cu ținta;
 *  - data quality      = cât de complete sunt datele comparabilului / analizei;
 *  - freshness         = cât de recentă este oferta;
 *  - confidence        = cât de sigură este estimarea (modul separat confidence.ts).
 */
import type { AcpSubject } from "./scoring";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Metadate reale ale unei oferte, provenite din pool-ul de piață. */
export type AcpListingMeta = {
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  initialPrice?: number | null;
  currentPrice?: number | null;
  priceChanges?: number | null;
  status?: string | null;
  duplicateCount?: number | null;
};

export const ACP_FRESHNESS_CONFIG = {
  freshDays: 7,
  recentDays: 30,
  agingDays: 90,
  /** Peste această vechime scorul de prospețime este 0. */
  zeroDays: 180,
  /** Scor folosit când nu există dată de referință (nu inventăm prospețime). */
  unknownScore: 50,
} as const;

export type AcpFreshnessLevel = "fresh" | "recent" | "aging" | "stale" | "unknown";

export type AcpFreshness = {
  ageDays: number | null;
  score: number;
  level: AcpFreshnessLevel;
  label: string;
};

const FRESHNESS_LABELS: Record<AcpFreshnessLevel, string> = {
  fresh: "Ofertă proaspătă",
  recent: "Ofertă recentă",
  aging: "Ofertă în curs de învechire",
  stale: "Ofertă învechită",
  unknown: "Vechime necunoscută",
};

/** Prospețimea unei oferte pe baza ultimei confirmări reale în feed. */
export function calculateFreshness(
  meta: AcpListingMeta | null | undefined,
  now: Date | string = new Date(),
): AcpFreshness {
  const reference = parseDate(meta?.lastSeenAt ?? null);
  const nowTime = typeof now === "string" ? (parseDate(now) ?? Date.now()) : now.getTime();
  if (reference === null) {
    return {
      ageDays: null,
      score: ACP_FRESHNESS_CONFIG.unknownScore,
      level: "unknown",
      label: FRESHNESS_LABELS.unknown,
    };
  }
  const ageDays = round2(Math.max(0, (nowTime - reference) / 86_400_000));
  const cfg = ACP_FRESHNESS_CONFIG;
  const score =
    ageDays <= cfg.freshDays
      ? 100
      : round2(clamp(100 * (1 - (ageDays - cfg.freshDays) / (cfg.zeroDays - cfg.freshDays))));
  const level: AcpFreshnessLevel =
    ageDays <= cfg.freshDays
      ? "fresh"
      : ageDays <= cfg.recentDays
        ? "recent"
        : ageDays <= cfg.agingDays
          ? "aging"
          : "stale";
  return { ageDays, score, level, label: FRESHNESS_LABELS[level] };
}

/** Câmpurile care contează pentru completitudinea unui comparabil. */
export const ACP_QUALITY_FIELDS = [
  "propertyType",
  "transactionType",
  "city",
  "district",
  "rooms",
  "usableArea",
  "floor",
  "constructionYear",
  "condition",
  "price",
] as const;

export type AcpDataQuality = {
  score: number;
  presentFields: number;
  totalFields: number;
  missing: string[];
};

/** Completitudinea datelor unui subiect (țintă sau comparabil). */
export function calculateDataQuality(subject: AcpSubject | null | undefined): AcpDataQuality {
  const missing: string[] = [];
  let present = 0;
  for (const field of ACP_QUALITY_FIELDS) {
    const value = subject ? (subject as Record<string, unknown>)[field] : undefined;
    const ok =
      typeof value === "number"
        ? Number.isFinite(value)
        : typeof value === "string"
          ? value.trim() !== ""
          : typeof value === "boolean"
            ? true
            : false;
    if (ok) present += 1;
    else missing.push(field);
  }
  const total = ACP_QUALITY_FIELDS.length;
  return {
    score: round2((present / total) * 100),
    presentFields: present,
    totalFields: total,
    missing,
  };
}

export type AcpPriceHistory = {
  initialPrice: number | null;
  currentPrice: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  priceChanges: number;
  direction: "increase" | "decrease" | "stable" | "unknown";
  /** 0–100: cât de stabil a fost prețul. Nu modifică prețul comparabilului. */
  stabilityScore: number;
  listedForDays: number | null;
  note: string;
};

/**
 * Istoricul prețului dedus exclusiv din datele reale ale ofertei
 * (preț inițial, preț curent, număr de modificări, prima/ultima apariție).
 */
export function calculatePriceHistory(
  meta: AcpListingMeta | null | undefined,
  now: Date | string = new Date(),
): AcpPriceHistory {
  const initial = num(meta?.initialPrice);
  const current = num(meta?.currentPrice);
  const changes = Math.max(0, Math.trunc(num(meta?.priceChanges) ?? 0));
  const first = parseDate(meta?.firstSeenAt ?? null);
  const nowTime = typeof now === "string" ? (parseDate(now) ?? Date.now()) : now.getTime();
  const listedForDays =
    first === null ? null : round2(Math.max(0, (nowTime - first) / 86_400_000));

  if (initial === null || current === null || initial <= 0) {
    return {
      initialPrice: initial,
      currentPrice: current,
      changeAmount: null,
      changePercent: null,
      priceChanges: changes,
      direction: "unknown",
      stabilityScore: changes === 0 ? 100 : round2(clamp(100 - changes * 15)),
      listedForDays,
      note:
        changes === 0
          ? "Nu există modificări de preț înregistrate."
          : `${changes} modificări de preț înregistrate; valorile de referință lipsesc.`,
    };
  }

  const changeAmount = round2(current - initial);
  const changePercent = round2((changeAmount / initial) * 100);
  const direction =
    Math.abs(changePercent) < 0.5 ? "stable" : changeAmount > 0 ? "increase" : "decrease";
  const stabilityScore = round2(clamp(100 - changes * 12 - Math.abs(changePercent) * 2));
  const note =
    direction === "stable"
      ? "Prețul a rămas practic neschimbat de la prima apariție."
      : direction === "decrease"
        ? `Preț redus cu ${Math.abs(changePercent)}% de la prima apariție.`
        : `Preț majorat cu ${changePercent}% de la prima apariție.`;

  return {
    initialPrice: initial,
    currentPrice: current,
    changeAmount,
    changePercent,
    priceChanges: changes,
    direction,
    stabilityScore,
    listedForDays,
    note,
  };
}

/** Ponderile scorului de relevanță folosit pentru ordonarea comparabilelor. */
export const ACP_RELEVANCE_WEIGHTS = {
  similarity: 70,
  dataQuality: 15,
  freshness: 15,
} as const;

/**
 * Scor compus de relevanță: similaritatea rămâne dominantă, dar un comparabil
 * complet și recent este prioritizat față de unul vechi cu aceeași similaritate.
 */
export function comparableRelevance(input: {
  similarityScore: number;
  dataQualityScore: number;
  freshnessScore: number;
}): number {
  const w = ACP_RELEVANCE_WEIGHTS;
  const total =
    (clamp(input.similarityScore) * w.similarity +
      clamp(input.dataQualityScore) * w.dataQuality +
      clamp(input.freshnessScore) * w.freshness) /
    100;
  return round2(clamp(total));
}

export const ACP_QUALITY_WEIGHTS = {
  count: 20,
  similarity: 20,
  dispersion: 12,
  freshness: 13,
  diversity: 10,
  completeness: 10,
  outliers: 8,
  calibration: 7,
} as const;

export type AcpQualityLevel = "high" | "medium" | "low";

export type AcpQualityFactor = {
  key: keyof typeof ACP_QUALITY_WEIGHTS;
  label: string;
  score: number;
  weight: number;
  note: string;
};

export type AcpQualityAssessment = {
  /** 0–100, distinct de confidence. */
  score: number;
  level: AcpQualityLevel;
  factors: AcpQualityFactor[];
  reasons: string[];
};

const QUALITY_LABELS: Record<keyof typeof ACP_QUALITY_WEIGHTS, string> = {
  count: "Număr comparabile",
  similarity: "Similaritate medie",
  dispersion: "Dispersia prețului pe mp",
  freshness: "Prospețimea ofertelor",
  diversity: "Diversitatea surselor",
  completeness: "Completitudinea datelor",
  outliers: "Proporția valorilor atipice",
  calibration: "Fiabilitatea calibrării",
};

export const ACP_QUALITY_LEVEL_LABELS: Record<AcpQualityLevel, string> = {
  high: "Calitate ridicată a datelor",
  medium: "Calitate medie a datelor",
  low: "Calitate scăzută a datelor",
};

export type AcpQualityInput = {
  usedCount: number;
  similarityScores: readonly number[];
  /** Coeficientul de variație al prețului pe mp (IQR / mediană), dacă există. */
  dispersionRatio: number | null;
  freshnessScores: readonly number[];
  dataQualityScores: readonly number[];
  distinctSources: number;
  outlierCount: number;
  totalEligible: number;
  /** 0–100, doar dacă există o calibrare validă. */
  calibrationReliability: number | null;
};

/**
 * Scorul de calitate a datelor: explicabil, cu motive, complet separat de
 * scorul de încredere al estimării.
 */
export function assessAcpDataQuality(input: AcpQualityInput): AcpQualityAssessment {
  const factors: AcpQualityFactor[] = [];
  const reasons: string[] = [];

  const avg = (values: readonly number[]) =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

  const countScore = round2(clamp((Math.min(input.usedCount, 8) / 8) * 100));
  factors.push({
    key: "count",
    label: QUALITY_LABELS.count,
    score: countScore,
    weight: ACP_QUALITY_WEIGHTS.count,
    note: `${input.usedCount} comparabile folosite din 8 ideale.`,
  });
  if (input.usedCount < 3) reasons.push("Sub 3 comparabile folosite: datele sunt insuficiente.");

  const avgSim = avg(input.similarityScores.filter((v) => Number.isFinite(v)));
  const simScore = avgSim === null ? 0 : round2(clamp(((avgSim - 70) / 30) * 100));
  factors.push({
    key: "similarity",
    label: QUALITY_LABELS.similarity,
    score: simScore,
    weight: ACP_QUALITY_WEIGHTS.similarity,
    note:
      avgSim === null
        ? "Fără scoruri de similaritate."
        : `Similaritate medie ${round2(avgSim)} din 100.`,
  });

  const dispScore =
    input.dispersionRatio === null ? 50 : round2(clamp(100 * (1 - input.dispersionRatio / 0.35)));
  factors.push({
    key: "dispersion",
    label: QUALITY_LABELS.dispersion,
    score: dispScore,
    weight: ACP_QUALITY_WEIGHTS.dispersion,
    note:
      input.dispersionRatio === null
        ? "Prea puține valori pentru a măsura dispersia."
        : `IQR / mediană = ${input.dispersionRatio}.`,
  });
  if (input.dispersionRatio !== null && input.dispersionRatio > 0.35) {
    reasons.push("Prețurile pe mp sunt foarte împrăștiate: intervalul estimat este larg.");
  }

  const avgFresh = avg(input.freshnessScores);
  factors.push({
    key: "freshness",
    label: QUALITY_LABELS.freshness,
    score: avgFresh === null ? 50 : round2(clamp(avgFresh)),
    weight: ACP_QUALITY_WEIGHTS.freshness,
    note:
      avgFresh === null
        ? "Fără date despre vechimea ofertelor."
        : `Prospețime medie ${round2(avgFresh)} din 100.`,
  });
  if (avgFresh !== null && avgFresh < 50) {
    reasons.push("Majoritatea comparabilelor sunt oferte învechite.");
  }

  const diversityScore = round2(clamp((Math.min(input.distinctSources, 3) / 3) * 100));
  factors.push({
    key: "diversity",
    label: QUALITY_LABELS.diversity,
    score: diversityScore,
    weight: ACP_QUALITY_WEIGHTS.diversity,
    note: `${input.distinctSources} surse distincte.`,
  });
  if (input.distinctSources <= 1) {
    reasons.push("Toate comparabilele provin dintr-o singură sursă.");
  }

  const avgCompleteness = avg(input.dataQualityScores);
  factors.push({
    key: "completeness",
    label: QUALITY_LABELS.completeness,
    score: avgCompleteness === null ? 0 : round2(clamp(avgCompleteness)),
    weight: ACP_QUALITY_WEIGHTS.completeness,
    note:
      avgCompleteness === null
        ? "Fără comparabile pentru a evalua completitudinea."
        : `Completitudine medie ${round2(avgCompleteness)}%.`,
  });

  const outlierRatio =
    input.totalEligible > 0 ? input.outlierCount / input.totalEligible : 0;
  factors.push({
    key: "outliers",
    label: QUALITY_LABELS.outliers,
    score: round2(clamp(100 - outlierRatio * 200)),
    weight: ACP_QUALITY_WEIGHTS.outliers,
    note: `${input.outlierCount} valori atipice din ${input.totalEligible} eligibile.`,
  });

  factors.push({
    key: "calibration",
    label: QUALITY_LABELS.calibration,
    score:
      input.calibrationReliability === null ? 50 : round2(clamp(input.calibrationReliability)),
    weight: ACP_QUALITY_WEIGHTS.calibration,
    note:
      input.calibrationReliability === null
        ? "Fără calibrare validă disponibilă."
        : `Fiabilitatea calibrării ${round2(input.calibrationReliability)} din 100.`,
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = round2(
    clamp(factors.reduce((sum, f) => sum + (f.score * f.weight) / 100, 0) * (100 / totalWeight)),
  );
  const level: AcpQualityLevel = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  if (reasons.length === 0) {
    reasons.push("Nu au fost identificate probleme majore de calitate a datelor.");
  }

  return { score, level, factors, reasons };
}
