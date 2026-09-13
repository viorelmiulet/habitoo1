/**
 * ACP – Analiză Comparativă de Piață: configurația centralizată a motorului
 * determinist. Toate ponderile și pragurile trăiesc aici, niciodată
 * împrăștiate în cod sau în UI.
 */

/** Componentele scorului de similaritate. */
export const ACP_SCORE_COMPONENTS = [
  "location",
  "area",
  "rooms",
  "distance",
  "floor",
  "year",
  "condition",
  "features",
  "other",
] as const;

export type AcpScoreComponent = (typeof ACP_SCORE_COMPONENTS)[number];

/** Ponderi (procente). Suma trebuie să fie exact 100. */
export const ACP_SCORE_WEIGHTS: Record<AcpScoreComponent, number> = {
  location: 25,
  area: 20,
  rooms: 15,
  distance: 10,
  floor: 10,
  year: 5,
  condition: 5,
  features: 5,
  other: 5,
};

export const ACP_SCORE_LABELS: Record<AcpScoreComponent, string> = {
  location: "Locație",
  area: "Suprafață utilă",
  rooms: "Număr camere",
  distance: "Distanță",
  floor: "Etaj",
  year: "An construcție",
  condition: "Stare",
  features: "Dotări",
  other: "Alte criterii",
};

/** Praguri de clasificare a unui comparabil. */
export const ACP_THRESHOLDS = {
  /** >= această valoare: comparabil direct. */
  direct: 85,
  /** >= această valoare (și sub `direct`): comparabil secundar. */
  secondary: 70,
} as const;

export type AcpComparableTier = "direct" | "secondary" | "excluded";

export function classifyComparable(similarityScore: number): AcpComparableTier {
  if (similarityScore >= ACP_THRESHOLDS.direct) return "direct";
  if (similarityScore >= ACP_THRESHOLDS.secondary) return "secondary";
  return "excluded";
}

export const ACP_TIER_LABELS: Record<AcpComparableTier, string> = {
  direct: "Comparabil direct",
  secondary: "Comparabil secundar",
  excluded: "Exclus din analiza principală",
};

/**
 * Scor neutru folosit când o informație lipsește la țintă sau la candidat:
 * nici penalizare totală, nici potrivire perfectă.
 */
export const ACP_NEUTRAL_SCORE = 60;

/** Toleranțe folosite de scoring. */
export const ACP_TOLERANCES = {
  /** Diferență relativă de suprafață peste care scorul devine 0. */
  areaMaxRelativeDiff: 0.4,
  /** Distanță (km) peste care scorul de distanță devine 0. */
  distanceMaxKm: 5,
  /** Penalizare pe nivel de etaj diferență. */
  floorPenaltyPerLevel: 15,
  /** Penalizare pe an de diferență la anul construcției. */
  yearPenaltyPerYear: 2,
} as const;

/** Multiplicator IQR pentru detectarea outlierilor de preț. */
export const ACP_OUTLIER_IQR_MULTIPLIER = 1.5;

/** Tipuri de surse acceptate într-o analiză (nu hardcodăm portalurile). */
export const ACP_SOURCE_TYPES = ["own_properties", "collaboration", "portal", "manual"] as const;
export type AcpSourceType = (typeof ACP_SOURCE_TYPES)[number];

export const ACP_SOURCE_TYPE_LABELS: Record<AcpSourceType, string> = {
  own_properties: "Proprietățile mele",
  collaboration: "Colaborare",
  portal: "Portaluri",
  manual: "Adăugate manual",
};
