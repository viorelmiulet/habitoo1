/** Filtre pentru modulul „Anunțuri particulari” — logică pură, testabilă. */
export const PRIVATE_LISTINGS_PAGE_SIZE = 24;

/** Sortările disponibile în listă și ordonarea lor în baza de date. */
export const PRIVATE_LISTINGS_SORTS = ["newest", "price_asc", "price_desc", "surface_desc"] as const;
export type PrivateListingsSort = (typeof PRIVATE_LISTINGS_SORTS)[number];

export const PRIVATE_LISTINGS_ORDER: Record<PrivateListingsSort, { column: string; ascending: boolean }> = {
  newest: { column: "scraped_at", ascending: false },
  price_asc: { column: "price", ascending: true },
  price_desc: { column: "price", ascending: false },
  surface_desc: { column: "surface", ascending: false },
};

export type PrivateListingsFilters = {
  city?: string;
  zone?: string;
  rooms?: number[];
  q?: string;
  page?: number;
};

/** Cuvintele cheie, curățate de caracterele cu rol special în filtre. */
export function keywordTerms(q: string | undefined): string[] {
  if (!q) return [];
  return q
    .replace(/[%_,()*\\"'.:]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 6);
}

/** Valoarea 5 înseamnă „5 sau mai multe camere”. */
export function normalizeRooms(rooms: number[] | undefined): number[] {
  return [...new Set((rooms ?? []).filter((r) => Number.isInteger(r) && r >= 1 && r <= 5))].sort();
}

export function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/[%_,()*\\]/g, "").trim();
  return trimmed ? trimmed.slice(0, 80) : undefined;
}
