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
import {
  ACP_CURRENT_ENGINE_VERSION,
  engineSupportsAgeWeighting,
  engineSupportsGeoLocation,
  engineSupportsTimeAdjustment,
  normalizeAcpEngineVersion,
  type AcpEngineVersion,
} from "./engine-version";
import {
  buildAcpTimeAdjustmentSummary,
  computeAcpTimeAdjustment,
  type AcpPriceIndexSnapshot,
  type AcpTimeAdjustment,
  type AcpTimeAdjustmentSummary,
} from "./time-adjustment";

/** Marja aplicată valorii estimate pentru prețul recomandat de listare. */
export const ACP_LISTING_PREMIUM_PERCENT = 3;

/** Motor v5: ofertele inactive mai vechi de atât nu se mai folosesc. */
export const ACP_INACTIVE_MAX_AGE_DAYS = 365;
/** Motor v5: ponderea minimă a unei oferte inactive (la 12 luni). */
export const ACP_INACTIVE_MIN_WEIGHT = 0.4;

/**
 * Motor v5: ponderea unui comparabil după vechime. Ofertele active au 1;
 * cele inactive scad liniar de la 0,9 (abia dispărute) la 0,4 (12 luni), ca
 * ofertele active să rămână mereu prioritare. `null` = prea veche, exclusă.
 */
export function acpAgeWeight(meta: AcpListingMeta | null | undefined, now: string): number | null {
  if (!meta || meta.status !== "inactive") return 1;
  const seen = meta.lastSeenAt ? Date.parse(meta.lastSeenAt) : NaN;
  if (!Number.isFinite(seen)) return ACP_INACTIVE_MIN_WEIGHT;
  const ageDays = Math.max(0, (Date.parse(now) - seen) / 86_400_000);
  if (ageDays > ACP_INACTIVE_MAX_AGE_DAYS) return null;
  return round2(0.9 - (0.9 - ACP_INACTIVE_MIN_WEIGHT) * (ageDays / ACP_INACTIVE_MAX_AGE_DAYS));
}

/** Mediana ponderată (prima valoare la care ponderea cumulată atinge p). */
export function weightedPercentile(items: readonly { value: number; weight: number }[], p: number): number | null {
  const sorted = items.filter((i) => i.value > 0 && i.weight > 0).sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return null;
  const total = sorted.reduce((sum, i) => sum + i.weight, 0);
  let acc = 0;
  for (const item of sorted) {
    acc += item.weight;
    if (acc >= total * p - 1e-9) return round2(item.value);
  }
  return round2(sorted[sorted.length - 1]!.value);
}

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
  /** Motor v4: preț semnalat ca suspect de îmbogățirea AI (încredere ≥ 0,7). */
  priceSuspect?: string | null;
  /** Date doar pentru raport (poze, stare, descriere); nu intră în calcul. */
  reportExtras?: AcpReportExtras | null;
};

/** Informații de afișare salvate în snapshot pentru raportul PDF; nu influențează cifrele. */
export type AcpReportExtras = {
  reference?: string | null;
  /** URL-uri publice de poze (max 3), pentru ofertele de piață. */
  photos?: string[];
  /** Căi din storage-ul privat (max 3), pentru proprietățile din Habitoo. */
  photoPaths?: string[];
  status?: "active" | "inactive" | null;
  firstSeenAt?: string | null;
  disappearedAt?: string | null;
  description?: string | null;
};

/** Opțiuni Stage 7: calibrare activă și momentul de referință pentru prospețime. */
export type AcpRunOptions = {
  calibration?: AcpCalibrationModel | null;
  /** Momentul de referință (ISO). Implicit „acum”; fixat în teste și snapshot-uri. */
  now?: string;
  /**
   * Versiunea motorului. Analizele deja salvate se recalculează cu versiunea lor
   * și produc exact același rezultat; implicit se folosește versiunea curentă.
   */
  engineVersion?: number;
  /**
   * Indicele trimestrial al prețurilor locuințelor, citit din baza de date.
   * Fără el (sau cu tabelul gol) motorul se comportă ca versiunea 1: nicio
   * ajustare în timp, doar o notă explicativă.
   */
  priceIndex?: AcpPriceIndexSnapshot | null;
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
  /**
   * Motor v2: aducerea prețului la trimestrul analizei. Absent pentru versiunea
   * 1, ca rezultatele istorice să se reproducă identic.
   */
  timeAdjustment?: AcpTimeAdjustment;
  /** Motor v4: distanța față de proprietate (km), când ambele au coordonate. */
  distanceKm?: number | null;
  /** Motor v5: ponderea după vechime (1 = activă). */
  ageWeight?: number;
  /** Date doar pentru raport, copiate neschimbate din candidat. */
  reportExtras?: AcpReportExtras;
};

/** Motor v4: estimarea diferă cu peste acest procent de prețul de listare. */
export const ACP_SANITY_DEVIATION_PERCENT = 25;

