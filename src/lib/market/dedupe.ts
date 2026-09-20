/**
 * Deduplicare deterministă a ofertelor de piață.
 *
 * Ordinea de încredere:
 *  1. identificator sursă + URL exact (aceeași sursă) → potrivire sigură;
 *  2. adresă normalizată + suprafață + camere;
 *  3. adresă normalizată + suprafață + etaj;
 *  4. caracteristici robuste + proximitate geografică (doar cu coordonate).
 *
 * Reguli de siguranță:
 *  - două oferte NU se unesc doar pentru preț și suprafață apropiate;
 *  - potrivirile neconcludente devin „ambiguous” și așteaptă decizie manuală;
 *  - fiecare decizie are scor și motive, ca să fie explicabilă.
 */
import { haversineKm } from "@/lib/acp/scoring";
import type { NormalizedListing } from "./normalize";

export const DEDUPE_THRESHOLDS = {
  /** Peste acest scor, potrivirea este acceptată automat. */
  match: 85,
  /** Între `review` și `match`, potrivirea merge la verificare manuală. */
  review: 65,
  /** Toleranța relativă de suprafață pentru a considera aceeași proprietate. */
  areaTolerance: 0.03,
  /** Distanța maximă (km) pentru potrivirea geografică. */
  maxDistanceKm: 0.15,
} as const;

/**
 * Praguri pentru deduplicarea între portaluri.
 *
 * Aceeași proprietate apare pe mai multe portaluri, cu adrese web diferite.
 * O ofertă nouă care se potrivește pe zonă normalizată + camere + suprafață
 * (±2%) + preț (±1%), într-o fereastră recentă, este aceeași proprietate:
 * păstrăm prima văzută și înregistrăm sursa suplimentară.
 */
export const CROSS_PORTAL_THRESHOLDS = {
  areaTolerance: 0.02,
  priceTolerance: 0.01,
  windowDays: 45,
} as const;

export type CrossPortalCandidate = {
  id: string;
  source: string;
  normalizedCity: string | null;
  normalizedDistrict: string | null;
  normalizedNeighborhood: string | null;
  propertyType: string | null;
  transactionType: string | null;
  rooms: number | null;
  usableArea: number | null;
  totalArea: number | null;
  price: number | null;
  lastSeenAt: string;
};

/** Zona normalizată folosită la potrivirea între portaluri. */
export function crossPortalZone(input: {
  normalizedNeighborhood: string | null;
  normalizedDistrict: string | null;
  normalizedCity: string | null;
}): string | null {
  return (
    input.normalizedNeighborhood?.trim() ||
    input.normalizedDistrict?.trim() ||
    input.normalizedCity?.trim() ||
    null
  );
}

function withinRatio(a: number, b: number, tolerance: number): boolean {
  const max = Math.max(a, b);
  if (max <= 0) return false;
  return Math.abs(a - b) / max <= tolerance;
}

export type CrossPortalMatch = { match: boolean; reason: string };

/**
 * Decide dacă o ofertă nouă este același imobil ca o ofertă deja în bazin,
 * publicată pe alt portal. Fără suprafață sau fără camere nu unim niciodată.
 */
export function isCrossPortalDuplicate(
  listing: NormalizedListing,
  candidate: CrossPortalCandidate,
  options: { now: string },
): CrossPortalMatch {
  if (candidate.source === listing.source) {
    return { match: false, reason: "Aceeași sursă: nu este duplicat între portaluri." };
  }
  const area = listing.usableArea ?? listing.totalArea;
  const candidateArea = candidate.usableArea ?? candidate.totalArea;
  if (!area || !candidateArea) return { match: false, reason: "Suprafață necunoscută." };
  if (listing.rooms === null || candidate.rooms === null) {
    return { match: false, reason: "Număr de camere necunoscut." };
  }
  if (Number(listing.rooms) !== Number(candidate.rooms)) {
    return { match: false, reason: "Număr de camere diferit." };
  }
  if (!listing.price || !candidate.price) return { match: false, reason: "Preț necunoscut." };
  if (
    listing.propertyType &&
    candidate.propertyType &&
    listing.propertyType !== candidate.propertyType
  ) {
    return { match: false, reason: "Tip de proprietate diferit." };
  }
  if (
    listing.transactionType &&
    candidate.transactionType &&
    listing.transactionType !== candidate.transactionType
  ) {
    return { match: false, reason: "Tip de tranzacție diferit." };
  }
  const zone = crossPortalZone(listing);
  const candidateZone = crossPortalZone(candidate);
  if (!zone || !candidateZone || zone !== candidateZone) {
    return { match: false, reason: "Zonă normalizată diferită sau necunoscută." };
  }
  if (!withinRatio(area, candidateArea, CROSS_PORTAL_THRESHOLDS.areaTolerance)) {
    return { match: false, reason: "Suprafață diferită cu mai mult de 2%." };
  }
  if (!withinRatio(listing.price, candidate.price, CROSS_PORTAL_THRESHOLDS.priceTolerance)) {
    return { match: false, reason: "Preț diferit cu mai mult de 1%." };
  }
  const seen = Date.parse(candidate.lastSeenAt);
  const now = Date.parse(options.now);
  if (Number.isFinite(seen) && Number.isFinite(now)) {
    const days = (now - seen) / 86_400_000;
    if (days > CROSS_PORTAL_THRESHOLDS.windowDays) {
      return { match: false, reason: "Oferta existentă este în afara ferestrei recente." };
    }
  }
  return {
    match: true,
    reason: `Aceeași proprietate publicată și pe ${candidate.source}: zonă, camere, suprafață (±2%) și preț (±1%) identice.`,
  };
}

