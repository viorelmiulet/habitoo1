/**
 * Modelul raportului ACP — funcții PURE, fără bază de date, rețea sau AI.
 *
 * Raportul se construiește exclusiv din snapshot-ul unei versiuni ACP
 * (rândul `acp_analyses` + `acp_comparables` + `acp_analysis_sources` ale
 * acelei versiuni). Nu se citește niciodată `market_listings` curent, deci un
 * raport istoric rămâne identic chiar dacă piața se schimbă ulterior.
 */
import { acpSourceOutcomeLabel } from "../source-outcome";
import type { AcpAiInsight } from "../ai/schema";
import { ACP_ADJUSTMENT_LABELS } from "../adjustments";
import { snapshotGeo, type GeoPoint } from "./map";
import type { AcpReportDemand } from "./demand";

export type AcpReportSubject = {
  bathrooms?: number | null;
  rooms?: number | null;
  usableArea?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  constructionYear?: number | null;
  condition?: string | null;
  balcony?: boolean | null;
  parking?: boolean | null;
  furnished?: boolean | null;
  propertyType?: string | null;
  transactionKind?: string | null;
  price?: number | null;
  currency?: string | null;
  /** Coordonatele salvate în snapshot; nu sunt geocodate. */
  latitude?: number | null;
  longitude?: number | null;
};

export type AcpReportAdjustment = {
  label: string;
  basis: string;
  amount: number;
  /** Factorul motorului (area, rooms…), când e salvat. */
  factor?: string | null;
};

export type AcpReportComparableInput = {
  key: string;
  title: string;
  sourceType: string;
  sourceName: string;
  locationLabel?: string | null;
  price: number | null;
  adjustedPrice: number | null;
  adjustedPricePerSqm: number | null;
  similarityScore: number | null;
  tier: string | null;
  adjustmentAmount: number | null;
  adjustmentPercent: number | null;
  adjustments: AcpReportAdjustment[];
  isOutlier: boolean;
  outlierReason?: string | null;
  isSelected: boolean;
  manualOverride?: string | null;
  subject: AcpReportSubject;
  /** Motor v2: aducerea prețului la trimestrul analizei. Absent la versiunile v1. */
  timeAdjustment?: AcpReportTimeAdjustmentInput | null;
  /** Raport v2: date de afișare din snapshot (sau completate pentru versiunile vechi). */
  reference?: string | null;
  status?: "active" | "inactive" | null;
  firstSeenAt?: string | null;
  disappearedAt?: string | null;
  daysOnMarket?: number | null;
  photos?: string[];
  description?: string | null;
};

/** Ajustarea în timp a unui comparabil, așa cum a fost salvată în snapshot. */
export type AcpReportTimeAdjustmentInput = {
  applied: boolean;
  reason: string;
  originalPrice: number | null;
  comparableQuarter: string | null;
  usedQuarter: string | null;
  ratio: number | null;
  adjustedPrice: number | null;
  clamped?: boolean;
};

/** Nota de nivel analiză despre indicele folosit la ajustarea în timp. */
export type AcpReportTimeAdjustmentSummaryInput = {
  applied: boolean;
  note: string;
  analysisQuarter: string;
  clampedTo: string | null;
  appliedCount: number;
  skippedCount: number;
  index: {
    source: string;
    dataset: string;
    series: string;
    unit: string;
    baseLabel: string;
    region: string;
    newestQuarter: string | null;
  } | null;
};

export type AcpReportSourceInput = {
  sourceType: string;
  sourceName: string;
  itemsFound: number;
  itemsUsed: number;
  itemsExcluded: number;
  /** Doar pentru sursele interogate live: cum a răspuns sursa. */
  outcome?: string | null;
  outcomeDetail?: string | null;
};

export type AcpReportVersionInput = {
  analysisId: string;
  rootAnalysisId: string;
  title: string;
  status: string;
  errorMessage: string | null;
  version: number;
  createdAt: string;
  snapshotAt: string | null;
  authorName: string | null;
  currency: string | null;
  target: {
    title: string;
    reference: string | null;
    locationLabel: string | null;
    capturedAt: string | null;
    pricePerSqm: number | null;
    subject: AcpReportSubject;
    /** Raport v2: pozele proprietății analizate (URL-uri semnate). */
    photos?: string[];
    description?: string | null;
  };
  estimate: {
    estimatedMin: number | null;
    estimatedValue: number | null;
    estimatedMax: number | null;
    recommendedListingPrice: number | null;
  } | null;
  statistics: {
    medianPricePerSqm: number | null;
    averagePricePerSqm: number | null;
    median: number | null;
    average: number | null;
    minimum: number | null;
    maximum: number | null;
    p25: number | null;
    p75: number | null;
  } | null;
  confidence: {
    score: number | null;
    quantity?: number | null;
    quality?: number | null;
    dispersion?: number | null;
  } | null;
  explanation: string[];
  comparables: AcpReportComparableInput[];
  sources: AcpReportSourceInput[];
  ai: {
    summary: string | null;
    model: string | null;
    generatedAt: string | null;
    /** Secțiunile structurate (Stage 5), dacă există o interpretare validă. */
    sections?: AcpAiInsight | null;
  } | null;
  /**
   * Snapshot Market Intelligence (Stage 4) salvat la rularea versiunii.
   * Raportul folosește aceste cifre, nu piața live de la momentul generării.
   */
  market?: AcpReportMarketInput | null;
  /**
   * Calitatea datelor și calibrarea (Stage 7), din snapshot-ul versiunii.
   * Absent pentru versiunile calculate înainte de introducerea lor.
   */
  precision?: AcpReportPrecisionInput | null;
  /** Motor v2: ajustarea în timp la nivel de analiză. Absentă la versiunile v1. */
  timeAdjustment?: AcpReportTimeAdjustmentSummaryInput | null;
  /** Versiunea motorului cu care a fost calculată versiunea analizei. */
  engineVersion?: number | null;
};

