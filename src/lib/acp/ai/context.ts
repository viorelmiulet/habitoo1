/**
 * Contractul de intrare pentru providerul AI (ACP Stage 5).
 *
 * Funcție pură: primește exclusiv rezultatele motorului determinist și
 * snapshot-ul Market Intelligence al versiunii, apoi produce un obiect
 * restrâns, versionat, fără date private, tokenuri, chei, PII sau `raw_data`.
 * Cifrele nu sunt recalculate aici — sunt copiate exact cum le-a produs
 * motorul, iar AI-ul le primește ca date de intrare imuabile.
 *
 * Toate câmpurile de text provenite din anunțuri sunt sanitizate: sunt date,
 * nu instrucțiuni, deci markerii tipici de prompt injection sunt neutralizați.
 */
import type { AcpReportMarketInput } from "../report/model";
import type { AcpSubject } from "../scoring";

/** Numărul maxim de comparabile trimise providerului. */
export const ACP_AI_MAX_COMPARABLES = 12;

/** Versiunea contractului de intrare, salvată în auditul generării. */
export const ACP_AI_CONTEXT_VERSION = "acp-ai-context-2";

/** Lungimea maximă a unui text preluat din date (titlu, locație, sursă). */
const MAX_DATA_TEXT = 160;

const INJECTION_MARKERS =
  /(ignor(e|[ăa])[^.\n]{0,60}(instruc|prompt)|disregard[^.\n]{0,60}(instruction|prompt)|system\s*prompt|prompt\s*de\s*sistem|(^|\s)(system|assistant|developer)\s*:|<\/?(system|assistant|instructions)>)/gi;

/**
 * Sanitizează un text venit din date. Nu „corectează” conținutul: elimină doar
 * caracterele de control, formatarea care ar putea încadra instrucțiuni și
 * markerii tipici de prompt injection.
 */