/** Motor v4: avertismentul de bun-simț, cu cele mai importante cauze. */
export type AcpSanityCheck = {
  listingPrice: number;
  estimatedValue: number;
  deviationPercent: number;
  causes: string[];
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
  /** Motor v2: versiunea folosită. Absentă pentru versiunea 1 (compatibilitate). */
  engineVersion?: AcpEngineVersion;
  /** Motor v2: nota de nivel analiză despre ajustarea în timp. */
  timeAdjustment?: AcpTimeAdjustmentSummary;
  /** Motor v4: avertisment când estimarea diferă mult de prețul de listare. */
  sanityCheck?: AcpSanityCheck | null;
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
  const engineVersion = normalizeAcpEngineVersion(
    options.engineVersion ?? ACP_CURRENT_ENGINE_VERSION,
  );
  const timeEnabled = engineSupportsTimeAdjustment(engineVersion);
  const geoEnabled = engineSupportsGeoLocation(engineVersion);
  const ageEnabled = engineSupportsAgeWeighting(engineVersion);

  // 1. Scoring determinist pentru fiecare candidat.
  const scored = candidates.map((candidate) => {
    const similarity = calculateComparableSimilarity(target, candidate.subject, {
      geoLocation: geoEnabled,
    });
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
    if (geoEnabled && row.candidate.priceSuspect && row.override !== "include") {
      eligible = false;
      reason = `Exclus: preț suspect (${row.candidate.priceSuspect}).`;
    }
    const ageWeight = ageEnabled ? acpAgeWeight(row.candidate.meta, now) : 1;
    if (ageWeight === null && row.override !== "include") {
      eligible = false;
      reason = "Exclus: ofertă inactivă mai veche de 12 luni.";
    }
    if (row.override === "exclude") {
      eligible = false;
      reason = "Exclus manual de utilizator.";
    } else if (row.override === "include" && hasPrice) {
      eligible = true;
      reason = `Inclus manual de utilizator (scor ${row.similarity.similarityScore}).`;
    }
    // Motor v2: prețul comparabilului este adus la trimestrul analizei ÎNAINTE
    // de ajustările de caracteristici, cu indicele național citit din baza de
    // date. Versiunea 1 rămâne neatinsă.
    const meta = row.candidate.meta ?? null;
    const timeAdjustment = timeEnabled
      ? computeAcpTimeAdjustment({
          index: options.priceIndex ?? null,
          price: row.price,
          observedAt: meta?.lastSeenAt ?? meta?.firstSeenAt ?? null,
          analysisAt: now,
        })
      : null;
    const subjectForAdjustments =
      timeAdjustment?.applied && timeAdjustment.adjustedPrice !== null
        ? {
            ...row.candidate.subject,
            price: timeAdjustment.adjustedPrice,
            pricePerSqm: pricePerSqm(
              timeAdjustment.adjustedPrice,
              num(row.candidate.subject.usableArea),
            ),
          }
        : row.candidate.subject;
    const adjustment = hasPrice ? calculateAdjustments(target, subjectForAdjustments) : null;
    return { ...row, tier, eligible, reason, adjustment, timeAdjustment, ageWeight: ageWeight ?? ACP_INACTIVE_MIN_WEIGHT };
  });

  // 2b. Motor v2: nota de nivel analiză despre ajustarea în timp.
  const timeSummary = timeEnabled
    ? buildAcpTimeAdjustmentSummary({
        index: options.priceIndex ?? null,
        analysisAt: now,
        adjustments: prepared
          .map((row) => row.timeAdjustment)
          .filter((value): value is NonNullable<typeof value> => value !== null),
      })
    : null;
  if (timeSummary) explanation.push(timeSummary.note);


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
      ...(row.candidate.reportExtras ? { reportExtras: row.candidate.reportExtras } : {}),
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
      ...(row.timeAdjustment ? { timeAdjustment: row.timeAdjustment } : {}),
      ...(geoEnabled ? { distanceKm: row.similarity.distanceKm ?? null } : {}),
      ...(ageEnabled ? { ageWeight: row.ageWeight } : {}),
    };

  });

  // Ordonare Stage 7: comparabilele folosite primele, apoi după relevanță
  // (similaritate + completitudine + prospețime), nu doar după similaritate.
  comparables.sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    // Motor v5: ofertele active înaintea celor inactive.
    if (ageEnabled && (a.ageWeight ?? 1) !== (b.ageWeight ?? 1)) return (b.ageWeight ?? 1) - (a.ageWeight ?? 1);
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
    const weighted = used
      .filter((c) => typeof c.adjustedPricePerSqm === "number" && c.adjustedPricePerSqm > 0)
      .map((c) => ({ value: c.adjustedPricePerSqm as number, weight: c.ageWeight ?? 1 }));
    const useWeights = ageEnabled && weighted.some((w) => w.weight < 1);
    const medianPpsm = useWeights ? weightedPercentile(weighted, 0.5)! : percentile(ppsmValues, 0.5)!;
    const p25 = useWeights ? weightedPercentile(weighted, 0.25) : percentile(ppsmValues, 0.25);
    const p75 = useWeights ? weightedPercentile(weighted, 0.75) : percentile(ppsmValues, 0.75);
    if (useWeights) {
      const inactive = weighted.filter((w) => w.weight < 1).length;
      explanation.push(
        `${inactive} comparabile sunt oferte care nu mai sunt active (din ultimele 12 luni): prețul lor e adus la zi cu indicele de preț și contează mai puțin, cu atât mai puțin cu cât sunt mai vechi (pondere între ${ACP_INACTIVE_MIN_WEIGHT} și 0,9 față de 1 pentru ofertele active). Se folosește mediana ponderată.`,
      );
    }
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

  const sanityCheck = geoEnabled
    ? buildSanityCheck({ target, estimate, used, dispersionRatio: confidence.dispersionRatio, ppsmValues })
    : null;
  if (sanityCheck) {
    explanation.push(
      `Atenție: estimarea diferă cu ${sanityCheck.deviationPercent}% de prețul de listare al proprietății. Cauze probabile: ${sanityCheck.causes.join(" ")}`,
    );
  }

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
    ...(timeEnabled ? { engineVersion, timeAdjustment: timeSummary ?? undefined } : {}),
    ...(geoEnabled ? { sanityCheck } : {}),
  };
}

