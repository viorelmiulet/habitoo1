/**
 * Scor de oportunitate 0–100, determinist și explicabil (Stage 13).
 *
 * Scorul NU este o evaluare: nu înlocuiește și nu alimentează ACP. Este doar o
 * prioritizare a oportunităților descoperite. AI-ul poate comenta scorul, dar
 * nu îl poate modifica: aceleași date produc mereu același rezultat.
 */
import { foldText } from "./normalize";
import type { NormalizedProspect, ProspectSearchCriteria } from "./types";

export type ScoreFactor = {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
};

export type ProspectScore = {
  score: number;
  relevance: number;
  breakdown: ScoreFactor[];
};

const SELLER_POINTS: Record<NormalizedProspect["sellerType"], number> = {
  private: 25,
  developer: 10,
  unknown: 6,
  agency: 0,
};

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, (now - time) / 86_400_000);
}

function inRange(value: number | null, min: number | null, max: number | null): boolean | null {
  if (value === null) return null;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  if (min === null && max === null) return null;
  return true;
}

/** Relevanța față de criteriile căutării: 0–100, doar pe criterii completate. */
export function scoreRelevance(
  prospect: NormalizedProspect,
  criteria: ProspectSearchCriteria,
): number {
  const checks: (boolean | null)[] = [
    criteria.transactionType === null
      ? null
      : prospect.transactionType === null
        ? null
        : prospect.transactionType === criteria.transactionType,
    criteria.city === null || criteria.city === ""
      ? null
      : prospect.city === null
        ? null
        : foldText(prospect.city).includes(foldText(criteria.city)),
    criteria.county === null || criteria.county === ""
      ? null
      : prospect.county === null
        ? null
        : foldText(prospect.county).includes(foldText(criteria.county)),
    criteria.zone === null || criteria.zone === ""
      ? null
      : prospect.zone === null
        ? null
        : foldText(prospect.zone).includes(foldText(criteria.zone)),
    criteria.propertyType === null || criteria.propertyType === ""
      ? null
      : prospect.propertyType === null
        ? null
        : foldText(prospect.propertyType).includes(foldText(criteria.propertyType)),
    inRange(prospect.price, criteria.priceMin, criteria.priceMax),
    inRange(prospect.rooms, criteria.roomsMin, criteria.roomsMax),
    inRange(prospect.surfaceUseful, criteria.surfaceMin, criteria.surfaceMax),
    criteria.keywords.length === 0
      ? null
      : criteria.keywords.some((keyword) =>
          foldText(`${prospect.title} ${prospect.description ?? ""}`).includes(foldText(keyword)),
        ),
  ];
  const decided = checks.filter((value): value is boolean => value !== null);
  if (decided.length === 0) return 50;
  const matched = decided.filter(Boolean).length;
  return Math.round((matched / decided.length) * 100);
}

/**
 * Scorul de oportunitate cu breakdown. `now` este injectabil pentru teste,
 * astfel încât rezultatul să fie complet reproductibil.
 */
export function scoreProspect(
  prospect: NormalizedProspect,
  criteria: ProspectSearchCriteria,
  now: number = Date.now(),
): ProspectScore {
  const breakdown: ScoreFactor[] = [];

  const sellerPoints = SELLER_POINTS[prospect.sellerType];
  breakdown.push({
    key: "seller_type",
    label: "Tip vânzător",
    points: sellerPoints,
    max: 25,
    detail:
      prospect.sellerType === "private"
        ? "Anunț de la proprietar"
        : prospect.sellerType === "agency"
          ? "Anunț de agenție"
          : prospect.sellerType === "developer"
            ? "Anunț de dezvoltator"
            : "Tip vânzător nedeterminat",
  });

  breakdown.push({
    key: "price_present",
    label: "Preț disponibil",
    points: prospect.price !== null ? 10 : 0,
    max: 10,
    detail: prospect.price !== null ? "Prețul este publicat" : "Prețul lipsește din anunț",
  });

  breakdown.push({
    key: "contact",
    label: "Date de contact",
    points: prospect.sellerPhone !== null ? 10 : 0,
    max: 10,
    detail: prospect.sellerPhone !== null ? "Telefon disponibil" : "Fără telefon în anunț",
  });

  const relevance = scoreRelevance(prospect, criteria);
  breakdown.push({
    key: "relevance",
    label: "Potrivire cu căutarea",
    points: Math.round((relevance / 100) * 25),
    max: 25,
    detail: `Potrivire ${relevance}% cu criteriile căutării`,
  });

  const age = daysSince(prospect.publishedAt, now);
  const recency = age === null ? 4 : age <= 3 ? 10 : age <= 7 ? 8 : age <= 30 ? 5 : 1;
  breakdown.push({
    key: "recency",
    label: "Prospețime anunț",
    points: recency,
    max: 10,
    detail:
      age === null
        ? "Data publicării nu este cunoscută"
        : `Publicat acum ${Math.round(age)} zile`,
  });

  const completeness = Math.round(prospect.extractionConfidence * 15);
  breakdown.push({
    key: "completeness",
    label: "Completitudinea datelor",
    points: completeness,
    max: 15,
    detail: `${Math.round(prospect.extractionConfidence * 100)}% din câmpurile cheie sunt prezente`,
  });

  const pricePerSqm =
    prospect.price !== null && prospect.surfaceUseful !== null && prospect.surfaceUseful > 0
      ? prospect.price / prospect.surfaceUseful
      : null;
  breakdown.push({
    key: "price_per_sqm",
    label: "Preț pe metru pătrat",
    points: pricePerSqm !== null ? 5 : 0,
    max: 5,
    detail:
      pricePerSqm !== null
        ? `${Math.round(pricePerSqm)} pe mp (calculat din datele anunțului)`
        : "Nu există suficiente date pentru preț pe mp",
  });

  const total = breakdown.reduce((sum, factor) => sum + factor.points, 0);
  return { score: Math.max(0, Math.min(100, total)), relevance, breakdown };
}
