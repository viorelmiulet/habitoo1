/**
 * Construirea contextului trimis providerului AI.
 *
 * Funcție pură și minimalistă: primește exclusiv rezultatele motorului
 * determinist și produce un obiect restrâns, fără date private, tokenuri,
 * chei, PII sau `raw_data`. Cifrele nu sunt recalculate aici — sunt copiate
 * exact cum le-a produs motorul, iar AI-ul le primește ca date de intrare
 * imuabile.
 */
import type { AcpSubject } from "../scoring";

/** Numărul maxim de comparabile trimise providerului. */
export const ACP_AI_MAX_COMPARABLES = 12;

export type AcpAiContextInput = {
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
  confidence: { score?: number | null; level?: string | null } | null;
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
};

export type AcpAiContext = {
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
  confidence: { score: number | null; level: string | null } | null;
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
  sources: AcpAiContextInput["sourceStats"];
  engineNotes: string[];
};

function n(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function s(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function b(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
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
      ? { score: n(input.confidence.score), level: s(input.confidence.level) }
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
    sources: input.sourceStats,
    engineNotes: (input.explanation ?? []).slice(0, 12),
  };
}