export type AcpReportPrecisionInput = {
  quality: {
    score: number;
    level: string;
    factors: { label: string; score: number; note: string }[];
    reasons: string[];
  } | null;
  calibration: {
    applied: boolean;
    status: string;
    factor: number;
    source: string;
    segmentKey: string | null;
    sampleSize: number;
    version: number | null;
    calibratedAt: string | null;
    baselineValue: number | null;
    calibratedValue: number | null;
    deltaPercent: number | null;
    reason: string;
  } | null;
};

export type AcpReportMarketInput = {
  capturedAt: string | null;
  aggregate: {
    totalMatched: number;
    sampleSize: number;
    pricePerSqm: {
      count: number;
      min: number | null;
      max: number | null;
      average: number | null;
      median: number | null;
      p25: number | null;
      p75: number | null;
    };
    freshness: { lastSeenAt: string | null; lastSyncAt: string | null; level: string };
    coverage: { level: string; completeness: number | null };
    sourceMix: { source: string; count: number; share: number }[];
    insufficient: boolean;
    insufficientReason: string | null;
  } | null;
  insights: {
    property: { label: string; deltaVsMedianPercent: number | null; percentileRank: number | null };
    recommended: { label: string; deltaVsMedianPercent: number | null };
    estimateVsMarketPercent: number | null;
  } | null;
};




export type AcpReportAgency = {
  name: string;
  legalName?: string | null;
  cui?: string | null;
  registry?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
};

export type AcpReportModel = {
  /** Versiunea formatului de raport — apare în subsol. */
  formatVersion: string;
  reportNumber: number;
  title: string;
  agency: AcpReportAgency;
  analysisId: string;
  rootAnalysisId: string;
  analysisVersion: number;
  analysisTitle: string;
  authorName: string | null;
  generatedAt: string;
  snapshotAt: string | null;
  statusLabel: string;
  confidenceLabel: string;
  currency: string;
  property: {
    title: string;
    reference: string | null;
    locationLabel: string | null;
    capturedAt: string | null;
    rows: { label: string; value: string }[];
  };
  summary: { label: string; value: string; hint?: string }[];
  counts: { found: number; used: number; excluded: number };
  methodology: string[];
  comparables: {
    key: string;
    title: string;
    sourceName: string;
    locationLabel: string | null;
    price: string;
    adjustedPrice: string;
    adjustedPricePerSqm: string;
    similarity: string;
    tier: string;
    adjustment: string;
    flags: string;
    used: boolean;
    outlier: boolean;
    adjustments: { label: string; basis: string; amount: string }[];
    /** Ajustarea în timp, formatată: preț original, trimestru, raport, preț ajustat. */
    timeAdjustment: {
      applied: boolean;
      reason: string;
      originalPrice: string;
      comparableQuarter: string;
      usedQuarter: string;
      ratio: string;
      adjustedPrice: string;
    } | null;
  }[];
  statistics: { label: string; value: string }[];
  sources: {
    name: string;
    type: string;
    found: number;
    used: number;
    excluded: number;
    /** Starea sursei interogate live, în română, sau `null`. */
    outcomeLabel: string | null;
    outcomeDetail: string | null;
  }[];
  warnings: string[];
  ai: {
    summary: string;
    model: string | null;
    generatedAt: string | null;
    sections: { title: string; body: string }[];
    bullets: { title: string; items: string[] }[];
  } | null;
  /** Piața la momentul analizei — din snapshot-ul versiunii, nu din date live. */
  market: {
    capturedAt: string | null;
    rows: { label: string; value: string }[];
    note: string | null;
  } | null;
  /** Calibrare și calitatea datelor (Stage 7); null pentru versiunile fără aceste date. */
  precision: {
    rows: { label: string; value: string }[];
    notes: string[];
  } | null;
  /** Ajustarea în timp cu indicele național; null pentru versiunile motorului v1. */
  timeAdjustment: {
    note: string;
    rows: { label: string; value: string }[];
  } | null;
  /** Versiunea motorului determinist folosit la calcul. */
  engineVersion: number;
  /** Raport v2: secțiunile tehnice apar doar dacă agentul a bifat anexa. */
  includeAppendix: boolean;
  /** Cererile active la data raportului (nu fac parte din snapshot-ul analizei). */
  demand: AcpReportDemand | null;
  cover: AcpReportCover;
  /** Comparabilele folosite în calcul, numerotate #1..#n. */
  used: AcpReportUsedComparable[];
  subjectSheet: AcpReportSheet;
  locationMap: AcpReportLocationMap | null;
  /** Tabelul de comparație, câte 4 comparabile pe pagină. */
  comparisonPages: AcpReportComparisonPage[];
  priceChart: AcpReportPriceChart | null;
  valuation: {
    cards: { label: string; value: string; highlight: boolean }[];
    listingNote: string | null;
  };
  recommendations: {
    note: string;
    groups: { title: string; body?: string; items?: string[] }[];
  } | null;
  legalNotice: string;
};

export type AcpReportCover = {
  dateLabel: string;
  title: string;
  photo: string | null;
  propertyTitle: string;
  address: string | null;
  disclaimer: string;
  agentName: string | null;
  agentRole: string | null;
  agencyName: string;
};

export type AcpReportSheet = {
  label: string;
  title: string;
  reference: string | null;
  photos: string[];
  statusLabel: string | null;
  active: boolean;
  price: string;
  characteristics: { label: string; value: string }[];
  description: string | null;
  adjustments: { label: string; basis: string; amount: string }[];
  finalAdjustedPrice: string | null;
  /** Coordonatele din snapshot pentru mini-hartă; null → fără mini-hartă. */
  geo: GeoPoint | null;
};

/** Pagina „Localizarea comparabilelor”; null când niciun punct nu are coordonate. */
export type AcpReportLocationMap = {
  subject: GeoPoint | null;
  comparables: (GeoPoint & { index: number })[];
  usedCount: number;
  missing: number;
};

export type AcpReportUsedComparable = {
  index: number;
  key: string;
  reference: string;
  address: string;
  active: boolean;
  statusLabel: string;
  daysOnMarket: string;
  firstSeen: string;
  disappeared: string;
  price: string;
  adjustmentTotal: string;
  adjustedPrice: string;
  photo: string | null;
  sheet: AcpReportSheet;
};

