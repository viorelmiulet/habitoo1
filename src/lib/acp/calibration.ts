/**
 * Stage 7 — calibrarea ACP pe date reale.
 *
 * Calibrarea compară estimările deterministe ACP cu prețurile observate real
 * (oferte/proprietăți cu preț publicat) și produce un factor de corecție
 * explicabil, versionat și reproductibil.
 *
 * Reguli anti-overfitting, aplicate strict:
 *  - fără volum minim de observații rezultatul este `insufficient_data` și NU se
 *    aplică nimic;
 *  - se folosesc statistici robuste (mediană + MAD), nu media;
 *  - factorul este plafonat la ±`maxFactorDeviationPercent`;
 *  - dacă împrăștierea (MAD) depășește pragul, calibrarea este considerată
 *    nefiabilă și nu se aplică;
 *  - segmentele (oraș / tip / camere) se calibrează separat numai când au volum
 *    propriu suficient ȘI sunt cel puțin la fel de stabile ca setul global;
 *  - baseline-ul determinist rămâne întotdeauna păstrat separat.
 */
import { median, percentile } from "./statistics";
import { normalizeText, type AcpSubject } from "./scoring";

export const ACP_CALIBRATION_CONFIG = {
  /** Observații minime pentru o calibrare globală. */
  minSampleSize: 12,
  /** Observații minime pentru calibrarea unui segment. */
  minSegmentSampleSize: 8,
  /** Deviația maximă admisă a factorului față de 1 (procent). */
  maxFactorDeviationPercent: 15,
  /** MAD maxim al raporturilor peste care calibrarea este nefiabilă. */
  maxMedianAbsoluteDeviation: 0.25,
  /** Numărul maxim de segmente păstrate (cele mai populate). */
  maxSegments: 8,
  /** Versiunea algoritmului, pentru reproductibilitate. */
  algorithmVersion: "acp-calibration-1",
} as const;

export type AcpCalibrationConfig = {
  -readonly [K in keyof typeof ACP_CALIBRATION_CONFIG]: (typeof ACP_CALIBRATION_CONFIG)[K] extends number
    ? number
    : string;
};

export type AcpCalibrationObservation = {
  /** Estimarea ACP (preț pe mp) pentru observație. */
  estimatedPricePerSqm?: number | null;
  /** Prețul pe mp observat real. */
  observedPricePerSqm?: number | null;
  city?: string | null;
  propertyType?: string | null;
  rooms?: number | null;
};

export type AcpCalibrationSegment = {
  key: string;
  label: string;
  sampleSize: number;
  medianRatio: number;
  medianAbsoluteDeviation: number;
  factor: number;
  applied: boolean;
  reason: string;
};

export type AcpCalibrationStatus = "ok" | "insufficient_data" | "unreliable";

export type AcpCalibrationResult = {
  status: AcpCalibrationStatus;
  /** Observații valide folosite. */
  sampleSize: number;
  /** Observații primite (inclusiv cele invalide). */
  observationsReceived: number;
  medianRatio: number | null;
  medianAbsoluteDeviation: number | null;
  /** Biasul sistematic în procente: cât subestimează (+) sau supraestimează (−) ACP. */
  biasPercent: number | null;
  /** Factorul global aplicabil (1 = fără corecție). */
  factor: number;
  /** Se aplică factorul global? */
  applied: boolean;
  /** 0–100, fiabilitatea calibrării. */
  confidence: number;
  segments: AcpCalibrationSegment[];
  p25Ratio: number | null;
  p75Ratio: number | null;
  minSampleSize: number;
  algorithmVersion: string;
  notes: string[];
};

