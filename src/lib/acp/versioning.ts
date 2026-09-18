/**
 * Versionarea analizelor ACP: funcții pure pentru numerotarea versiunilor și
 * pentru compararea deterministă a două snapshot-uri.
 *
 * Nu există AI, rețea sau bază de date aici. Toate cifrele vin din snapshot-ul
 * salvat de motorul determinist; funcțiile de mai jos doar le compară.
 */

/** Sursele folosite de o versiune, cu numărătorile salvate la momentul rulării. */
export type AcpVersionSourceStat = {
  sourceType: string;
  sourceName: string;
  itemsFound: number;
  itemsUsed: number;
  itemsExcluded: number;
};

/** Comparabilul, exact cum a fost salvat în snapshot-ul versiunii. */
export type AcpVersionComparable = {
  key: string;
  title: string;
  sourceName: string;
  price: number | null;
  adjustedPrice: number | null;
  adjustedPricePerSqm: number | null;
  similarityScore: number;
  tier: string;
  adjustmentAmount: number | null;
  isOutlier: boolean;
  isSelected: boolean;
};

/** Metadate AI ale versiunii — informative, nu influențează nicio cifră. */
export type AcpVersionAi = {
  model: string | null;
  generatedAt: string | null;
  summary: string | null;
};

export type AcpVersionSnapshot = {
  id: string;
  version: number;
  /** Versiunea motorului (metodologia) care a produs cifrele. */
  engineVersion?: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  snapshotAt: string | null;
  createdByName: string | null;
  estimatedValue: number | null;
  estimatedMin: number | null;
  estimatedMax: number | null;
  recommendedListingPrice: number | null;
  medianPricePerSqm: number | null;
  averagePricePerSqm: number | null;
  confidenceScore: number | null;
  comparablesCount: number;
  comparablesUsed: number;
  currency: string | null;
  sources: AcpVersionSourceStat[];
  comparables: AcpVersionComparable[];
  ai: AcpVersionAi | null;
};

/** Rândul minim din listă (fără comparabile), folosit în „Versiuni analiză". */
export type AcpVersionListItem = Omit<AcpVersionSnapshot, "comparables">;

export type AcpNumericDiff = {
  a: number | null;
  b: number | null;
  absolute: number | null;
  /** `null` când baza este 0 sau lipsește — nu producem NaN/Infinity. */
  percent: number | null;
};

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Diferență absolută și procentuală, sigură la 0/null. */
export function numericDiff(
  aInput: number | null | undefined,
  bInput: number | null | undefined,
): AcpNumericDiff {
  const a = finite(aInput);
  const b = finite(bInput);
  if (a === null || b === null) return { a, b, absolute: null, percent: null };
  const absolute = round(b - a);
  const percent = a === 0 ? null : round((absolute / Math.abs(a)) * 100);
  return { a, b, absolute, percent };
}

/**
 * Următorul număr de versiune pentru un root. Deterministă și tolerantă la
 * găuri: `max + 1`, minimum 2 pentru o versiune derivată.
 */
export function nextVersionNumber(existingVersions: readonly number[]): number {
  let max = 1;
  for (const value of existingVersions) {
    if (Number.isFinite(value) && value > max) max = Math.trunc(value);
  }
  return max + 1;
}

export type AcpComparableChange = {
  key: string;
  title: string;
  sourceName: string;
  price: AcpNumericDiff;
  adjustedPrice: AcpNumericDiff;
  adjustedPricePerSqm: AcpNumericDiff;
  similarityScore: AcpNumericDiff;
  adjustmentAmount: AcpNumericDiff;
  tierFrom: string;
  tierTo: string;
  outlierFrom: boolean;
  outlierTo: boolean;
  selectedFrom: boolean;
  selectedTo: boolean;
  /** Etichete scurte pentru UI: doar modificările reale. */
  changes: string[];
};

export type AcpSourceComparison = {
  sourceType: string;
  sourceName: string;
  itemsFound: AcpNumericDiff;
  itemsUsed: AcpNumericDiff;
  itemsExcluded: AcpNumericDiff;
  presentInA: boolean;
  presentInB: boolean;
};

export type AcpVersionComparison = {
  versionA: AcpVersionListItem;
  versionB: AcpVersionListItem;
  estimatedValue: AcpNumericDiff;
  estimatedMin: AcpNumericDiff;
  estimatedMax: AcpNumericDiff;
  recommendedListingPrice: AcpNumericDiff;
  medianPricePerSqm: AcpNumericDiff;
  averagePricePerSqm: AcpNumericDiff;
  confidenceScore: AcpNumericDiff;
  comparablesCount: AcpNumericDiff;
  comparablesUsed: AcpNumericDiff;
  sources: AcpSourceComparison[];
  comparables: {
    common: AcpComparableChange[];
    added: AcpVersionComparable[];
    removed: AcpVersionComparable[];
  };
};

function stripComparables(snapshot: AcpVersionSnapshot): AcpVersionListItem {
  const { comparables: _comparables, ...rest } = snapshot;
  return rest;
}