export function sanitizeDataText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
    .replace(/[`{}<>]/g, " ")
    .replace(INJECTION_MARKERS, "[text ignorat]")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleaned === "") return null;
  return cleaned.length > MAX_DATA_TEXT ? `${cleaned.slice(0, MAX_DATA_TEXT).trim()}…` : cleaned;
}

/** Note interne ale motorului: curățate, dar nu trunchiate. */
export function sanitizeEngineNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned === "" ? null : cleaned;
}

export type AcpAiContextInput = {
  /** Versiunea ACP și momentul snapshot-ului — context fix pentru model. */
  acpVersion: number;
  snapshotAt?: string | null;
  target: {
    title?: string | null;
    locationLabel?: string | null;
    subject: AcpSubject;
    pricePerSqm?: number | null;
  };
  statistics: {
    minimum?: number | null;
    maximum?: number | null;
    average?: number | null;
    median?: number | null;
    p25?: number | null;
    p75?: number | null;
    averagePricePerSqm?: number | null;
    medianPricePerSqm?: number | null;
  } | null;
  estimate: {
    estimatedMin?: number | null;
    estimatedValue?: number | null;
    estimatedMax?: number | null;
    recommendedListingPrice?: number | null;
  } | null;
  confidence: {
    score?: number | null;
    level?: string | null;
    quantity?: number | null;
    quality?: number | null;
    dispersion?: number | null;
  } | null;
  comparables: {
    title?: string | null;
    sourceType: string;
    sourceName?: string | null;
    locationLabel?: string | null;
    subject: AcpSubject;
    similarityScore: number;
    components?: Record<string, number> | null;
    tier: string;
    adjustmentPercent?: number | null;
    adjustedPrice?: number | null;
    adjustedPricePerSqm?: number | null;
    isSelected: boolean;
    isOutlier: boolean;
    outlierReason?: string | null;
  }[];
  sourceStats: {
    sourceType: string;
    sourceName: string;
    itemsFound: number;
    itemsUsed: number;
    itemsExcluded: number;
  }[];
  explanation?: string[];
  /** Snapshot Market Intelligence al versiunii (Stage 4), nu piața live. */
  market?: AcpReportMarketInput | null;
};

export type AcpAiMarketContext = {
  capturedAt: string | null;
  totalMatched: number | null;
  sampleSize: number | null;
  pricePerSqm: {
    count: number | null;
    min: number | null;
    max: number | null;
    average: number | null;
    median: number | null;
    p25: number | null;
    p75: number | null;
  } | null;
  freshnessLevel: string | null;
  coverageLevel: string | null;
  sourceMix: { source: string; count: number; share: number }[];
  insufficient: boolean;
  insufficientReason: string | null;
  positioning: {
    propertyLabel: string | null;
    propertyDeltaVsMedianPercent: number | null;
    propertyPercentileRank: number | null;
    recommendedLabel: string | null;
    recommendedDeltaVsMedianPercent: number | null;
    estimateVsMarketPercent: number | null;
  } | null;
};

export type AcpAiContext = {
  contextVersion: string;
  /** Context fix: modelul nu are voie să presupună alte date sau alt moment. */
  acpVersion: number;
  snapshotAt: string | null;
  currency: string;
  target: {
    propertyType: string | null;
    transactionType: string | null;
    city: string | null;
    county: string | null;
    district: string | null;
    neighborhood: string | null;
    usableArea: number | null;
    rooms: number | null;
    floor: number | null;
    totalFloors: number | null;
    constructionYear: number | null;
    condition: string | null;
    parking: boolean | null;
    balcony: boolean | null;
    furnished: boolean | null;
    price: number | null;
    pricePerSqm: number | null;
  };
  statistics: AcpAiContextInput["statistics"];
  estimate: AcpAiContextInput["estimate"];
  confidence: {
    score: number | null;
    level: string | null;
    quantity: number | null;
    quality: number | null;
    dispersion: number | null;
  } | null;
  comparablesUsed: number;
  comparablesTotal: number;
  outliersCount: number;
  comparables: {
    label: string;
    source: string;
    location: string | null;
    similarityScore: number;
    tier: string;
    rooms: number | null;
    usableArea: number | null;
    floor: number | null;
    constructionYear: number | null;
    condition: string | null;
    price: number | null;
    pricePerSqm: number | null;
    adjustmentPercent: number | null;
    adjustedPrice: number | null;
    adjustedPricePerSqm: number | null;
    isSelected: boolean;
    isOutlier: boolean;
    outlierReason: string | null;
    scoreBreakdown: Record<string, number> | null;
  }[];
  sources: { sourceType: string; sourceName: string; itemsFound: number; itemsUsed: number; itemsExcluded: number }[];
  market: AcpAiMarketContext | null;
  engineNotes: string[];
};

function n(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function s(value: unknown): string | null {
  return sanitizeDataText(value);
}

function b(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Reduce snapshot-ul de piață la strictul necesar interpretării. */
function buildMarketContext(market: AcpReportMarketInput | null | undefined): AcpAiMarketContext | null {
  if (!market) return null;
  const aggregate = market.aggregate ?? null;
  const insights = market.insights ?? null;
  return {
    capturedAt: market.capturedAt ?? null,
    totalMatched: n(aggregate?.totalMatched),
    sampleSize: n(aggregate?.sampleSize),
    pricePerSqm: aggregate
      ? {
          count: n(aggregate.pricePerSqm?.count),
          min: n(aggregate.pricePerSqm?.min),
          max: n(aggregate.pricePerSqm?.max),
          average: n(aggregate.pricePerSqm?.average),
          median: n(aggregate.pricePerSqm?.median),
          p25: n(aggregate.pricePerSqm?.p25),
          p75: n(aggregate.pricePerSqm?.p75),
        }
      : null,
    freshnessLevel: aggregate?.freshness?.level ?? null,
    coverageLevel: aggregate?.coverage?.level ?? null,
    sourceMix: (aggregate?.sourceMix ?? []).slice(0, 8).map((entry) => ({
      source: s(entry.source) ?? entry.source,
      count: n(entry.count) ?? 0,
      share: n(entry.share) ?? 0,
    })),
    insufficient: Boolean(aggregate?.insufficient ?? true),
    insufficientReason: aggregate?.insufficientReason ?? null,
    positioning: insights
      ? {
          propertyLabel: s(insights.property?.label),
          propertyDeltaVsMedianPercent: n(insights.property?.deltaVsMedianPercent),
          propertyPercentileRank: n(insights.property?.percentileRank),
          recommendedLabel: s(insights.recommended?.label),
          recommendedDeltaVsMedianPercent: n(insights.recommended?.deltaVsMedianPercent),
          estimateVsMarketPercent: n(insights.estimateVsMarketPercent),
        }
      : null,
  };
}

/** Construiește contextul strict structurat pentru providerul AI. */
export function buildAcpAiContext(input: AcpAiContextInput): AcpAiContext {
  const t = input.target.subject ?? {};
  const currency = s(t.currency) ?? "EUR";

  const selected = input.comparables.filter((c) => c.isSelected);
  const ordered = [...selected].sort((a, b2) => b2.similarityScore - a.similarityScore);
  const outliers = input.comparables.filter((c) => c.isOutlier);
  const trimmed = [...ordered, ...outliers.filter((c) => !c.isSelected)].slice(
    0,
    ACP_AI_MAX_COMPARABLES,
  );

  return {
    contextVersion: ACP_AI_CONTEXT_VERSION,
    acpVersion: input.acpVersion,
    snapshotAt: input.snapshotAt ?? null,
    currency,
    target: {
      propertyType: s(t.propertyType),
      transactionType: s(t.transactionType),
      city: s(t.city),
      county: s(t.county),
      district: s(t.district),
      neighborhood: s(t.neighborhood),
      usableArea: n(t.usableArea),
      rooms: n(t.rooms),
      floor: n(t.floor),
      totalFloors: n(t.totalFloors),
      constructionYear: n(t.constructionYear),
      condition: s(t.condition),
      parking: b(t.parking),
      balcony: b(t.balcony),
      furnished: b(t.furnished),
      price: n(t.price),
      pricePerSqm: n(input.target.pricePerSqm) ?? n(t.pricePerSqm),
    },
    statistics: input.statistics ?? null,
    estimate: input.estimate ?? null,
    confidence: input.confidence
      ? {
          score: n(input.confidence.score),
          level: s(input.confidence.level),
          quantity: n(input.confidence.quantity),
          quality: n(input.confidence.quality),
          dispersion: n(input.confidence.dispersion),
        }
      : null,
    comparablesUsed: selected.length,
    comparablesTotal: input.comparables.length,
    outliersCount: outliers.length,
    comparables: trimmed.map((c) => ({
      label: s(c.title) ?? "Comparabil",
      source: s(c.sourceName) ?? c.sourceType,
      location: s(c.locationLabel),
      similarityScore: c.similarityScore,
      tier: c.tier,
      rooms: n(c.subject?.rooms),
      usableArea: n(c.subject?.usableArea),
      floor: n(c.subject?.floor),
      constructionYear: n(c.subject?.constructionYear),
      condition: s(c.subject?.condition),
      price: n(c.subject?.price),
      pricePerSqm: n(c.subject?.pricePerSqm),
      adjustmentPercent: n(c.adjustmentPercent),
      adjustedPrice: n(c.adjustedPrice),
      adjustedPricePerSqm: n(c.adjustedPricePerSqm),
      isSelected: c.isSelected,
      isOutlier: c.isOutlier,
      outlierReason: s(c.outlierReason),
      scoreBreakdown: c.components ?? null,
    })),
    sources: input.sourceStats.map((source) => ({
      sourceType: source.sourceType,
      sourceName: s(source.sourceName) ?? source.sourceType,
      itemsFound: n(source.itemsFound) ?? 0,
      itemsUsed: n(source.itemsUsed) ?? 0,
      itemsExcluded: n(source.itemsExcluded) ?? 0,
    })),
    market: buildMarketContext(input.market),
    engineNotes: (input.explanation ?? [])
      .slice(0, 12)
      .map((note) => sanitizeEngineNote(note))
      .filter((note): note is string => Boolean(note)),
  };
}
