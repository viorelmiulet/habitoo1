const DAY_MS = 86_400_000;

/** Age since first observation, not traffic or a confirmed time-to-sale. */
export function listingAgeDays(firstSeenAt: string | null | undefined, now = Date.now()): number | null {
  const first = firstSeenAt ? Date.parse(firstSeenAt) : NaN;
  if (!Number.isFinite(first) || first > now) return null;
  return Math.floor((now - first) / DAY_MS);
}

export type ListingAgeFilters = { daysOnMarketMin?: number | null; daysOnMarketMax?: number | null };

export function matchesListingAge(firstSeenAt: string | null | undefined, filters: ListingAgeFilters, now = Date.now()): boolean {
  if (filters.daysOnMarketMin == null && filters.daysOnMarketMax == null) return true;
  const age = listingAgeDays(firstSeenAt, now);
  if (age === null) return false;
  return (filters.daysOnMarketMin == null || age >= filters.daysOnMarketMin) &&
    (filters.daysOnMarketMax == null || age <= filters.daysOnMarketMax);
}

export function applyListingAgeFilters<T extends {
  lte: (column: string, value: string) => T;
  gt: (column: string, value: string) => T;
}>(query: T, filters: ListingAgeFilters, now = Date.now()): T {
  if (filters.daysOnMarketMin == null && filters.daysOnMarketMax == null) return query;
  let out = query.lte("first_seen_at", new Date(now - (filters.daysOnMarketMin ?? 0) * DAY_MS).toISOString());
  if (filters.daysOnMarketMax != null) {
    out = out.gt("first_seen_at", new Date(now - (filters.daysOnMarketMax + 1) * DAY_MS).toISOString());
  }
  return out;
}