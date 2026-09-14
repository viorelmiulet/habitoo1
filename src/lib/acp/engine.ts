/**
 * Motorul determinist ACP.
 *
 * Funcție pură: aceleași intrări produc mereu același rezultat, fără rețea,
 * bază de date sau AI. Serverul se ocupă doar de colectarea candidaților și de
 * persistență; toată logica de selecție, ajustare, statistică și estimare
 * trăiește aici, ca să poată fi testată izolat.
 */
import {
  ACP_THRESHOLDS,
  classifyComparable,
  type AcpComparableTier,
  type AcpSourceType,
} from "./config";
import { calculateComparableSimilarity, type AcpSubject } from "./scoring";
import {
  calculateAdjustments,
  type AcpAdjustment,
  type AcpAdjustmentFactor,
} from "./adjustments";
import {
  calculateMarketStatistics,
  detectPriceOutliers,
  percentile,
  pricePerSqm,
  type MarketStatistics,
} from "./statistics";
import { calculateConfidence, type ConfidenceResult } from "./confidence";
import {
  assessAcpDataQuality,
  calculateDataQuality,
  calculateFreshness,
  calculatePriceHistory,
  comparableRelevance,
  type AcpDataQuality,
  type AcpFreshness,
  type AcpListingMeta,
  type AcpPriceHistory,
  type AcpQualityAssessment,
} from "./precision";
import {
  applyCalibration,
  type AcpAdvancedEstimate,
  type AcpCalibrationModel,
} from "./calibration";

/** Marja aplicată valorii estimate pentru prețul recomandat de listare. */
export const ACP_LISTING_PREMIUM_PERCENT = 3;

/** Intervalul minim de valoare (±%) când comparabilele sunt foarte apropiate. */
export const ACP_MIN_RANGE_PERCENT = 4;

export type AcpCandidate = {
  /** Cheie stabilă (id-ul sursei), folosită pentru păstrarea deciziilor manuale. */
  key: string;
  sourceType: AcpSourceType;
  sourceName: string;
  propertyId?: string | null;
  marketListingId?: string | null;
  title: string;
  locationLabel?: string | null;
  imagePath?: string | null;
  url?: string | null;
  subject: AcpSubject;
  /** Metadate reale de piață (prospețime, istoric preț), când există. */
  meta?: AcpListingMeta | null;
};

/** Opțiuni Stage 7: calibrare activă și momentul de referință pentru prospețime. */
export type AcpRunOptions = {
  calibration?: AcpCalibrationModel | null;
  /** Momentul de referință (ISO). Implicit „acum”; fixat în teste și snapshot-uri. */
  now?: string;
};

/** Decizie manuală a utilizatorului pentru un comparabil. */
export type AcpManualOverride = "include" | "exclude";

export type AcpComparableResult = {
  key: string;
  sourceType: AcpSourceType;
  sourceName: string;
  propertyId: string | null;
  marketListingId: string | null;
  title: string;
  locationLabel: string | null;
  imagePath: string | null;
  url: string | null;
  subject: AcpSubject;
  similarityScore: number;
  components: Record<string, number>;
  tier: AcpComparableTier;
  adjustments: AcpAdjustment[];
  adjustmentAmount: number | null;
  adjustmentPercent: number | null;
  skippedAdjustments: AcpAdjustmentFactor[];
  adjustedPrice: number | null;
  adjustedPricePerSqm: number | null;
  isOutlier: boolean;
  outlierReason: string | null;
  isSelected: boolean;
  selectionReason: string;
  manualOverride: AcpManualOverride | null;
  /** Stage 7: completitudinea datelor comparabilului. */
  dataQuality: AcpDataQuality;
  /** Stage 7: prospețimea ofertei, din ultima confirmare reală. */
  freshness: AcpFreshness;
  /** Stage 7: istoricul prețului, dedus din snapshot-urile reale. */
  priceHistory: AcpPriceHistory;
  /** Stage 7: scor compus folosit pentru ordonarea comparabilelor. */
  relevanceScore: number;
};

export type AcpEstimate = {
  estimatedValue: number | null;
  estimatedMin: number | null;
  estimatedMax: number | null;
  recommendedListingPrice: number | null;
  /** Baza estimării: preț pe mp (robust) sau preț total. */
  basis: "price_per_sqm" | "price" | "insufficient_data";
};