/**
 * Motor v4: verificarea de bun-simț. Nu modifică estimarea; doar explică,
 * cu cele mai importante 3 cauze, de ce diferă mult de prețul de listare.
 */
export function buildSanityCheck(input: {
  target: AcpSubject;
  estimate: AcpEstimate;
  used: readonly AcpComparableResult[];
  dispersionRatio: number | null | undefined;
  ppsmValues: readonly number[];
}): AcpSanityCheck | null {
  const listing = num(input.target.price);
  const value = input.estimate.estimatedValue;
  if (listing === null || listing <= 0 || value === null || value <= 0) return null;
  const deviation = ((value - listing) / listing) * 100;
  if (Math.abs(deviation) <= ACP_SANITY_DEVIATION_PERCENT) return null;

  const causes: { weight: number; text: string }[] = [];
  const used = input.used;
  const n = used.length;

  // Zona comparabilelor.
  const farOrOther = used.filter((c) => {
    if (typeof c.distanceKm === "number") return c.distanceKm > 2;
    return (c.components["location"] ?? 0) < 85;
  });
  if (n > 0 && farOrOther.length > 0) {
    const labels = new Map<string, number>();
    for (const c of farOrOther) {
      const label = c.locationLabel ?? "altă zonă";
      labels.set(label, (labels.get(label) ?? 0) + 1);
    }
    const top = [...labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    causes.push({
      weight: (farOrOther.length / n) * 100,
      text: `${farOrOther.length} din ${n} comparabile sunt din altă zonă sau la peste 2 km (mai ales ${top}).`,
    });
  }
  // Numărul comparabilelor.
  if (n < 5) {
    causes.push({ weight: 90 - n * 10, text: `Doar ${n} comparabile au fost folosite în calcul.` });
  }
  // Dispersia prețurilor.
  const ratio = typeof input.dispersionRatio === "number" ? input.dispersionRatio : null;
  if (ratio !== null && ratio > 0.25) {
    const p25 = percentile([...input.ppsmValues], 0.25);
    const p75 = percentile([...input.ppsmValues], 0.75);
    causes.push({
      weight: Math.min(100, ratio * 200),
      text:
        p25 !== null && p75 !== null
          ? `Prețurile pe mp ale comparabilelor variază mult (${Math.round(p25)}–${Math.round(p75)} €/mp).`
          : "Prețurile pe mp ale comparabilelor variază mult.",
    });
  }
  // Nivelul de preț pe mp față de proprietate.
  const targetArea = num(input.target.usableArea);
  const median = percentile([...input.ppsmValues], 0.5);
  if (targetArea && median !== null) {
    causes.push({
      weight: Math.min(60, Math.abs(deviation)),
      text: `Comparabilele au în medie ${Math.round(median)} €/mp, față de ${Math.round(listing / targetArea)} €/mp la proprietate.`,
    });
  }
  // Similaritate redusă.
  const avgScore = n > 0 ? used.reduce((s, c) => s + c.similarityScore, 0) / n : 0;
  if (n > 0 && avgScore < 85) {
    causes.push({
      weight: 85 - avgScore,
      text: `Comparabilele seamănă doar parțial cu proprietatea (scor mediu ${Math.round(avgScore)}).`,
    });
  }

  return {
    listingPrice: listing,
    estimatedValue: value,
    deviationPercent: Math.round(deviation),
    causes: causes
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((c) => c.text),
  };
}


/** Preț pe mp al proprietății analizate, pentru comparație în interfață. */
export function targetPricePerSqm(target: AcpSubject): number | null {
  return num(target.pricePerSqm) ?? pricePerSqm(target.price, target.usableArea);
}