export type AcpReportComparisonCell = { value: string; adjustment: string | null };
export type AcpReportComparisonPage = {
  /** Indicii (#n) comparabilelor de pe pagină. */
  columns: number[];
  headers: { label: string; photo: string | null }[];
  top: { label: string; cells: AcpReportComparisonCell[] }[];
  features: { label: string; cells: AcpReportComparisonCell[] }[];
  adjusted: string[];
};

export type AcpReportPriceChart = {
  bars: { label: string; value: number; display: string }[];
  recommended: { value: number; display: string } | null;
  band: { min: number; max: number; display: string } | null;
};

export const ACP_REPORT_FORMAT_VERSION = "2.0";
export const ACP_REPORT_COMPARABLES_PER_PAGE = 4;

export const ACP_REPORT_COVER_DISCLAIMER =
  "Raport generat în Habitoo CRM prin metoda comparației directe, pe baza datelor disponibile la data analizei. Exprimă opinia agentului imobiliar și nu constituie o evaluare autorizată ANEVAR, o expertiză judiciară sau o consultanță juridică ori financiară.";

export const ACP_REPORT_LEGAL_NOTICE =
  "Prezentul raport este o estimare orientativă de piață, realizată în Habitoo CRM prin metoda comparației directe pe baza datelor disponibile la data analizei, și exprimă opinia agentului imobiliar. Nu constituie o evaluare autorizată ANEVAR, o expertiză judiciară sau o consultanță juridică ori financiară. Prețul de tranzacționare efectiv poate diferi în funcție de negociere, starea reală a imobilului și evoluția pieței.";

const TIER_LABELS: Record<string, string> = {
  direct: "Comparabil direct",
  secondary: "Comparabil secundar",
  reference: "Referință",
  excluded: "Exclus",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Ciornă",
  running: "În calcul",
  completed: "Finalizată",
  archived: "Arhivată",
};

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Formatare monetară deterministă (fără NaN/Infinity, fără dependențe de locale). */
export function reportMoney(value: number | null | undefined, currency: string): string {
  const amount = finite(value);
  if (amount === null) return "—";
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const symbol = currency === "EUR" ? "€" : currency === "RON" ? "lei" : currency;
  return `${sign}${grouped} ${symbol}`;
}

