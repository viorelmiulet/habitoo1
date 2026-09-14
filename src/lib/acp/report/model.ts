/**
 * Modelul raportului ACP — funcții PURE, fără bază de date, rețea sau AI.
 *
 * Raportul se construiește exclusiv din snapshot-ul unei versiuni ACP
 * (rândul `acp_analyses` + `acp_comparables` + `acp_analysis_sources` ale
 * acelei versiuni). Nu se citește niciodată `market_listings` curent, deci un
 * raport istoric rămâne identic chiar dacă piața se schimbă ulterior.
 */
import type { AcpAiInsight } from "../ai/schema";

export type AcpReportSubject = {
  rooms?: number | null;
  usableArea?: number | null;
  floor?: number | null;
  constructionYear?: number | null;
  condition?: string | null;
  propertyType?: string | null;
  transactionKind?: string | null;
  price?: number | null;
  currency?: string | null;
};

export type AcpReportAdjustment = {
  label: string;
  basis: string;
  amount: number;
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
};

export type AcpReportSourceInput = {
  sourceType: string;
  sourceName: string;
  itemsFound: number;
  itemsUsed: number;
  itemsExcluded: number;
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
  }[];
  statistics: { label: string; value: string }[];
  sources: { name: string; type: string; found: number; used: number; excluded: number }[];
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
};

export const ACP_REPORT_FORMAT_VERSION = "1.0";

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
    })),
    warnings,
    ai: buildAiSection(version.ai ?? null),
    market: buildMarketSection(version.market ?? null, currency),
  };
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
