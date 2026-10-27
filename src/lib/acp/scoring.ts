/**
 * Motorul determinist de scoring ACP.
 *
 * Funcțiile de aici sunt pure: aceleași intrări produc mereu același rezultat,
 * fără acces la rețea, la baza de date sau la AI. Un AI Analyst va putea doar
 * să interpreteze rezultatele calculate aici.
 */
import {
  ACP_NEUTRAL_SCORE,
  ACP_SCORE_COMPONENTS,
  ACP_SCORE_WEIGHTS,
  ACP_TOLERANCES,
  classifyComparable,
  type AcpComparableTier,
  type AcpScoreComponent,
} from "./config";
import { marketPoolScope } from "../market/acp-location";
import { residentialComplexByKey } from "./complexes";
import { normalizePropertyType, normalizeTransactionType } from "../market/normalize";

/** Reprezentarea normalizată a unei proprietăți folosită de motor. */
export type AcpSubject = {
  propertyType?: string | null;
  transactionType?: string | null;
  city?: string | null;
  sector?: string | null;
  county?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rooms?: number | null;
  usableArea?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  constructionYear?: number | null;
  condition?: string | null;
  parking?: boolean | null;
  balcony?: boolean | null;
  furnished?: boolean | null;
  price?: number | null;
  currency?: string | null;
  pricePerSqm?: number | null;
  /** Cheia ansamblului rezidențial recunoscut (vezi `complexes.ts`). */
  complex?: string | null;
};

/** Opțiuni de scoring dependente de versiunea motorului. */
export type AcpScoringOptions = {
  /** Motor v4: locație după distanță, ansambluri, garsonieră = 1 cameră. */
  geoLocation?: boolean;
};

/** Motor v4: distanța maximă (km) a unui comparabil direct. */
export const ACP_DIRECT_MAX_DISTANCE_KM = 2;
/** Motor v4: până la această distanță (km) scorul de locație e maxim. */
export const ACP_LOCATION_FULL_SCORE_KM = 1;

export type AcpSimilarityResult = {
  /** Scor total 0–100, rotunjit la 2 zecimale. */
  similarityScore: number;
  /** Scorurile componente (0–100), rotunjite la 2 zecimale. */
  components: Record<AcpScoreComponent, number>;
  /** Contribuția fiecărei componente la scorul total. */
  weighted: Record<AcpScoreComponent, number>;
  tier: AcpComparableTier;
  /** Componente pentru care lipseau date și au primit scor neutru. */
  missing: AcpScoreComponent[];
  /** Distanța în km, când ambele au coordonate. */
  distanceKm?: number | null;
};

const DIACRITICS: Record<string, string> = {
  ă: "a",
  â: "a",
  î: "i",
  ș: "s",
  ş: "s",
  ț: "t",
  ţ: "t",
};

