/**
 * Helperi puri pentru sursele Apify: identificatorul sursei în bazinul de
 * piață, cheia de lock și estimarea costului.
 */

export const APIFY_SOURCE_PREFIX = "apify:";

/** Identificatorul folosit în `market_listings.source`. */
export function apifyMarketSourceId(key: string): string {
  return `${APIFY_SOURCE_PREFIX}${key}`;
}

export function isApifyMarketSourceId(source: string): boolean {
  return source.startsWith(APIFY_SOURCE_PREFIX);
}

export function apifySourceKeyFromId(source: string): string | null {
  return isApifyMarketSourceId(source) ? source.slice(APIFY_SOURCE_PREFIX.length) : null;
}

/**
 * Costul estimat: numărul maxim de rezultate × prețul anunțat al actorului.
 * Fără preț anunțat nu inventăm o cifră.
 */
export function estimateApifyCost(
  maxItems: number,
  unitCostUsd: number | null,
): number | null {
  if (unitCostUsd === null || !Number.isFinite(unitCostUsd) || unitCostUsd < 0) return null;
  if (!Number.isFinite(maxItems) || maxItems <= 0) return null;
  return Math.round(maxItems * unitCostUsd * 10000) / 10000;
}

/** Prima zi a lunii curente, în UTC — pentru totalul lunar. */
export function monthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function sumCosts(values: readonly (number | null)[]): number {
  let total = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) total += value;
  }
  return Math.round(total * 10000) / 10000;
}