function changeLabels(a: AcpVersionComparable, b: AcpVersionComparable): string[] {
  const labels: string[] = [];
  if (finite(a.price) !== finite(b.price)) labels.push("preț");
  if (finite(a.adjustedPrice) !== finite(b.adjustedPrice)) labels.push("preț ajustat");
  if (finite(a.adjustedPricePerSqm) !== finite(b.adjustedPricePerSqm)) labels.push("€/mp");
  if (a.similarityScore !== b.similarityScore) labels.push("similaritate");
  if (finite(a.adjustmentAmount) !== finite(b.adjustmentAmount)) labels.push("ajustări");
  if (a.tier !== b.tier) labels.push("categorie");
  if (a.isOutlier !== b.isOutlier) labels.push("atipic");
  if (a.isSelected !== b.isSelected) labels.push("folosit în calcul");
  return labels;
}

/** Compară două versiuni. Determinist: sortare stabilă, fără AI, fără cifre noi. */
export function compareAcpVersionSnapshots(
  a: AcpVersionSnapshot,
  b: AcpVersionSnapshot,
): AcpVersionComparison {
  const byKeyA = new Map(a.comparables.map((c) => [c.key, c]));
  const byKeyB = new Map(b.comparables.map((c) => [c.key, c]));

  const common: AcpComparableChange[] = [];
  for (const [key, itemA] of byKeyA) {
    const itemB = byKeyB.get(key);
    if (!itemB) continue;
    common.push({
      key,
      title: itemB.title || itemA.title,
      sourceName: itemB.sourceName || itemA.sourceName,
      price: numericDiff(itemA.price, itemB.price),
      adjustedPrice: numericDiff(itemA.adjustedPrice, itemB.adjustedPrice),
      adjustedPricePerSqm: numericDiff(itemA.adjustedPricePerSqm, itemB.adjustedPricePerSqm),
      similarityScore: numericDiff(itemA.similarityScore, itemB.similarityScore),
      adjustmentAmount: numericDiff(itemA.adjustmentAmount, itemB.adjustmentAmount),
      tierFrom: itemA.tier,
      tierTo: itemB.tier,
      outlierFrom: itemA.isOutlier,
      outlierTo: itemB.isOutlier,
      selectedFrom: itemA.isSelected,
      selectedTo: itemB.isSelected,
      changes: changeLabels(itemA, itemB),
    });
  }
  common.sort((x, y) => y.similarityScore.b! - x.similarityScore.b! || x.key.localeCompare(y.key));

  const added = b.comparables
    .filter((c) => !byKeyA.has(c.key))
    .sort((x, y) => y.similarityScore - x.similarityScore || x.key.localeCompare(y.key));
  const removed = a.comparables
    .filter((c) => !byKeyB.has(c.key))
    .sort((x, y) => y.similarityScore - x.similarityScore || x.key.localeCompare(y.key));

  const sourceKeys: string[] = [];
  const sourcesA = new Map<string, AcpVersionSourceStat>();
  const sourcesB = new Map<string, AcpVersionSourceStat>();
  for (const s of a.sources) {
    const key = `${s.sourceType}|${s.sourceName}`;
    sourcesA.set(key, s);
    if (!sourceKeys.includes(key)) sourceKeys.push(key);
  }
  for (const s of b.sources) {
    const key = `${s.sourceType}|${s.sourceName}`;
    sourcesB.set(key, s);
    if (!sourceKeys.includes(key)) sourceKeys.push(key);
  }

  const sources: AcpSourceComparison[] = sourceKeys.map((key) => {
    const sa = sourcesA.get(key);
    const sb = sourcesB.get(key);
    const reference = sb ?? sa!;
    return {
      sourceType: reference.sourceType,
      sourceName: reference.sourceName,
      itemsFound: numericDiff(sa?.itemsFound ?? null, sb?.itemsFound ?? null),
      itemsUsed: numericDiff(sa?.itemsUsed ?? null, sb?.itemsUsed ?? null),
      itemsExcluded: numericDiff(sa?.itemsExcluded ?? null, sb?.itemsExcluded ?? null),
      presentInA: Boolean(sa),
      presentInB: Boolean(sb),
    };
  });

  return {
    versionA: stripComparables(a),
    versionB: stripComparables(b),
    estimatedValue: numericDiff(a.estimatedValue, b.estimatedValue),
    estimatedMin: numericDiff(a.estimatedMin, b.estimatedMin),
    estimatedMax: numericDiff(a.estimatedMax, b.estimatedMax),
    recommendedListingPrice: numericDiff(
      a.recommendedListingPrice,
      b.recommendedListingPrice,
    ),
    medianPricePerSqm: numericDiff(a.medianPricePerSqm, b.medianPricePerSqm),
    averagePricePerSqm: numericDiff(a.averagePricePerSqm, b.averagePricePerSqm),
    confidenceScore: numericDiff(a.confidenceScore, b.confidenceScore),
    comparablesCount: numericDiff(a.comparablesCount, b.comparablesCount),
    comparablesUsed: numericDiff(a.comparablesUsed, b.comparablesUsed),
    sources,
    comparables: { common, added, removed },
  };
}