/** Prima potrivire între portaluri, în ordinea candidaților primiți. */
export function findCrossPortalDuplicate(
  listing: NormalizedListing,
  candidates: readonly CrossPortalCandidate[],
  options: { now: string },
): { candidate: CrossPortalCandidate; reason: string } | null {
  for (const candidate of candidates) {
    const result = isCrossPortalDuplicate(listing, candidate, options);
    if (result.match) return { candidate, reason: result.reason };
  }
  return null;
}

export type MarketEntityCandidate = {
  id: string;
  normalizedAddress: string | null;
  normalizedCity: string | null;
  normalizedDistrict: string | null;
  normalizedNeighborhood: string | null;
  usableArea: number | null;
  rooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  constructionYear: number | null;
  propertyType: string | null;
  transactionType: string | null;
  latitude: number | null;
  longitude: number | null;
  identityHash: string | null;
  /** Sursele deja asociate entității (source + source_listing_id + url). */
  sources: { source: string; sourceListingId: string | null; url: string | null }[];
};

export type DedupeDecision = {
  decision: "match" | "ambiguous" | "new";
  entityId: string | null;
  score: number;
  reasons: string[];
  /** Entitățile aflate la egalitate, când decizia este ambiguă. */
  candidates: { entityId: string; score: number; reasons: string[] }[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sameArea(a: number | null, b: number | null): boolean {
  if (a === null || b === null || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / Math.max(a, b) <= DEDUPE_THRESHOLDS.areaTolerance;
}

/**
 * Amprenta de identitate a unei oferte: adresă normalizată + suprafață
 * rotunjită + camere. Folosită doar ca index rapid, niciodată ca dovadă unică.
 */
export function buildIdentityHash(listing: {
  normalizedCity: string | null;
  normalizedAddress: string | null;
  usableArea: number | null;
  totalArea: number | null;
  rooms: number | null;
}): string | null {
  const area = listing.usableArea ?? listing.totalArea;
  if (!listing.normalizedAddress || !area) return null;
  const parts = [
    listing.normalizedCity ?? "",
    listing.normalizedAddress,
    String(Math.round(area)),
    listing.rooms !== null ? String(listing.rooms) : "",
  ];
  return parts.join("|");
}

/** Scorul de potrivire dintre o ofertă normalizată și o entitate canonică. */
export function scoreEntityMatch(
  listing: NormalizedListing,
  entity: MarketEntityCandidate,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Regula 1: aceeași sursă și același identificator sau URL exact.
  const exactSource = entity.sources.find(
    (s) =>
      (s.source === listing.source && s.sourceListingId === listing.sourceListingId) ||
      (Boolean(listing.url) && s.url === listing.url),
  );
  if (exactSource) {
    return {
      score: 100,
      reasons: [`Identificator de sursă identic (${exactSource.source}).`],
    };
  }

  // Tipul de proprietate și tranzacția trebuie să fie compatibile.
  if (
    listing.propertyType &&
    entity.propertyType &&
    listing.propertyType !== entity.propertyType
  ) {
    return { score: 0, reasons: ["Tip de proprietate diferit."] };
  }
  if (
    listing.transactionType &&
    entity.transactionType &&
    listing.transactionType !== entity.transactionType
  ) {
    return { score: 0, reasons: ["Tip de tranzacție diferit."] };
  }

  const areaListing = listing.usableArea ?? listing.totalArea;
  const areaMatch = sameArea(areaListing, entity.usableArea);
  const addressMatch =
    Boolean(listing.normalizedAddress) && listing.normalizedAddress === entity.normalizedAddress;
  const cityMatch =
    Boolean(listing.normalizedCity) && listing.normalizedCity === entity.normalizedCity;
  const roomsMatch =
    listing.rooms !== null && entity.rooms !== null && Number(listing.rooms) === Number(entity.rooms);
  const floorMatch =
    listing.floor !== null && entity.floor !== null && listing.floor === entity.floor;
  const yearMatch =
    listing.constructionYear !== null &&
    entity.constructionYear !== null &&
    listing.constructionYear === entity.constructionYear;
  const distanceKm = haversineKm(
    { latitude: listing.latitude, longitude: listing.longitude },
    { latitude: entity.latitude, longitude: entity.longitude },
  );
  const geoMatch = distanceKm !== null && distanceKm <= DEDUPE_THRESHOLDS.maxDistanceKm;

  // Regula 2: adresă + suprafață + camere.
  if (addressMatch && areaMatch && roomsMatch) {
    score = 92;
    reasons.push("Adresă normalizată, suprafață și număr de camere identice.");
  }
  // Regula 3: adresă + suprafață + etaj.
  else if (addressMatch && areaMatch && floorMatch) {
    score = 90;
    reasons.push("Adresă normalizată, suprafață și etaj identice.");
  }
  // Regula 4: caracteristici robuste + proximitate geografică.
  else if (geoMatch && areaMatch && (roomsMatch || floorMatch)) {
    score = 86;
    reasons.push(
      `Coordonate la ${round2((distanceKm ?? 0) * 1000)} m, suprafață identică și ${
        roomsMatch ? "același număr de camere" : "același etaj"
      }.`,
    );
    if (yearMatch) reasons.push("Același an de construcție.");
  }
  // Semnale parțiale: merg la verificare manuală, nu se unesc automat.
  else if (addressMatch && areaMatch) {
    score = 75;
    reasons.push("Adresă și suprafață identice, dar fără camere sau etaj pentru confirmare.");
  } else if (addressMatch && (roomsMatch || floorMatch)) {
    score = 70;
    reasons.push("Adresă identică și o caracteristică suplimentară, suprafață necunoscută.");
  } else if (geoMatch && areaMatch) {
    score = 68;
    reasons.push("Coordonate foarte apropiate și suprafață identică, fără alte confirmări.");
  } else {
    // Preț și suprafață apropiate NU sunt motiv de unire.
    score = 0;
    reasons.push("Fără semnale suficiente pentru aceeași proprietate.");
  }

  if (score > 0 && score < DEDUPE_THRESHOLDS.match && cityMatch) {
    reasons.push("Aceeași localitate.");
  }
  return { score, reasons };
}

/** Alege entitatea canonică pentru o ofertă, sau cere verificare manuală. */
export function matchListingToEntities(
  listing: NormalizedListing,
  entities: readonly MarketEntityCandidate[],
): DedupeDecision {
  const scored = entities
    .map((entity) => {
      const { score, reasons } = scoreEntityMatch(listing, entity);
      return { entityId: entity.id, score, reasons };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      decision: "new",
      entityId: null,
      score: 0,
      reasons: ["Nicio entitate existentă nu se potrivește: se creează una nouă."],
      candidates: [],
    };
  }

  const best = scored[0]!;
  const tied = scored.filter((row) => row.score === best.score);

  if (best.score >= DEDUPE_THRESHOLDS.match && tied.length === 1) {
    return {
      decision: "match",
      entityId: best.entityId,
      score: best.score,
      reasons: best.reasons,
      candidates: scored.slice(0, 3),
    };
  }

  if (best.score >= DEDUPE_THRESHOLDS.review) {
    return {
      decision: "ambiguous",
      entityId: null,
      score: best.score,
      reasons:
        tied.length > 1
          ? [...best.reasons, `${tied.length} entități se potrivesc la fel de bine.`]
          : [...best.reasons, "Potrivire neconcludentă: necesită confirmare manuală."],
      candidates: scored.slice(0, 3),
    };
  }

  return {
    decision: "new",
    entityId: null,
    score: best.score,
    reasons: ["Scor de potrivire prea mic: se tratează ca proprietate distinctă."],
    candidates: scored.slice(0, 3),
  };
}
