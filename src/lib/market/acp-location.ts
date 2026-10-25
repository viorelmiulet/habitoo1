import { normalizePlace, normalizePropertyType, normalizeTransactionType } from "./normalize";

/**
 * Orașe de forma „București Sector 6" / „Bucureşti Sectorul 6" / „Sector 6"
 * (cu ş sau ș) înseamnă orașul București + sectorul N.
 */
const SECTOR_CITY_PATTERN = /^(?:bucuresti )?sector(?:ul)? ([1-6])$/;

/** Sub acest număr de oferte potrivite în sector, căutarea se extinde la tot orașul. */
export const MARKET_SECTOR_MIN_MATCHES = 8;

export function marketPoolScope(target: { city?: string | null; sector?: string | null; propertyType?: string | null; transactionType?: string | null }) {
  const city = normalizePlace(target.city);
  const citySector = city?.match(SECTOR_CITY_PATTERN);
  const sector =
    normalizePlace(target.sector)?.replace("sectorul", "sector") ??
    (citySector ? `sector ${citySector[1]}` : null);
  return {
    city: sector ? "bucuresti" : city,
    sector,
    propertyType: normalizePropertyType(target.propertyType),
    transactionType: normalizeTransactionType(target.transactionType),
  };
}

/**
 * Regula de extindere: cu mai puțin de MARKET_SECTOR_MIN_MATCHES oferte în
 * sector, filtrul de sector se renunță și căutarea acoperă tot orașul.
 */
export function expandSectorFilters<T extends { sector?: string | null }>(
  filters: T,
  matchedCount: number,
): T {
  if (!filters.sector || matchedCount >= MARKET_SECTOR_MIN_MATCHES) return filters;
  return { ...filters, sector: null };
}

/** Shared geography filter, independent of private/agency classification. */
export function applyMarketLocationFilters<T extends {
  eq: (column: string, value: string) => T;
  or: (expression: string) => T;
}>(query: T, filters: { city?: string | null; sector?: string | null; neighborhood?: string | null; area?: string | null }): T {
  const scope = marketPoolScope(filters);
  let out = query;
  if (scope.city === "bucuresti") {
    out = out.or("normalized_city.eq.bucuresti,normalized_city.in.(sector 1,sector 2,sector 3,sector 4,sector 5,sector 6,sectorul 1,sectorul 2,sectorul 3,sectorul 4,sectorul 5,sectorul 6)");
  } else if (scope.city) out = out.eq("normalized_city", scope.city);
  if (scope.sector) {
    const sector = scope.sector.replace(/[(),.%]/g, " ").trim();
    out = out.or(`sector.ilike.${sector},normalized_city.eq.${sector},normalized_city.eq.${sector.replace("sector", "sectorul")}`);
  }
  const neighborhood = normalizePlace(filters.neighborhood);
  if (neighborhood) out = out.eq("normalized_neighborhood", neighborhood);
  if (filters.area?.trim()) {
    const term = `%${filters.area.replace(/[(),.%]/g, " ").trim()}%`;
    out = out.or(`sector.ilike.${term},district.ilike.${term},neighborhood.ilike.${term},address.ilike.${term}`);
  }
  return out;
}
