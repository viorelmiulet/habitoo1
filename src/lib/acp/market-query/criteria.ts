/**
 * Criteriile interogării live, derivate determinist din subiectul analizei.
 * Funcții pure: fără rețea, fără bază de date.
 */
import type { AcpSubject } from "../scoring";
import type { MarketQueryCriteria, MarketQuerySourceConfig } from "./port";

/** Raza implicită de căutare (km) și banda de preț (%), configurabile per sursă. */
export const MARKET_QUERY_DEFAULT_RADIUS_KM = 5;
export const MARKET_QUERY_DEFAULT_PRICE_BAND_PERCENT = 40;
/** Toleranța de suprafață în jurul proprietății analizate. */
export const MARKET_QUERY_AREA_BAND_PERCENT = 30;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function marketQueryCriteria(
  subject: AcpSubject,
  options: { radiusKm?: number; priceBandPercent?: number } = {},
): MarketQueryCriteria {
  const radiusKm = finite(options.radiusKm) ?? MARKET_QUERY_DEFAULT_RADIUS_KM;
  const band = finite(options.priceBandPercent) ?? MARKET_QUERY_DEFAULT_PRICE_BAND_PERCENT;
  const price = finite(subject.price);
  const area = finite(subject.usableArea);
  return {
    transactionType: text(subject.transactionType),
    propertyType: text(subject.propertyType),
    city: text(subject.city),
    county: text(subject.county),
    zone: text(subject.neighborhood) ?? text(subject.district),
    rooms: finite(subject.rooms),
    radiusKm,
    priceMin: price !== null && price > 0 ? round2(price * (1 - band / 100)) : null,
    priceMax: price !== null && price > 0 ? round2(price * (1 + band / 100)) : null,
    areaMin:
      area !== null && area > 0
        ? round2(area * (1 - MARKET_QUERY_AREA_BAND_PERCENT / 100))
        : null,
    areaMax:
      area !== null && area > 0
        ? round2(area * (1 + MARKET_QUERY_AREA_BAND_PERCENT / 100))
        : null,
  };
}

/** Criteriile sursei: raza și banda de preț ale sursei suprascriu valorile implicite. */
export function marketQueryCriteriaForSource(
  subject: AcpSubject,
  source: Pick<MarketQuerySourceConfig, "radiusKm" | "priceBandPercent">,
): MarketQueryCriteria {
  return marketQueryCriteria(subject, {
    radiusKm: source.radiusKm,
    priceBandPercent: source.priceBandPercent,
  });
}

/** Cheie stabilă a criteriilor, folosită de cache-ul de sesiune. */
export function marketQueryCriteriaKey(criteria: MarketQueryCriteria): string {
  return [
    criteria.transactionType ?? "",
    criteria.propertyType ?? "",
    criteria.city ?? "",
    criteria.county ?? "",
    criteria.zone ?? "",
    criteria.rooms ?? "",
    criteria.radiusKm,
    criteria.priceMin ?? "",
    criteria.priceMax ?? "",
    criteria.areaMin ?? "",
    criteria.areaMax ?? "",
  ].join("|");
}