/** Modelul persistat, folosit la aplicarea calibrării într-o analiză. */
export type AcpCalibrationModel = {
  version: number;
  status: AcpCalibrationStatus;
  factor: number;
  applied: boolean;
  medianRatio: number | null;
  medianAbsoluteDeviation: number | null;
  sampleSize: number;
  confidence: number;
  segments: AcpCalibrationSegment[];
  algorithmVersion: string;
  createdAt: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Cheia de segment: oraș normalizat | tip proprietate | număr camere. */
export function calibrationSegmentKey(input: {
  city?: string | null;
  propertyType?: string | null;
  rooms?: number | null;
}): string | null {
  const city = normalizeText(input.city);
  const type = normalizeText(input.propertyType);
  const rooms = num(input.rooms);
  if (city === "" || type === "" || rooms === null) return null;
  return `${city}|${type}|${Math.trunc(rooms)}`;
}

function segmentLabel(key: string): string {
  const [city, type, rooms] = key.split("|");
  return `${city ?? "?"} · ${type ?? "?"} · ${rooms ?? "?"} camere`;
}

function medianAbsoluteDeviation(values: readonly number[], center: number): number | null {
  if (values.length === 0) return null;
  const deviations = values.map((v) => Math.abs(v - center));
  const mad = median(deviations);
  return mad === null ? null : round4(mad);
}

function confidenceFrom(sampleSize: number, mad: number | null, cfg: AcpCalibrationConfig): number {
  const quantity = clamp(sampleSize / (cfg.minSampleSize * 2), 0, 1) * 60;
  const stability =
    mad === null ? 0 : clamp(1 - mad / cfg.maxMedianAbsoluteDeviation, 0, 1) * 40;
  return round2(quantity + stability);
}

/**
 * Calculează calibrarea din observații reale. Funcție pură: aceleași observații
 * produc mereu același rezultat.
 */
export function calculateCalibration(
  observations: readonly AcpCalibrationObservation[],
  overrides: Partial<Pick<AcpCalibrationConfig, "minSampleSize" | "minSegmentSampleSize">> = {},
): AcpCalibrationResult {
  const cfg: AcpCalibrationConfig = {
    ...ACP_CALIBRATION_CONFIG,
    minSampleSize: Math.max(1, overrides.minSampleSize ?? ACP_CALIBRATION_CONFIG.minSampleSize),
    minSegmentSampleSize: Math.max(
      1,
      overrides.minSegmentSampleSize ?? ACP_CALIBRATION_CONFIG.minSegmentSampleSize,
    ),
  };
  const notes: string[] = [];

  const valid: { ratio: number; segment: string | null }[] = [];
  for (const item of observations) {
    const estimated = num(item.estimatedPricePerSqm);
    const observed = num(item.observedPricePerSqm);
    if (estimated === null || observed === null || estimated <= 0 || observed <= 0) continue;
    valid.push({
      ratio: round4(observed / estimated),
      segment: calibrationSegmentKey(item),
    });
  }

  const ratios = valid.map((v) => v.ratio);
  const base: AcpCalibrationResult = {
    status: "insufficient_data",
    sampleSize: valid.length,
    observationsReceived: observations.length,
    medianRatio: null,
    medianAbsoluteDeviation: null,
    biasPercent: null,
    factor: 1,
    applied: false,
    confidence: 0,
    segments: [],
    p25Ratio: null,
    p75Ratio: null,
    minSampleSize: cfg.minSampleSize,
    algorithmVersion: cfg.algorithmVersion,
    notes,
  };

  if (valid.length < cfg.minSampleSize) {
    notes.push(
      `Date insuficiente pentru calibrare: ${valid.length} observații valide din minimul de ${cfg.minSampleSize}.`,
    );
    return base;
  }

  const medianRatio = median(ratios)!;
  const mad = medianAbsoluteDeviation(ratios, medianRatio);
  const confidence = confidenceFrom(valid.length, mad, cfg);
  const biasPercent = round2((medianRatio - 1) * 100);
  const maxDev = cfg.maxFactorDeviationPercent / 100;
  const factor = round4(clamp(medianRatio, 1 - maxDev, 1 + maxDev));

  notes.push(
    `${valid.length} observații valide; raport median observat/estimat ${round4(medianRatio)} (bias ${biasPercent}%).`,
  );
  if (factor !== round4(medianRatio)) {
    notes.push(
      `Factorul a fost plafonat la ±${cfg.maxFactorDeviationPercent}% pentru a evita corecțiile extreme.`,
    );
  }

  if (mad === null || mad > cfg.maxMedianAbsoluteDeviation) {
    notes.push(
      `Împrăștierea raporturilor (MAD ${mad ?? "n/a"}) depășește pragul de ${cfg.maxMedianAbsoluteDeviation}: calibrarea nu se aplică.`,
    );
    return {
      ...base,
      status: "unreliable",
      medianRatio: round4(medianRatio),
      medianAbsoluteDeviation: mad,
      biasPercent,
      factor: 1,
      applied: false,
      confidence,
      p25Ratio: percentile(ratios, 0.25),
      p75Ratio: percentile(ratios, 0.75),
    };
  }

  // Segmente: numai cu volum propriu suficient și stabilitate cel puțin
  // comparabilă cu setul global (evită overfitting pe nișe zgomotoase).
  const grouped = new Map<string, number[]>();
  for (const item of valid) {
    if (!item.segment) continue;
    const bucket = grouped.get(item.segment);
    if (bucket) bucket.push(item.ratio);
    else grouped.set(item.segment, [item.ratio]);
  }
  const segments: AcpCalibrationSegment[] = [];
  for (const [key, values] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (segments.length >= cfg.maxSegments) break;
    const segMedian = median(values)!;
    const segMad = medianAbsoluteDeviation(values, segMedian) ?? Number.POSITIVE_INFINITY;
    const enoughVolume = values.length >= cfg.minSegmentSampleSize;
    const stableEnough = segMad <= Math.max(mad * 1.5, mad) && segMad <= cfg.maxMedianAbsoluteDeviation;
    const applied = enoughVolume && stableEnough;
    segments.push({
      key,
      label: segmentLabel(key),
      sampleSize: values.length,
      medianRatio: round4(segMedian),
      medianAbsoluteDeviation: Number.isFinite(segMad) ? round4(segMad) : 0,
      factor: applied ? round4(clamp(segMedian, 1 - maxDev, 1 + maxDev)) : 1,
      applied,
      reason: !enoughVolume
        ? `Volum insuficient: ${values.length} observații din ${cfg.minSegmentSampleSize} necesare.`
        : !stableEnough
          ? "Segmentul este mai instabil decât setul global: se folosește factorul global."
          : `Segment calibrat pe ${values.length} observații.`,
    });
  }
  if (segments.some((s) => s.applied)) {
    notes.push(
      `${segments.filter((s) => s.applied).length} segmente au volum suficient pentru calibrare proprie.`,
    );
  } else {
    notes.push("Niciun segment nu are volum suficient: se folosește doar factorul global.");
  }

  return {
    status: "ok",
    sampleSize: valid.length,
    observationsReceived: observations.length,
    medianRatio: round4(medianRatio),
    medianAbsoluteDeviation: mad,
    biasPercent,
    factor,
    applied: true,
    confidence,
    segments,
    p25Ratio: percentile(ratios, 0.25),
    p75Ratio: percentile(ratios, 0.75),
    minSampleSize: cfg.minSampleSize,
    algorithmVersion: cfg.algorithmVersion,
    notes,
  };
}

/** Transformă un rezultat de calibrare în modelul persistabil/aplicabil. */
export function toCalibrationModel(
  result: AcpCalibrationResult,
  params: { version: number; createdAt: string },
): AcpCalibrationModel {
  return {
    version: params.version,
    status: result.status,
    factor: result.factor,
    applied: result.applied,
    medianRatio: result.medianRatio,
    medianAbsoluteDeviation: result.medianAbsoluteDeviation,
    sampleSize: result.sampleSize,
    confidence: result.confidence,
    segments: result.segments,
    algorithmVersion: result.algorithmVersion,
    createdAt: params.createdAt,
  };
}

export type AcpCalibrationSelection = {
  factor: number;
  source: "segment" | "global" | "none";
  segmentKey: string | null;
  sampleSize: number;
  confidence: number;
  reason: string;
};

/** Alege factorul aplicabil pentru o proprietate: segment dacă există, altfel global. */
export function selectCalibrationFactor(
  model: AcpCalibrationModel | null | undefined,
  subject: AcpSubject,
): AcpCalibrationSelection {
  if (!model || !model.applied || model.status !== "ok") {
    return {
      factor: 1,
      source: "none",
      segmentKey: null,
      sampleSize: model?.sampleSize ?? 0,
      confidence: model?.confidence ?? 0,
      reason: !model
        ? "Nu există o calibrare activă."
        : model.status === "insufficient_data"
          ? "Calibrarea are date insuficiente."
          : "Calibrarea existentă nu este fiabilă și nu se aplică.",
    };
  }
  const key = calibrationSegmentKey({
    city: subject.city,
    propertyType: subject.propertyType,
    rooms: subject.rooms,
  });
  const segment = key ? model.segments.find((s) => s.key === key && s.applied) : undefined;
  if (segment) {
    return {
      factor: segment.factor,
      source: "segment",
      segmentKey: segment.key,
      sampleSize: segment.sampleSize,
      confidence: model.confidence,
      reason: `Factor de segment (${segment.label}) pe ${segment.sampleSize} observații.`,
    };
  }
  return {
    factor: model.factor,
    source: "global",
    segmentKey: null,
    sampleSize: model.sampleSize,
    confidence: model.confidence,
    reason: `Factor global pe ${model.sampleSize} observații.`,
  };
}

export type AcpAdvancedEstimate = {
  /** Estimarea deterministă, nemodificată. */
  baselineValue: number | null;
  baselineMin: number | null;
  baselineMax: number | null;
  baselineRecommended: number | null;
  /** Estimarea calibrată; egală cu baseline când calibrarea nu se aplică. */
  calibratedValue: number | null;
  calibratedMin: number | null;
  calibratedMax: number | null;
  calibratedRecommended: number | null;
  factor: number;
  source: AcpCalibrationSelection["source"];
  segmentKey: string | null;
  sampleSize: number;
  calibrationVersion: number | null;
  calibrationStatus: AcpCalibrationStatus | "not_configured";
  calibrationConfidence: number;
  calibratedAt: string | null;
  applied: boolean;
  /** Diferența procentuală față de baseline. */
  deltaPercent: number | null;
  reason: string;
};

/**
 * Aplică factorul de calibrare peste estimarea deterministă, păstrând baseline-ul
 * separat. Nu modifică niciodată valorile baseline.
 */
export function applyCalibration(input: {
  baselineValue: number | null;
  baselineMin: number | null;
  baselineMax: number | null;
  baselineRecommended: number | null;
  model: AcpCalibrationModel | null | undefined;
  subject: AcpSubject;
}): AcpAdvancedEstimate {
  const selection = selectCalibrationFactor(input.model, input.subject);
  const scale = (value: number | null) =>
    value === null ? null : round2(value * selection.factor);
  const applied = selection.source !== "none" && selection.factor !== 1;

  return {
    baselineValue: input.baselineValue,
    baselineMin: input.baselineMin,
    baselineMax: input.baselineMax,
    baselineRecommended: input.baselineRecommended,
    calibratedValue: applied ? scale(input.baselineValue) : input.baselineValue,
    calibratedMin: applied ? scale(input.baselineMin) : input.baselineMin,
    calibratedMax: applied ? scale(input.baselineMax) : input.baselineMax,
    calibratedRecommended: applied
      ? scale(input.baselineRecommended)
      : input.baselineRecommended,
    factor: selection.factor,
    source: selection.source,
    segmentKey: selection.segmentKey,
    sampleSize: selection.sampleSize,
    calibrationVersion: input.model?.version ?? null,
    calibrationStatus: input.model?.status ?? "not_configured",
    calibrationConfidence: selection.confidence,
    calibratedAt: input.model?.createdAt ?? null,
    applied,
    deltaPercent: applied ? round2((selection.factor - 1) * 100) : 0,
    reason: selection.reason,
  };
}
