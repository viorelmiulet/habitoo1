/**
 * Analiza cererii pe piață pentru raportul ACP — funcții PURE.
 *
 * Numără cererile active care se potrivesc cu proprietatea analizată, pe trei
 * surse (proprii / rețea Habitoo / Facebook) și două niveluri (exactă /
 * flexibilă). Fiecare cerere e numărată o singură dată; exacta are prioritate.
 * Cifrele se calculează la generarea raportului și sunt înghețate în PDF.
 * Regulile de tip și de localitate/zonă refolosesc pe cele ale potrivirilor
 * Facebook (`propertyTypeKey`, `requestPlaceRelation`).
 */
import { propertyTypeKey, requestPlaceRelation, type PropertyForMatch } from "../../social-requests";

export type DemandSource = "own" | "network" | "facebook";

/** Formă comună pentru `requests` și `social_requests`. */
export type DemandRequest = {
  transaction: "sale" | "rent" | null;
  propertyType: string | null;
  roomsMin: number | null;
  roomsMax: number | null;
  surfaceMin: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  county: string | null;
  cities: string[];
  zones: string[];
};

export type DemandProperty = {
  transaction: "sale" | "rent" | null;
  propertyType: string | null;
  rooms: number | null;
  usableArea: number | null;
  price: number | null;
  currency: string | null;
  county: string | null;
  city: string | null;
  district: string | null;
  title?: string | null;
  address?: string | null;
};

export type DemandCounts = { own: number; network: number; facebook: number; total: number };
export type AcpReportDemand = {
  exact: DemandCounts;
  flexible: DemandCounts;
  /** null când nu există nicio cerere potrivită. */
  score: number | null;
  scoreLabel: "Scăzut" | "Mediu" | "Ridicat" | null;
  asOf: string;
};

export const DEMAND_FLEX_PRICE = 0.2;
export const DEMAND_FLEX_SURFACE = 0.15;
export const DEMAND_FLEX_ROOMS = 1;

/** Singurul loc cu formula scorului de interes. */
export function demandInterestScore(exact: number, flexible: number): { score: number; label: "Scăzut" | "Mediu" | "Ridicat" } | null {
  if (exact + flexible <= 0) return null;
  const score = Math.min(10, Math.round(exact + 0.5 * flexible));
  return { score, label: score <= 3 ? "Scăzut" : score <= 6 ? "Mediu" : "Ridicat" };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toMatchProperty(p: DemandProperty): PropertyForMatch {
  return {
    transaction_kind: p.transaction ?? "sale", property_type: p.propertyType, rooms: p.rooms,
    price: p.price, currency: p.currency, county: p.county, city: p.city, district: p.district,
    title: p.title ?? null, address: p.address ?? null,
  };
}

function placeOk(r: DemandRequest, mp: PropertyForMatch, withZones: boolean): boolean {
  if (!r.cities.length) {
    return !r.county || requestPlaceRelation({ county: r.county, city: null, zones: [] }, mp)?.rel === "strict";
  }
  return r.cities.some((city) =>
    requestPlaceRelation({ county: r.county, city, zones: withZones ? r.zones : [] }, mp)?.rel === "strict");
}

/** "exact" / "flexible" / null. Câmpurile lipsă din cerere nu restrâng. */
export function classifyDemand(r: DemandRequest, p: DemandProperty): "exact" | "flexible" | null {
  if (r.transaction && p.transaction && r.transaction !== p.transaction) return null;
  if (r.transaction && !p.transaction) return null;
  if (r.propertyType && propertyTypeKey(r.propertyType) !== propertyTypeKey(p.propertyType)) return null;
  const mp = toMatchProperty(p);
  const check = (flex: boolean): boolean => {
    const rooms = num(p.rooms), area = num(p.usableArea), price = num(p.price);
    const d = flex ? DEMAND_FLEX_ROOMS : 0;
    if (r.roomsMin !== null || r.roomsMax !== null) {
      if (rooms === null) return false;
      if (r.roomsMin !== null && rooms < r.roomsMin - d) return false;
      if (r.roomsMax !== null && rooms > r.roomsMax + d) return false;
    }
    if (r.surfaceMin !== null) {
      if (area === null || area < r.surfaceMin * (flex ? 1 - DEMAND_FLEX_SURFACE : 1)) return false;
    }
    if (r.budgetMin !== null || r.budgetMax !== null) {
      const same = (r.currency ?? "EUR").toUpperCase() === (p.currency ?? "EUR").toUpperCase();
      if (price === null || !same) return false;
      const f = flex ? DEMAND_FLEX_PRICE : 0;
      if (r.budgetMin !== null && price < r.budgetMin * (1 - f)) return false;
      if (r.budgetMax !== null && price > r.budgetMax * (1 + f)) return false;
    }
    return placeOk(r, mp, !flex);
  };
  if (check(false)) return "exact";
  if (check(true)) return "flexible";
  return null;
}

/** Numără o singură dată fiecare cerere (după id), pe surse. */
export function countDemand(
  property: DemandProperty,
  requests: { id: string; source: DemandSource; request: DemandRequest }[],
  asOf: string,
): AcpReportDemand {
  const zero = (): DemandCounts => ({ own: 0, network: 0, facebook: 0, total: 0 });
  const exact = zero(), flexible = zero();
  const seen = new Set<string>();
  for (const item of requests) {
    const key = `${item.source}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = classifyDemand(item.request, property);
    if (!kind) continue;
    const bucket = kind === "exact" ? exact : flexible;
    bucket[item.source]++;
    bucket.total++;
  }
  const s = demandInterestScore(exact.total, flexible.total);
  return { exact, flexible, score: s?.score ?? null, scoreLabel: s?.label ?? null, asOf };
}

/** Rând `requests` → DemandRequest. */
export function demandFromCrmRequest(row: {
  kind: string | null; property_type: string | null; rooms_min: number | null; rooms_max: number | null;
  surface_min: number | null; budget_min: number | null; budget_max: number | null; currency: string | null;
  cities: string[] | null; areas: string[] | null;
}): DemandRequest {
  return {
    transaction: row.kind === "rent" ? "rent" : row.kind ? "sale" : null,
    propertyType: row.property_type, roomsMin: num(row.rooms_min), roomsMax: num(row.rooms_max),
    surfaceMin: num(row.surface_min), budgetMin: num(row.budget_min), budgetMax: num(row.budget_max),
    currency: row.currency, county: null, cities: (row.cities ?? []).filter(Boolean), zones: (row.areas ?? []).filter(Boolean),
  };
}

/** Rând `social_requests` → DemandRequest. */
export function demandFromSocialRequest(row: {
  transaction_type: string | null; property_type: string | null; rooms: number | null;
  budget_min: number | null; budget_max: number | null; currency: string | null;
  county: string | null; city: string | null; zones: string[] | null;
}): DemandRequest {
  const rooms = num(row.rooms);
  return {
    transaction: row.transaction_type === "inchiriere" ? "rent" : row.transaction_type === "cumparare" ? "sale" : null,
    propertyType: row.property_type, roomsMin: rooms, roomsMax: rooms, surfaceMin: null,
    budgetMin: num(row.budget_min), budgetMax: num(row.budget_max), currency: row.currency,
    county: row.county, cities: row.city ? [row.city] : [], zones: (row.zones ?? []).filter(Boolean),
  };
}