export type AcpAnalysisResult = {
  comparables: AcpComparableResult[];
  statistics: MarketStatistics;
  estimate: AcpEstimate;
  confidence: ConfidenceResult;
  /** Câți candidați au fost evaluați în total. */
  candidatesFound: number;
  /** Câți comparabile intră în statistică. */
  comparablesUsed: number;
  /** Explicația pas cu pas, afișată în secțiunea „Cum s-a calculat”. */
  explanation: string[];
  /** Stage 7: calitatea datelor, distinctă de încredere. */
  quality: AcpQualityAssessment;
  /** Stage 7: baseline vs estimare calibrată. */
  advanced: AcpAdvancedEstimate;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tierReason(tier: AcpComparableTier, score: number): string {
  if (tier === "direct") return `Comparabil direct (scor ${score} ≥ ${ACP_THRESHOLDS.direct}).`;
  if (tier === "secondary")
    return `Comparabil secundar (scor ${score}, între ${ACP_THRESHOLDS.secondary} și ${ACP_THRESHOLDS.direct}).`;
  return `Exclus automat: scor ${score} sub pragul de ${ACP_THRESHOLDS.secondary}.`;
}

/**
 * Rulează analiza completă. `overrides` păstrează deciziile manuale ale
 * utilizatorului (include/exclude) între recalculări.
 */
export function runAcpAnalysis(
  target: AcpSubject,
  candidates: readonly AcpCandidate[],
  overrides: Readonly<Record<string, AcpManualOverride>> = {},
  options: AcpRunOptions = {},
): AcpAnalysisResult {
  const explanation: string[] = [];
  const now = options.now ?? new Date().toISOString();

  // 1. Scoring determinist pentru fiecare candidat.
  const scored = candidates.map((candidate) => {
    const similarity = calculateComparableSimilarity(target, candidate.subject);
    const override = overrides[candidate.key] ?? null;
    const price = num(candidate.subject.price);
    return { candidate, similarity, override, price };
  });

  explanation.push(
    `Au fost evaluați ${candidates.length} candidați din sursele selectate, cu aceleași ponderi pentru toate analizele.`,
  );

  // 2. Eligibilitate: prag de similaritate + preț disponibil, cu respectarea
  //    deciziilor manuale ale utilizatorului.
  const prepared = scored.map((row) => {
    const tier = row.similarity.tier;
    const hasPrice = row.price !== null && row.price > 0;
    let eligible = hasPrice && tier !== "excluded";
    let reason = hasPrice
      ? tierReason(tier, row.similarity.similarityScore)
      : "Exclus: comparabilul nu are preț publicat.";
    if (row.override === "exclude") {
      eligible = false;
      reason = "Exclus manual de utilizator.";
    } else if (row.override === "include" && hasPrice) {
      eligible = true;
      reason = `Inclus manual de utilizator (scor ${row.similarity.similarityScore}).`;
    }
    const adjustment = hasPrice
      ? calculateAdjustments(target, row.candidate.subject)
      : null;
    return { ...row, tier, eligible, reason, adjustment };
  });

  // 3. Outlieri pe prețul ajustat pe mp (sau pe prețul ajustat, când lipsește
  //    suprafața). Datele nu se șterg niciodată, doar se marchează.
  const eligible = prepared.filter((row) => row.eligible);
  const outlierBasis = eligible.map(
    (row) => row.adjustment?.adjustedPricePerSqm ?? row.adjustment?.adjustedPrice ?? null,
  );
  const outliers = detectPriceOutliers(outlierBasis);
  const outlierByKey = new Map<string, { isOutlier: boolean; reason: string | null }>();
  eligible.forEach((row, index) => {
    const flag = outliers.flags[index];
    outlierByKey.set(row.candidate.key, {
      isOutlier: Boolean(flag?.isOutlier),
      reason: flag?.isOutlier
        ? flag.reason === "low"
          ? `Preț atipic de mic: sub limita IQR de ${outliers.lowerBound}.`
          : `Preț atipic de mare: peste limita IQR de ${outliers.upperBound}.`
        : null,
    });
  });

  if (outliers.outlierCount > 0) {
    explanation.push(
      `${outliers.outlierCount} comparabile au fost marcate ca atipice prin metoda IQR (interval acceptat ${outliers.lowerBound} – ${outliers.upperBound}). Rămân vizibile, dar nu influențează statistica.`,
    );
  }

  const comparables: AcpComparableResult[] = prepared.map((row) => {
    const outlier = outlierByKey.get(row.candidate.key) ?? { isOutlier: false, reason: null };
    const isSelected = row.eligible && !outlier.isOutlier;
    const reason = outlier.isOutlier ? `${row.reason} ${outlier.reason ?? ""}`.trim() : row.reason;
    // Stage 7: calitatea datelor, prospețimea și istoricul prețului. Aceste
    // scoruri sunt descriptive: nu modifică prețul sau ajustările.
    const meta = row.candidate.meta ?? null;
    const dataQuality = calculateDataQuality(row.candidate.subject);
    const freshness = calculateFreshness(meta, now);
    const priceHistory = calculatePriceHistory(
      { ...(meta ?? {}), currentPrice: meta?.currentPrice ?? row.candidate.subject.price ?? null },
      now,
    );
    return {
      key: row.candidate.key,
      sourceType: row.candidate.sourceType,
      sourceName: row.candidate.sourceName,
      propertyId: row.candidate.propertyId ?? null,
      marketListingId: row.candidate.marketListingId ?? null,
      title: row.candidate.title,
      locationLabel: row.candidate.locationLabel ?? null,
      imagePath: row.candidate.imagePath ?? null,
      url: row.candidate.url ?? null,
      subject: row.candidate.subject,
      similarityScore: row.similarity.similarityScore,
      components: row.similarity.components,
      tier: row.tier,
      adjustments: row.adjustment?.adjustments ?? [],
      adjustmentAmount: row.adjustment?.totalAmount ?? null,
      adjustmentPercent: row.adjustment?.totalPercent ?? null,
      skippedAdjustments: row.adjustment?.skipped ?? [],
      adjustedPrice: row.adjustment?.adjustedPrice ?? null,
      adjustedPricePerSqm: row.adjustment?.adjustedPricePerSqm ?? null,
      isOutlier: outlier.isOutlier,
      outlierReason: outlier.reason,
      isSelected,
      selectionReason: reason,
      manualOverride: row.override,
      dataQuality,
      freshness,
      priceHistory,
      relevanceScore: comparableRelevance({
        similarityScore: row.similarity.similarityScore,
        dataQualityScore: dataQuality.score,
        freshnessScore: freshness.score,
      }),
    };
  });

  // Ordonare Stage 7: comparabilele folosite primele, apoi după relevanță
  // (similaritate + completitudine + prospețime), nu doar după similaritate.
  comparables.sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return b.similarityScore - a.similarityScore;
  });

  // 4. Statistici pe comparabilele efectiv folosite.
  const used = comparables.filter((c) => c.isSelected);
  const targetArea = num(target.usableArea);
  const statistics = calculateMarketStatistics(
    used.map((c) => ({
      price: c.adjustedPrice,
      usableArea: targetArea,
      pricePerSqm: c.adjustedPricePerSqm,
      isOutlier: false,
    })),
  );

  explanation.push(
    `Statistica folosește ${used.length} comparabile. Se raportează mediana (valoare robustă) alături de medie, P25 și P75.`,
  );

  // 5. Estimare deterministă.
  const ppsmValues = used
    .map((c) => c.adjustedPricePerSqm)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const priceValues = used
    .map((c) => c.adjustedPrice)
    .filter((v): v is number => typeof v === "number" && v > 0);

  let estimate: AcpEstimate = {
    estimatedValue: null,
    estimatedMin: null,
    estimatedMax: null,
    recommendedListingPrice: null,
    basis: "insufficient_data",
  };

  const buildRange = (value: number, low: number | null, high: number | null) => {
    const minPct = value * (1 - ACP_MIN_RANGE_PERCENT / 100);
    const maxPct = value * (1 + ACP_MIN_RANGE_PERCENT / 100);
    return {
      min: round2(Math.min(low ?? minPct, minPct)),
      max: round2(Math.max(high ?? maxPct, maxPct)),
    };
  };

  if (targetArea !== null && targetArea > 0 && ppsmValues.length > 0) {
    const medianPpsm = percentile(ppsmValues, 0.5)!;
    const p25 = percentile(ppsmValues, 0.25);
    const p75 = percentile(ppsmValues, 0.75);
    const value = round2(medianPpsm * targetArea);
    const range = buildRange(
      value,
      p25 !== null ? p25 * targetArea : null,
      p75 !== null ? p75 * targetArea : null,
    );
    estimate = {
      estimatedValue: value,
      estimatedMin: range.min,
      estimatedMax: range.max,
      recommendedListingPrice: round2(value * (1 + ACP_LISTING_PREMIUM_PERCENT / 100)),
      basis: "price_per_sqm",
    };
    explanation.push(
      `Valoarea estimată = mediana prețului ajustat pe mp (${medianPpsm}) × suprafața utilă a proprietății (${targetArea} mp).`,
    );
  } else if (priceValues.length > 0) {
    const medianPrice = percentile(priceValues, 0.5)!;
    const range = buildRange(
      medianPrice,
      percentile(priceValues, 0.25),
      percentile(priceValues, 0.75),
    );
    estimate = {
      estimatedValue: round2(medianPrice),
      estimatedMin: range.min,
      estimatedMax: range.max,
      recommendedListingPrice: round2(medianPrice * (1 + ACP_LISTING_PREMIUM_PERCENT / 100)),
      basis: "price",
    };
    explanation.push(
      `Suprafața utilă a proprietății lipsește, deci valoarea estimată este mediana prețurilor ajustate (${medianPrice}).`,
    );
  } else {
    explanation.push(
      "Nu există comparabile utilizabile: analiza nu produce o valoare estimată. Adaugă surse sau include manual comparabile relevante.",
    );
  }

  if (estimate.recommendedListingPrice !== null) {
    explanation.push(
      `Prețul recomandat de listare adaugă o marjă de negociere de ${ACP_LISTING_PREMIUM_PERCENT}% peste valoarea estimată.`,
    );
  }

  // 6. Încredere.
  const confidence = calculateConfidence({
    usedCount: used.length,
    similarityScores: used.map((c) => c.similarityScore),
    pricePerSqmValues: ppsmValues,
  });
  explanation.push(
    `Încredere ${confidence.score}/100: cantitate ${confidence.quantity}, calitate ${confidence.quality}, dispersie ${confidence.dispersion}.`,
  );

  // 7. Stage 7: estimarea calibrată (avansată). Baseline-ul rămâne intact;
  //    calibrarea se aplică numai dacă modelul activ are date suficiente.
  const advanced = applyCalibration({
    baselineValue: estimate.estimatedValue,
    baselineMin: estimate.estimatedMin,
    baselineMax: estimate.estimatedMax,
    baselineRecommended: estimate.recommendedListingPrice,
    model: options.calibration ?? null,
    subject: target,
  });
  if (advanced.applied) {
    explanation.push(
      `Estimare calibrată: baseline × ${advanced.factor} (${advanced.reason}). Baseline-ul determinist rămâne raportat separat.`,
    );
  } else {
    explanation.push(`Fără calibrare aplicată: ${advanced.reason}`);
  }

  // 8. Stage 7: calitatea datelor, separată de scorul de încredere.
  const quality = assessAcpDataQuality({
    usedCount: used.length,
    similarityScores: used.map((c) => c.similarityScore),
    dispersionRatio: confidence.dispersionRatio,
    freshnessScores: used
      .map((c) => c.freshness.score)
      .filter((v): v is number => typeof v === "number"),
    dataQualityScores: used.map((c) => c.dataQuality.score),
    distinctSources: new Set(used.map((c) => c.sourceName || c.sourceType)).size,
    outlierCount: outliers.outlierCount,
    totalEligible: eligible.length,
    calibrationReliability:
      options.calibration && options.calibration.status === "ok"
        ? options.calibration.confidence
        : null,
  });
  explanation.push(
    `Calitatea datelor ${quality.score}/100 (${quality.level}); indicator distinct de scorul de încredere.`,
  );

  return {
    comparables,
    statistics,
    estimate,
    confidence,
    candidatesFound: candidates.length,
    comparablesUsed: used.length,
    explanation,
    quality,
    advanced,
  };
}

/** Preț pe mp al proprietății analizate, pentru comparație în interfață. */
export function targetPricePerSqm(target: AcpSubject): number | null {
  return num(target.pricePerSqm) ?? pricePerSqm(target.price, target.usableArea);
}