export function reportNumberValue(value: number | null | undefined, suffix = ""): string {
  const n = finite(value);
  if (n === null) return "—";
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}${suffix}`;
}

export function reportDate(value: string | null | undefined, withTime = true): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
  return withTime ? `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}` : day;
}

/** O versiune poate produce un raport final doar dacă motorul a dat un rezultat. */
export function reportEligibility(version: {
  status: string;
  errorMessage: string | null;
  estimate: { estimatedValue: number | null } | null;
  comparables: { isSelected: boolean }[];
}): { ok: boolean; reason: string | null } {
  if (version.status === "running") {
    return { ok: false, reason: "Analiza este încă în calcul. Așteaptă finalizarea." };
  }
  if (finite(version.estimate?.estimatedValue ?? null) === null) {
    return {
      ok: false,
      reason:
        version.errorMessage ??
        "Versiunea nu are un rezultat valid al motorului ACP — nu se poate genera un raport final.",
    };
  }
  if (version.comparables.filter((c) => c.isSelected).length === 0) {
    return {
      ok: false,
      reason: "Versiunea nu are comparabile folosite în calcul — datele sunt insuficiente.",
    };
  }
  return { ok: true, reason: null };
}

/** Verifică izolarea pe agenție înainte de orice operațiune cu rapoarte. */
export function assertReportOrganization(
  rowOrganizationId: string | null | undefined,
  actorOrganizationId: string,
): void {
  if (!rowOrganizationId || rowOrganizationId !== actorOrganizationId) {
    throw new Error("Analiza nu a fost găsită în agenția ta.");
  }
}

export const ACP_REPORT_METHODOLOGY: string[] = [
  "Analiza pornește de la caracteristicile proprietății evaluate, salvate ca snapshot la momentul rulării.",
  "Candidații provin exclusiv din sursele selectate de agenție: proprietăți proprii, colaborări între agenții și oferte de piață importate în mod autorizat.",
  "Fiecare candidat primește un scor de similaritate 0–100, calculat determinist pe criterii ponderate (zonă, suprafață, camere, distanță, etaj, an, stare, dotări).",
  "Prețurile comparabilelor sunt ajustate pentru diferențele față de proprietatea evaluată; fiecare ajustare este listată separat, cu baza de calcul.",
  "Valorile atipice sunt identificate statistic (interval intercuartilic) și marcate; ele nu intră în estimarea finală.",
  "Estimarea, intervalul și prețul recomandat de listare rezultă din prețurile ajustate ale comparabilelor folosite. Nu intervine nicio estimare generată automat de inteligență artificială.",
  "Scorul de încredere reflectă cantitatea, calitatea și dispersia datelor disponibile la momentul analizei.",
];

/**
 * Construiește modelul complet al raportului. Determinist: aceleași date de
 * intrare produc întotdeauna același model.
 */
export function buildAcpReportModel(params: {
  version: AcpReportVersionInput;
  agency: AcpReportAgency;
  reportNumber: number;
  generatedAt: string;
  includeAppendix?: boolean;
  demand?: AcpReportDemand | null;
  generatedBy?: { name: string | null; role: string | null } | null;
}): AcpReportModel {
  const { version, agency, reportNumber, generatedAt } = params;
  const currency = version.currency || version.target.subject.currency || "EUR";
  const s = version.target.subject;

  const used = version.comparables.filter((c) => c.isSelected);
  const found = version.sources.reduce((sum, src) => sum + (finite(src.itemsFound) ?? 0), 0);
  const totalFound = found > 0 ? found : version.comparables.length;
  const excluded = Math.max(0, totalFound - used.length);

  const warnings: string[] = [];
  const eligibility = reportEligibility(version);
  if (!eligibility.ok && eligibility.reason) warnings.push(eligibility.reason);
  if (used.length > 0 && used.length < 3) {
    warnings.push(
      used.length === 1
        ? "Estimarea se bazează pe un singur comparabil folosit; interpretează rezultatul cu prudență."
        : `Estimarea se bazează pe doar ${used.length} comparabile folosite; interpretează rezultatul cu prudență.`,
    );
  }
  if (version.comparables.some((c) => c.isOutlier)) {
    warnings.push(
      "Unele oferte au fost marcate ca atipice și excluse din calcul; ele apar separat în tabelul comparabilelor.",
    );
  }
  const confidenceScore = finite(version.confidence?.score ?? null);
  if (confidenceScore !== null && confidenceScore < 60) {
    warnings.push(
      "Scorul de încredere este redus: datele de piață disponibile sunt limitate sau dispersate.",
    );
  }
  if (version.errorMessage) warnings.push(version.errorMessage);

  return {
    formatVersion: ACP_REPORT_FORMAT_VERSION,
    reportNumber,
    title: "Analiză Comparativă de Piață",
    agency,
    analysisId: version.analysisId,
    rootAnalysisId: version.rootAnalysisId,
    analysisVersion: version.version,
    analysisTitle: version.title,
    authorName: version.authorName,
    generatedAt,
    snapshotAt: version.snapshotAt,
    statusLabel: STATUS_LABELS[version.status] ?? version.status,
    confidenceLabel: confidenceScore === null ? "—" : `${Math.round(confidenceScore)}/100`,
    currency,
    property: {
      title: version.target.title,
      reference: version.target.reference,
      locationLabel: version.target.locationLabel,
      capturedAt: version.target.capturedAt,
      rows: [
        { label: "Tip proprietate", value: s.propertyType || "—" },
        { label: "Tip tranzacție", value: s.transactionKind || "—" },
        { label: "Camere", value: reportNumberValue(s.rooms ?? null) },
        { label: "Suprafață utilă", value: reportNumberValue(s.usableArea ?? null, " mp") },
        { label: "Etaj", value: s.floor === null || s.floor === undefined ? "—" : String(s.floor) },
        {
          label: "An construcție",
          value: s.constructionYear ? String(s.constructionYear) : "—",
        },
        { label: "Stare", value: s.condition || "—" },
        { label: "Preț actual", value: reportMoney(s.price ?? null, currency) },
        {
          label: "Preț / mp actual",
          value:
            finite(version.target.pricePerSqm) === null
              ? "—"
              : `${reportMoney(version.target.pricePerSqm, currency)}/mp`,
        },
      ],
    },
    summary: [
      {
        label: "Valoare minimă estimată",
        value: reportMoney(version.estimate?.estimatedMin ?? null, currency),
      },
      {
        label: "Valoare estimată",
        value: reportMoney(version.estimate?.estimatedValue ?? null, currency),
        hint: "rezultatul motorului ACP",
      },
      {
        label: "Valoare maximă estimată",
        value: reportMoney(version.estimate?.estimatedMax ?? null, currency),
      },
      {
        label: "Preț recomandat de listare",
        value: reportMoney(version.estimate?.recommendedListingPrice ?? null, currency),
        hint: "include marja de negociere",
      },
      {
        label: "Mediană € / mp",
        value:
          finite(version.statistics?.medianPricePerSqm ?? null) === null
            ? "—"
            : `${reportMoney(version.statistics?.medianPricePerSqm ?? null, currency)}/mp`,
      },
      {
        label: "Medie € / mp",
        value:
          finite(version.statistics?.averagePricePerSqm ?? null) === null
            ? "—"
            : `${reportMoney(version.statistics?.averagePricePerSqm ?? null, currency)}/mp`,
      },
    ],
    counts: { found: totalFound, used: used.length, excluded },
    methodology: ACP_REPORT_METHODOLOGY,
    comparables: [...version.comparables]
      .sort(
        (a, b) =>
          (finite(b.similarityScore) ?? 0) - (finite(a.similarityScore) ?? 0) ||
          a.key.localeCompare(b.key),
      )
      .map((c) => ({
        key: c.key,
        title: c.title,
        sourceName: c.sourceName,
        locationLabel: c.locationLabel ?? null,
        price: reportMoney(c.price, c.subject.currency || currency),
        adjustedPrice: reportMoney(c.adjustedPrice, c.subject.currency || currency),
        adjustedPricePerSqm:
          finite(c.adjustedPricePerSqm) === null
            ? "—"
            : `${reportMoney(c.adjustedPricePerSqm, c.subject.currency || currency)}/mp`,
        similarity: finite(c.similarityScore) === null ? "—" : `${Math.round(c.similarityScore!)}`,
        tier: TIER_LABELS[c.tier ?? ""] ?? c.tier ?? "—",
        adjustment:
          finite(c.adjustmentAmount) === null
            ? "—"
            : `${c.adjustmentAmount! >= 0 ? "+" : ""}${reportMoney(c.adjustmentAmount, c.subject.currency || currency)}${
                finite(c.adjustmentPercent) === null ? "" : ` (${reportNumberValue(c.adjustmentPercent, "%")})`
              }`,
        flags: [
          c.isSelected ? "folosit" : "neinclus",
          c.isOutlier ? "atipic" : null,
          c.manualOverride === "include"
            ? "inclus manual"
            : c.manualOverride === "exclude"
              ? "exclus manual"
              : null,
        ]
          .filter(Boolean)
          .join(", "),
        used: c.isSelected,
        outlier: c.isOutlier,
        adjustments: c.adjustments.map((a) => ({
          label: a.label,
          basis: a.basis,
          amount: `${a.amount >= 0 ? "+" : ""}${reportMoney(a.amount, c.subject.currency || currency)}`,
        })),
        timeAdjustment: c.timeAdjustment
          ? {
              applied: c.timeAdjustment.applied,
              reason: c.timeAdjustment.reason,
              originalPrice: reportMoney(
                c.timeAdjustment.originalPrice,
                c.subject.currency || currency,
              ),
              comparableQuarter: c.timeAdjustment.comparableQuarter ?? "—",
              usedQuarter: c.timeAdjustment.usedQuarter ?? "—",
              ratio: reportNumberValue(c.timeAdjustment.ratio),
              adjustedPrice: reportMoney(
                c.timeAdjustment.adjustedPrice,
                c.subject.currency || currency,
              ),
            }
          : null,
      })),
    statistics: [
      { label: "Preț minim comparabile", value: reportMoney(version.statistics?.minimum ?? null, currency) },
      { label: "Cuartila 25%", value: reportMoney(version.statistics?.p25 ?? null, currency) },
      { label: "Mediană preț", value: reportMoney(version.statistics?.median ?? null, currency) },
      { label: "Medie preț", value: reportMoney(version.statistics?.average ?? null, currency) },
      { label: "Cuartila 75%", value: reportMoney(version.statistics?.p75 ?? null, currency) },
      { label: "Preț maxim comparabile", value: reportMoney(version.statistics?.maximum ?? null, currency) },
      {
        label: "Încredere — cantitate / calitate / dispersie",
        value: [
          reportNumberValue(version.confidence?.quantity ?? null),
          reportNumberValue(version.confidence?.quality ?? null),
          reportNumberValue(version.confidence?.dispersion ?? null),
        ].join(" / "),
      },
    ],
    sources: version.sources.map((src) => ({
      name: src.sourceName,
      type: src.sourceType,
      found: finite(src.itemsFound) ?? 0,
      used: finite(src.itemsUsed) ?? 0,
      excluded: finite(src.itemsExcluded) ?? 0,
      outcomeLabel: acpSourceOutcomeLabel(src.outcome ?? null),
      outcomeDetail: src.outcomeDetail ?? null,
    })),
    warnings,
    ai: buildAiSection(version.ai ?? null),
    market: buildMarketSection(version.market ?? null, currency),
    precision: buildPrecisionSection(version.precision ?? null, currency),
    timeAdjustment: buildTimeAdjustmentSection(version.timeAdjustment ?? null),
    engineVersion: finite(version.engineVersion ?? null) ?? 1,
    ...buildV2Sections(version, agency, currency, generatedAt, params.generatedBy ?? null),
    includeAppendix: params.includeAppendix === true,
    demand: params.demand ?? null,
    legalNotice: ACP_REPORT_LEGAL_NOTICE,
  };
}

/**
 * Secțiunea „Ajustarea în timp” a raportului. Indicele este NAȚIONAL și acest
 * lucru este spus explicit acolo unde ajustarea este arătată.
 */
function buildTimeAdjustmentSection(
  summary: AcpReportTimeAdjustmentSummaryInput | null,
): AcpReportModel["timeAdjustment"] {
  if (!summary) return null;
  const rows: { label: string; value: string }[] = [
    { label: "Trimestrul analizei", value: summary.analysisQuarter },
  ];
  if (summary.index) {
    rows.push(
      { label: "Indice", value: `${summary.index.series} · ${summary.index.unit}` },
      { label: "Sursa indicelui", value: `${summary.index.source} (${summary.index.dataset})` },
      { label: "Baza indicelui", value: summary.index.baseLabel },
      { label: "Acoperire teritorială", value: `${summary.index.region} — indice național` },
      { label: "Ultimul trimestru publicat", value: summary.index.newestQuarter ?? "—" },
    );
  }
  if (summary.clampedTo) {
    rows.push({ label: "Ajustarea se oprește la", value: summary.clampedTo });
  }
  rows.push({
    label: "Comparabile ajustate / neajustate",
    value: `${summary.appliedCount} / ${summary.skippedCount}`,
  });
  return { note: summary.note, rows };
}


const QUALITY_LEVEL_LABELS: Record<string, string> = {
  high: "Calitate ridicată a datelor",
  medium: "Calitate medie a datelor",
  low: "Calitate scăzută a datelor",
};

const CALIBRATION_STATUS_LABELS: Record<string, string> = {
  ok: "Calibrare validă",
  insufficient_data: "Date insuficiente pentru calibrare",
  unreliable: "Calibrare nefiabilă — nu se aplică",
  not_configured: "Fără calibrare activă",
};

/**
 * Secțiunea „Calibrare și calitatea datelor”: apare doar dacă versiunea are
 * aceste informații în snapshot. Valoarea deterministă rămâne mereu afișată
 * separat de cea calibrată.
 */
function buildPrecisionSection(
  precision: AcpReportPrecisionInput | null,
  currency: string,
): AcpReportModel["precision"] {
  if (!precision || (!precision.quality && !precision.calibration)) return null;
  const rows: { label: string; value: string }[] = [];
  const notes: string[] = [];

  if (precision.quality) {
    rows.push({
      label: "Calitatea datelor",
      value: `${Math.round(precision.quality.score)}/100 — ${
        QUALITY_LEVEL_LABELS[precision.quality.level] ?? precision.quality.level
      }`,
    });
    for (const factor of precision.quality.factors) {
      rows.push({ label: factor.label, value: `${Math.round(factor.score)}/100` });
    }
    notes.push(...precision.quality.reasons);
  }

  const c = precision.calibration;
  if (c) {
    rows.push({
      label: "Stare calibrare",
      value: CALIBRATION_STATUS_LABELS[c.status] ?? c.status,
    });
    rows.push({
      label: "Valoare estimată deterministă",
      value: reportMoney(c.baselineValue, currency),
    });
    rows.push({
      label: "Valoare după calibrare",
      value: c.applied ? reportMoney(c.calibratedValue, currency) : "identică cu cea deterministă",
    });
    if (c.applied) {
      rows.push({ label: "Factor de calibrare", value: `× ${c.factor}` });
      rows.push({
        label: "Observații reale folosite",
        value: `${c.sampleSize}${c.version !== null ? ` (calibrare v${c.version})` : ""}`,
      });
      notes.push(c.reason);
    } else {
      notes.push(
        "Calibrarea nu s-a aplicat: estimarea din acest raport este strict cea deterministă.",
      );
    }
  }

  return { rows, notes };
}

/**
 * Secțiunea „Interpretare AI”: opțională, exclusiv text generat, fără nicio
 * cifră proprie. Lipsa ei nu afectează restul raportului.
 */
function buildAiSection(ai: AcpReportVersionInput["ai"]): AcpReportModel["ai"] {
  if (!ai) return null;
  const insight = ai.sections ?? null;
  const summary = (insight?.executive_summary ?? ai.summary ?? "").trim();
  if (summary === "") return null;
  const sections = insight
    ? [
        { title: "Explicația evaluării", body: insight.valuation_explanation },
        { title: "Contextul pieței", body: insight.market_context },
        { title: "Analiza comparabilelor", body: insight.comparable_analysis },
        { title: "Poziționare recomandată", body: insight.recommended_positioning },
        { title: "Explicația scorului de încredere", body: insight.confidence_explanation },
        { title: "Pe scurt, pentru client", body: insight.client_friendly_summary },
      ].filter((section) => section.body.trim().length > 0)
    : [];
  const bullets = insight
    ? [
        { title: "Factori determinanți", items: insight.key_drivers },
        { title: "Riscuri și limitări", items: insight.risks_and_limitations },
      ].filter((group) => group.items.length > 0)
    : [];
  return { summary, model: ai.model, generatedAt: ai.generatedAt, sections, bullets };
}

const MARKET_FRESHNESS_LABELS: Record<string, string> = {
  fresh: "date proaspete",
  aging: "date în curs de învechire",
  stale: "date învechite",
  unknown: "prospețime necunoscută",
};

const MARKET_COVERAGE_LABELS: Record<string, string> = {
  good: "acoperire bună",
  partial: "acoperire parțială",
  poor: "acoperire slabă",
  unknown: "acoperire necunoscută",
};

function signedPercent(value: number | null | undefined): string {
  const v = finite(value ?? null);
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/** Secțiunea „Piața la momentul analizei”, exclusiv din snapshot. */
function buildMarketSection(
  market: AcpReportMarketInput | null,
  currency: string,
): AcpReportModel["market"] {
  if (!market || !market.aggregate) return null;
  const a = market.aggregate;
  const perSqm = (value: number | null) =>
    finite(value) === null ? "—" : `${reportMoney(value, currency)}/mp`;

  const rows: { label: string; value: string }[] = [
    { label: "Oferte de piață în selecție", value: reportNumberValue(a.totalMatched) },
    { label: "Oferte folosite în statistici", value: reportNumberValue(a.pricePerSqm.count) },
    { label: "Mediană € / mp piață", value: perSqm(a.pricePerSqm.median) },
    { label: "Medie € / mp piață", value: perSqm(a.pricePerSqm.average) },
    {
      label: "Interval € / mp piață",
      value:
        finite(a.pricePerSqm.min) === null || finite(a.pricePerSqm.max) === null
          ? "—"
          : `${perSqm(a.pricePerSqm.min)} – ${perSqm(a.pricePerSqm.max)}`,
    },
    {
      label: "Cuartile € / mp piață (25% / 75%)",
      value: `${perSqm(a.pricePerSqm.p25)} / ${perSqm(a.pricePerSqm.p75)}`,
    },
    {
      label: "Calitatea datelor de piață",
      value: `${MARKET_COVERAGE_LABELS[a.coverage.level] ?? a.coverage.level}${
        a.coverage.completeness === null ? "" : ` (${Math.round(a.coverage.completeness)}%)`
      }`,
    },
    {
      label: "Prospețimea datelor de piață",
      value: `${MARKET_FRESHNESS_LABELS[a.freshness.level] ?? a.freshness.level} · ultima observare ${reportDate(a.freshness.lastSeenAt)}`,
    },
    {
      label: "Surse de piață",
      value:
        a.sourceMix.length === 0
          ? "—"
          : a.sourceMix
              .map((entry) => `${entry.source}: ${entry.count} (${entry.share.toFixed(1)}%)`)
              .join(", "),
    },
  ];

  if (market.insights) {
    rows.push(
      {
        label: "Poziționarea prețului proprietății",
        value: `${market.insights.property.label} · ${signedPercent(market.insights.property.deltaVsMedianPercent)} față de mediana pieței`,
      },
      {
        label: "Poziționarea prețului recomandat",
        value: `${market.insights.recommended.label} · ${signedPercent(market.insights.recommended.deltaVsMedianPercent)} față de mediana pieței`,
      },
      {
        label: "Valoarea estimată față de piață",
        value: signedPercent(market.insights.estimateVsMarketPercent),
      },
    );
  }

  return {
    capturedAt: market.capturedAt,
    rows,
    note: a.insufficient ? a.insufficientReason : null,
  };
}

/* ======================= Raport v2: pagini de prezentare ======================= */

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Apartament",
  studio: "Garsonieră",
  house: "Casă",
  villa: "Vilă",
  land: "Teren",
  commercial: "Spațiu comercial",
  office: "Birou",
  industrial: "Spațiu industrial",
};

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function yesNo(value: boolean | null | undefined): string {
  return value === true ? "Da" : value === false ? "Nu" : "—";
}

function floorLabel(value: number | null | undefined): string {
  const n = finite(value ?? null);
  if (n === null) return "—";
  return n === 0 ? "Parter" : n < 0 ? "Demisol" : String(n);
}

/** Titlul unei fișe, ex. „Apartament 2 camere 60 m²”. */
export function reportPropertyHeadline(subject: AcpReportSubject, fallback: string): string {
  const type = subject.propertyType ? (PROPERTY_TYPE_LABELS[subject.propertyType] ?? capitalize(subject.propertyType)) : null;
  const rooms = finite(subject.rooms ?? null);
  const area = finite(subject.usableArea ?? null);
  const parts = [
    type,
    rooms === null || subject.propertyType === "studio" ? null : `${rooms} ${rooms === 1 ? "cameră" : "camere"}`,
    area === null ? null : `${Math.round(area)} m²`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : fallback;
}

type FeatureRow = {
  label: string;
  /** Factorul ajustării afișate pe acest rând. */
  factor: string | null;
  value: (s: AcpReportSubject) => string;
};

/** Rândurile de caracteristici din tabelul de comparație (ordinea din raport). */
export const ACP_REPORT_FEATURE_ROWS: FeatureRow[] = [
  { label: "Camere", factor: "rooms", value: (s) => reportNumberValue(s.rooms ?? null) },
  { label: "Suprafață utilă", factor: "area", value: (s) => reportNumberValue(s.usableArea ?? null, " m²") },
  { label: "Băi", factor: null, value: (s) => reportNumberValue(s.bathrooms ?? null) },
  { label: "Etaj", factor: "floor", value: (s) => floorLabel(s.floor) },
  { label: "Etaje bloc", factor: null, value: (s) => reportNumberValue(s.totalFloors ?? null) },
  { label: "An construcție", factor: "year", value: (s) => (s.constructionYear ? String(s.constructionYear) : "—") },
  { label: "Stare", factor: "condition", value: (s) => (s.condition ? capitalize(s.condition) : "—") },
  { label: "Balcon", factor: "balcony", value: (s) => yesNo(s.balcony) },
  { label: "Parcare", factor: "parking", value: (s) => yesNo(s.parking) },
  { label: "Mobilat", factor: "furnished", value: (s) => yesNo(s.furnished) },
];

const LABEL_TO_FACTOR = new Map<string, string>(
  Object.entries(ACP_ADJUSTMENT_LABELS).map(([factor, label]) => [label.toLowerCase(), factor]),
);

/** Factorul unei ajustări: din snapshot sau dedus din etichetă. */
export function adjustmentFactor(adjustment: AcpReportAdjustment): string | null {
  if (adjustment.factor) return adjustment.factor;
  return LABEL_TO_FACTOR.get(adjustment.label.trim().toLowerCase()) ?? null;
}

function signedMoney(amount: number, currency: string): string {
  return `${amount > 0 ? "+" : ""}${reportMoney(amount, currency)}`;
}

/** Suma ajustărilor unui comparabil pentru un factor (0 dacă nu există). */
export function adjustmentForFactor(c: AcpReportComparableInput, factor: string): number {
  return c.adjustments
    .filter((a) => adjustmentFactor(a) === factor)
    .reduce((sum, a) => sum + a.amount, 0);
}

function characteristics(subject: AcpReportSubject, currency: string): { label: string; value: string }[] {
  const rows = [
    {
      label: "Tip proprietate",
      value: subject.propertyType ? (PROPERTY_TYPE_LABELS[subject.propertyType] ?? capitalize(subject.propertyType)) : "—",
    },
    ...ACP_REPORT_FEATURE_ROWS.map((row) => ({ label: row.label, value: row.value(subject) })),
    {
      label: "Preț / m²",
      value:
        finite(subject.price ?? null) !== null && finite(subject.usableArea ?? null)
          ? `${reportMoney((subject.price as number) / (subject.usableArea as number), currency)}/m²`
          : "—",
    },
  ];
  return rows.filter((r) => r.value !== "—");
}

function daysBetween(from: string | null | undefined, to: string): number | null {
  const a = from ? Date.parse(from) : NaN;
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Împarte comparabilele folosite în pagini de câte `size`. */
export function chunkComparables<T>(items: T[], size = ACP_REPORT_COMPARABLES_PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

function buildV2Sections(
  version: AcpReportVersionInput,
  agency: AcpReportAgency,
  currency: string,
  generatedAt: string,
  generatedBy: { name: string | null; role: string | null } | null,
): Pick<
  AcpReportModel,
  "cover" | "used" | "subjectSheet" | "locationMap" | "comparisonPages" | "priceChart" | "valuation" | "recommendations"
> {
  const target = version.target;
  const s = target.subject;
  const targetPhotos = (target.photos ?? []).filter(Boolean);
  const snapshotAt = version.snapshotAt ?? generatedAt;

  const subjectSheet: AcpReportSheet = {
    label: "Proprietatea analizată",
    title: reportPropertyHeadline(s, target.title),
    reference: target.reference,
    photos: targetPhotos.slice(0, 3),
    statusLabel: null,
    active: true,
    price: reportMoney(s.price ?? null, currency),
    characteristics: characteristics(s, currency),
    description: target.description ?? null,
    adjustments: [],
    finalAdjustedPrice: null,
    geo: snapshotGeo(s),
  };

  const usedInputs = version.comparables
    .filter((c) => c.isSelected)
    .sort(
      (a, b) =>
        (finite(b.similarityScore) ?? 0) - (finite(a.similarityScore) ?? 0) || a.key.localeCompare(b.key),
    );

  const used: AcpReportUsedComparable[] = usedInputs.map((c, i) => {
    const cur = c.subject.currency || currency;
    const active = c.status !== "inactive";
    const days = finite(c.daysOnMarket ?? null) ?? daysBetween(c.firstSeenAt, c.disappearedAt ?? snapshotAt);
    const total = c.adjustments.reduce((sum, a) => sum + a.amount, 0);
    const photos = (c.photos ?? []).filter(Boolean).slice(0, 3);
    const statusLabel = active ? "Activă" : "Inactivă";
    return {
      index: i + 1,
      key: c.key,
      reference: c.reference || `#${i + 1}`,
      address: c.locationLabel || c.title,
      active,
      statusLabel,
      daysOnMarket: days === null ? "—" : `${days} ${days === 1 ? "zi" : "zile"}`,
      firstSeen: reportDate(c.firstSeenAt ?? null, false),
      disappeared: reportDate(c.disappearedAt ?? null, false),
      price: reportMoney(c.price, cur),
      adjustmentTotal: c.adjustments.length === 0 ? reportMoney(0, cur) : signedMoney(total, cur),
      adjustedPrice: reportMoney(c.adjustedPrice, cur),
      photo: photos[0] ?? null,
      sheet: {
        label: `Comparabila #${i + 1}`,
        title: reportPropertyHeadline(c.subject, c.title),
        reference: c.reference ?? null,
        photos,
        statusLabel,
        active,
        price: reportMoney(c.price, cur),
        characteristics: characteristics(c.subject, cur),
        description: c.description ?? null,
        adjustments: c.adjustments.map((a) => ({ label: a.label, basis: a.basis, amount: signedMoney(a.amount, cur) })),
        finalAdjustedPrice: c.adjustments.length > 0 ? reportMoney(c.adjustedPrice, cur) : null,
        geo: snapshotGeo(c.subject),
      },
    };
  });

  const mapComparables = used.flatMap((u) => (u.sheet.geo ? [{ ...u.sheet.geo, index: u.index }] : []));
  const locationMap: AcpReportLocationMap | null =
    subjectSheet.geo || mapComparables.length > 0
      ? {
          subject: subjectSheet.geo,
          comparables: mapComparables,
          usedCount: used.length,
          missing: used.length - mapComparables.length,
        }
      : null;

  const comparisonPages: AcpReportComparisonPage[] = chunkComparables(usedInputs).map((chunk, pageIndex) => {
    const offset = pageIndex * ACP_REPORT_COMPARABLES_PER_PAGE;
    const views = chunk.map((_, i) => used[offset + i]!);
    const keep = (row: { cells: AcpReportComparisonCell[] }) => row.cells.some((cell) => cell.value !== "—");
    const top = [
      {
        label: "Adresă / zonă",
        cells: [
          { value: target.locationLabel || "—", adjustment: null },
          ...views.map((v) => ({ value: v.address || "—", adjustment: null })),
        ],
      },
      {
        label: "Status",
        cells: [{ value: "—", adjustment: null }, ...views.map((v) => ({ value: v.statusLabel, adjustment: null }))],
      },
      {
        label: "Preț",
        cells: [
          { value: reportMoney(s.price ?? null, currency), adjustment: null },
          ...views.map((v) => ({ value: v.price, adjustment: null })),
        ],
      },
    ].filter(keep);
    const features = ACP_REPORT_FEATURE_ROWS.map((row) => ({
      label: row.label,
      cells: [
        { value: row.value(s), adjustment: null },
        ...chunk.map((c) => ({
          value: row.value(c.subject),
          adjustment: row.factor ? signedMoney(adjustmentForFactor(c, row.factor), c.subject.currency || currency) : null,
        })),
      ],
    })).filter(keep);
    return {
      columns: views.map((v) => v.index),
      headers: [
        { label: "Proprietatea analizată", photo: targetPhotos[0] ?? null },
        ...views.map((v) => ({ label: `Comparabila #${v.index}`, photo: v.photo })),
      ],
      top,
      features,
      adjusted: views.map((v) => v.adjustedPrice),
    };
  });

  const adjustedValues = usedInputs
    .map((c) => finite(c.adjustedPrice))
    .filter((v): v is number => v !== null && v > 0);
  const est = version.estimate;
  const priceChart: AcpReportPriceChart | null =
    adjustedValues.length === 0
      ? null
      : {
          bars: [
            { label: "Minim", value: Math.min(...adjustedValues) },
            { label: "Medie", value: adjustedValues.reduce((a, b) => a + b, 0) / adjustedValues.length },
            { label: "Mediană", value: median(adjustedValues) },
            { label: "Maxim", value: Math.max(...adjustedValues) },
          ].map((b) => ({ ...b, display: reportMoney(b.value, currency) })),
          recommended:
            finite(est?.recommendedListingPrice ?? null) !== null
              ? {
                  value: est!.recommendedListingPrice as number,
                  display: reportMoney(est!.recommendedListingPrice, currency),
                }
              : null,
          band:
            finite(est?.estimatedMin ?? null) !== null && finite(est?.estimatedMax ?? null) !== null
              ? {
                  min: est!.estimatedMin as number,
                  max: est!.estimatedMax as number,
                  display: `${reportMoney(est!.estimatedMin, currency)} – ${reportMoney(est!.estimatedMax, currency)}`,
                }
              : null,
        };

  const insight = version.ai?.sections ?? null;
  let recommendations: AcpReportModel["recommendations"] = null;
  if (version.ai) {
    const groups: { title: string; body?: string; items?: string[] }[] = [];
    if (insight) {
      if (insight.key_drivers.length > 0)
        groups.push({ title: "Puncte forte și factori determinanți", items: insight.key_drivers });
      if (insight.recommended_positioning.trim())
        groups.push({ title: "Poziționare recomandată", body: insight.recommended_positioning });
      if (insight.client_friendly_summary.trim())
        groups.push({ title: "Pe scurt, pentru client", body: insight.client_friendly_summary });
    } else if ((version.ai.summary ?? "").trim()) {
      groups.push({ title: "Pe scurt, pentru client", body: version.ai.summary!.trim() });
    }
    if (groups.length > 0) {
      recommendations = {
        note: "Text generat automat pe baza cifrelor din această analiză; nu modifică niciuna dintre valorile calculate.",
        groups,
      };
    }
  }

  return {
    cover: {
      dateLabel: reportDate(generatedAt, false),
      title: "Raport analiză de piață comparativă",
      photo: targetPhotos[0] ?? null,
      propertyTitle: target.title,
      address: target.locationLabel,
      disclaimer: ACP_REPORT_COVER_DISCLAIMER,
      agentName: generatedBy?.name ?? version.authorName ?? null,
      agentRole: generatedBy?.role ?? null,
      agencyName: agency.name,
    },
    used,
    subjectSheet,
    locationMap,
    comparisonPages,
    priceChart,
    valuation: {
      cards: [
        { label: "Preț minim recomandat", value: reportMoney(est?.estimatedMin ?? null, currency), highlight: false },
        { label: "Preț optim", value: reportMoney(est?.estimatedValue ?? null, currency), highlight: true },
        { label: "Preț maxim", value: reportMoney(est?.estimatedMax ?? null, currency), highlight: false },
      ],
      listingNote:
        finite(est?.recommendedListingPrice ?? null) === null
          ? null
          : `Preț recomandat de listare: ${reportMoney(est!.recommendedListingPrice, currency)} (include marja de negociere)`,
    },
    recommendations,
  };
}
