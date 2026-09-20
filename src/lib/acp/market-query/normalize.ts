/**
 * Normalizarea comună a comparabilelor primite de la surse.
 *
 * Doar câmpurile pe care o analiză salvată are dreptul să păstreze: preț,
 * monedă, suprafață, camere, localitate, zonă, data anunțului și adresa
 * anunțului. Ce lipsește rămâne gol — niciodată ghicit. Un comparabil fără preț
 * sau fără suprafață este eliminat: fără ele nu poate susține o evaluare.
 */
import type { MarketQueryComparable, MarketQueryRawComparable } from "./port";

/** Singurele chei permise în datele persistate ale unui comparabil live. */
export const MARKET_QUERY_PERSISTED_FIELDS = [
  "price",
  "currency",
  "area",
  "rooms",
  "locality",
  "zone",
  "latitude",
  "longitude",
  "listedAt",
  "url",
] as const;

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "").replace(",", ".");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function currency(value: unknown): string | null {
  const raw = text(value);
  return raw ? raw.toUpperCase().slice(0, 8) : null;
}

/** Coordonată validă, altfel gol. Zero este tratat ca lipsă. */
function coordinate(value: unknown, limit: number): number | null {
  const parsed = num(value);
  if (parsed === null || parsed === 0) return null;
  return Math.abs(parsed) <= limit ? parsed : null;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function url(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Un comparabil brut → normalizat, sau `null` dacă nu e utilizabil. */
export function normalizeMarketQueryComparable(
  raw: MarketQueryRawComparable,
): MarketQueryComparable | null {
  const price = num(raw.price);
  const area = num(raw.area);
  if (price === null || price <= 0) return null;
  if (area === null || area <= 0) return null;
  const rooms = num(raw.rooms);
  return {
    price,
    currency: currency(raw.currency),
    area,
    rooms: rooms !== null && rooms > 0 ? Math.round(rooms) : null,
    locality: text(raw.locality),
    zone: text(raw.zone),
    latitude: coordinate(raw.latitude, 90),
    longitude: coordinate(raw.longitude, 180),
    listedAt: isoDate(raw.listedAt),
    url: url(raw.url),
  };
}

export function normalizeMarketQueryComparables(
  rows: readonly MarketQueryRawComparable[],
): MarketQueryComparable[] {
  const out: MarketQueryComparable[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const normalized = normalizeMarketQueryComparable(row);
    if (!normalized) continue;
    const key =
      normalized.url ??
      `${normalized.price}|${normalized.area}|${normalized.locality ?? ""}|${normalized.zone ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}