export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[ăâîșşțţ]/g, (c) => DIACRITICS[c] ?? c)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Distanța ortodromică în kilometri (Haversine). */
export function haversineKm(
  a: { latitude?: number | null; longitude?: number | null },
  b: { latitude?: number | null; longitude?: number | null },
): number | null {
  const lat1 = num(a.latitude);
  const lon1 = num(a.longitude);
  const lat2 = num(b.latitude);
  const lon2 = num(b.longitude);
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Scor de locație pe baza ierarhiei zonă → cartier → oraș → județ. */
export function scoreLocation(target: AcpSubject, candidate: AcpSubject): number | null {
  const sameOr = (a: string | null | undefined, b: string | null | undefined) => {
    const na = normalizeText(a);
    const nb = normalizeText(b);
    return na !== "" && na === nb;
  };
  if (sameOr(target.neighborhood, candidate.neighborhood)) return 100;
  if (sameOr(target.district, candidate.district)) return 85;
  const targetPlace = marketPoolScope(target);
  const candidatePlace = marketPoolScope(candidate);
  if (sameOr(targetPlace.city, candidatePlace.city)) {
    if (targetPlace.sector && candidatePlace.sector && targetPlace.sector !== candidatePlace.sector) return 35;
    return 60;
  }
  if (sameOr(target.county, candidate.county)) return 35;
  const known =
    normalizeText(target.city) !== "" ||
    normalizeText(target.county) !== "" ||
    normalizeText(target.neighborhood) !== "";
  const candidateKnown =
    normalizeText(candidate.city) !== "" ||
    normalizeText(candidate.county) !== "" ||
    normalizeText(candidate.neighborhood) !== "";
  if (!known || !candidateKnown) return null;
  return 10;
}

/** Scor de suprafață utilă: diferență relativă față de țintă. */
export function scoreArea(target: AcpSubject, candidate: AcpSubject): number | null {
  const t = num(target.usableArea);
  const c = num(candidate.usableArea);
  if (t === null || c === null || t <= 0) return null;
  const diff = Math.abs(t - c) / t;
  return clamp(100 * (1 - diff / ACP_TOLERANCES.areaMaxRelativeDiff));
}

/** Scor pe număr de camere. */
export function scoreRooms(target: AcpSubject, candidate: AcpSubject): number | null {
  const t = num(target.rooms);
  const c = num(candidate.rooms);
  if (t === null || c === null) return null;
  const diff = Math.abs(t - c);
  if (diff === 0) return 100;
  if (diff <= 1) return 55;
  if (diff <= 2) return 20;
  return 0;
}

/** Scor pe distanță geografică. */
export function scoreDistance(target: AcpSubject, candidate: AcpSubject): number | null {
  const km = haversineKm(target, candidate);
  if (km === null) return null;
  return clamp(100 * (1 - km / ACP_TOLERANCES.distanceMaxKm));
}

/** Scor pe etaj: diferența de nivel, cu penalizare pentru parter / ultim etaj. */
export function scoreFloor(target: AcpSubject, candidate: AcpSubject): number | null {
  const t = num(target.floor);
  const c = num(candidate.floor);
  if (t === null || c === null) return null;
  let score = 100 - Math.abs(t - c) * ACP_TOLERANCES.floorPenaltyPerLevel;
  const groundMismatch = (t === 0) !== (c === 0);
  if (groundMismatch) score -= 10;
  const tTop = num(target.totalFloors);
  const cTop = num(candidate.totalFloors);
  if (tTop !== null && cTop !== null) {
    const topMismatch = (t === tTop) !== (c === cTop);
    if (topMismatch) score -= 10;
  }
  return clamp(score);
}

/** Scor pe anul construcției. */
export function scoreYear(target: AcpSubject, candidate: AcpSubject): number | null {
  const t = num(target.constructionYear);
  const c = num(candidate.constructionYear);
  if (t === null || c === null) return null;
  return clamp(100 - Math.abs(t - c) * ACP_TOLERANCES.yearPenaltyPerYear);
}

/** Ordinea stărilor recunoscute, folosită pentru distanța dintre ele. */
const CONDITION_RANK: Record<string, number> = {
  "la cheie": 5,
  nou: 5,
  new: 5,
  renovat: 4,
  renovated: 4,
  "foarte buna": 4,
  buna: 3,
  good: 3,
  mobilat: 3,
  medie: 2,
  average: 2,
  nefinisat: 1,
  "necesita renovare": 1,
  "needs renovation": 1,
};

/** Scor pe starea imobilului. */
export function scoreCondition(target: AcpSubject, candidate: AcpSubject): number | null {
  const t = normalizeText(target.condition);
  const c = normalizeText(candidate.condition);
  if (t === "" || c === "") return null;
  if (t === c) return 100;
  const rt = CONDITION_RANK[t];
  const rc = CONDITION_RANK[c];
  if (rt === undefined || rc === undefined) return 50;
  return clamp(100 - Math.abs(rt - rc) * 25);
}

/** Scor pe dotări (parcare, balcon, mobilat). */
export function scoreFeatures(target: AcpSubject, candidate: AcpSubject): number | null {
  const keys = ["parking", "balcony", "furnished"] as const;
  const pairs = keys
    .map((k) => [target[k], candidate[k]] as const)
    .filter(([a, b]) => typeof a === "boolean" && typeof b === "boolean");
  if (pairs.length === 0) return null;
  const matches = pairs.filter(([a, b]) => a === b).length;
  return (matches / pairs.length) * 100;
}

/** Alte criterii: tipul proprietății și tipul tranzacției, pe formele canonice. */
export function scoreOther(target: AcpSubject, candidate: AcpSubject): number | null {
  const checks: boolean[] = [];
  // „apartment"/„studio" (CRM) și „apartament" (oferte) sunt același tip.
  const propT = normalizePropertyType(target.propertyType);
  const propC = normalizePropertyType(candidate.propertyType);
  if (propT !== null && propC !== null) checks.push(propT === propC);
  const trT = normalizeTransactionType(target.transactionType);
  const trC = normalizeTransactionType(candidate.transactionType);
  if (trT !== null && trC !== null) checks.push(trT === trC);
  if (checks.length === 0) return null;
  return (checks.filter(Boolean).length / checks.length) * 100;
}

/** Garsoniera / studio fără număr de camere = apartament cu 1 cameră. */
export function effectiveRooms(subject: AcpSubject): number | null {
  const rooms = num(subject.rooms);
  if (rooms !== null) return rooms;
  const type = normalizeText(subject.propertyType);
  return /\b(studio|garsoniera)\b/.test(type) ? 1 : null;
}

/** Locul folosit la comparația pe nume: ansamblul are propria localitate. */
function complexPlace(subject: AcpSubject): AcpSubject {
  const complex = residentialComplexByKey(subject.complex);
  if (!complex) return subject;
  return {
    ...subject,
    city: complex.city,
    county: complex.county,
    sector: null,
    district: complex.label,
    neighborhood: complex.label,
  };
}

/**
 * Motor v4: scorul de locație. Același ansamblu = maxim; cu coordonate la
 * ambele, scorul vine din distanță (≤1 km maxim, 0 peste 5 km); altfel numele
 * zonei, cu ansamblul tratat ca zonă proprie (localitatea lui are prioritate).
 */
export function scoreLocationV4(target: AcpSubject, candidate: AcpSubject): number | null {
  if (target.complex && target.complex === candidate.complex) return 100;
  const km = haversineKm(target, candidate);
  if (km !== null) {
    if (km <= ACP_LOCATION_FULL_SCORE_KM) return 100;
    const max = ACP_TOLERANCES.distanceMaxKm;
    if (km >= max) return 0;
    return clamp((100 * (max - km)) / (max - ACP_LOCATION_FULL_SCORE_KM));
  }
  const t = complexPlace(target);
  const c = complexPlace(candidate);
  const targetComplex = residentialComplexByKey(target.complex);
  if (targetComplex && !candidate.complex) {
    const sameCity = normalizeText(c.city) !== "" && normalizeText(c.city) === normalizeText(targetComplex.city);
    if (sameCity) return 85;
  }
  return scoreLocation(t, c);
}

function scoreRoomsV4(target: AcpSubject, candidate: AcpSubject): number | null {
  return scoreRooms({ ...target, rooms: effectiveRooms(target) }, { ...candidate, rooms: effectiveRooms(candidate) });
}

const SCORERS: Record<AcpScoreComponent, (t: AcpSubject, c: AcpSubject) => number | null> = {
  location: scoreLocation,
  area: scoreArea,
  rooms: scoreRooms,
  distance: scoreDistance,
  floor: scoreFloor,
  year: scoreYear,
  condition: scoreCondition,
  features: scoreFeatures,
  other: scoreOther,
};

/**
 * Calculează similaritatea dintre proprietatea analizată și un candidat.
 * Componentele fără date primesc scor neutru și sunt raportate în `missing`.
 */
export function calculateComparableSimilarity(
  target: AcpSubject,
  candidate: AcpSubject,
  options: AcpScoringOptions = {},
): AcpSimilarityResult {
  const scorers = options.geoLocation
    ? { ...SCORERS, location: scoreLocationV4, rooms: scoreRoomsV4 }
    : SCORERS;
  const components = {} as Record<AcpScoreComponent, number>;
  const weighted = {} as Record<AcpScoreComponent, number>;
  const missing: AcpScoreComponent[] = [];
  let total = 0;

  for (const key of ACP_SCORE_COMPONENTS) {
    const raw = scorers[key](target, candidate);
    const score = raw === null ? ACP_NEUTRAL_SCORE : clamp(raw);
    if (raw === null) missing.push(key);
    const contribution = (score * ACP_SCORE_WEIGHTS[key]) / 100;
    components[key] = round2(score);
    weighted[key] = round2(contribution);
    total += contribution;
  }

  const similarityScore = round2(clamp(total));
  let tier = classifyComparable(similarityScore);
  const distanceKm = haversineKm(target, candidate);
  if (!options.geoLocation) return { similarityScore, components, weighted, tier, missing };
  // Motor v4: un comparabil direct trebuie să fie la cel mult 2 km.
  if (tier === "direct" && distanceKm !== null && distanceKm > ACP_DIRECT_MAX_DISTANCE_KM) tier = "secondary";
  return {
    similarityScore,
    components,
    weighted,
    tier,
    missing,
    distanceKm: distanceKm === null ? null : round2(distanceKm),
  };
}
