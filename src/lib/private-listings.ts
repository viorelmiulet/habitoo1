/** Filtre pentru modulul „Anunțuri particulari” — logică pură, testabilă. */
export const PRIVATE_LISTINGS_PAGE_SIZE = 24;

/** Sortările disponibile în listă și ordonarea lor în baza de date. */
export const PRIVATE_LISTINGS_SORTS = ["newest", "price_asc", "price_desc", "surface_desc"] as const;
export type PrivateListingsSort = (typeof PRIVATE_LISTINGS_SORTS)[number];

/**
 * Ordonările după preț/suprafață rămân în baza de date. „Cele mai noi” nu are
 * o singură coloană: ziua `first_seen_at` descrescător, cu sursele intercalate
 * în interiorul zilei (vezi interleaveNewest), calculată în două faze.
 */
export const PRIVATE_LISTINGS_ORDER: Record<Exclude<PrivateListingsSort, "newest">, { column: string; ascending: boolean }> = {
  price_asc: { column: "price", ascending: true },
  price_desc: { column: "price", ascending: false },
  surface_desc: { column: "surface", ascending: false },
};

/** Ordinea fixă a surselor în ciclul de intercalare dintr-o zi. */
export const PRIVATE_LISTINGS_SOURCE_CYCLE = ["storia", "romimo", "olx", "imoradar", "imobiliare"] as const;

export type FirstSeenRow = { id: string; source: string; first_seen_at: string | null };

/**
 * „Cele mai noi”: ziua `first_seen_at` (UTC) descrescător; în aceeași zi,
 * anunțurile se intercalează pe surse în ordinea ciclului, ca fiecare pagină
 * să conțină toate sursele cu anunțuri în ziua respectivă. În interiorul
 * unei surse, cel mai recent primul. Sursele necunoscute vin la finalul ciclului.
 */
export function interleaveNewest<T extends FirstSeenRow>(rows: T[]): T[] {
  const byDay = new Map<string, T[]>();
  for (const row of rows) {
    const day = (row.first_seen_at ?? "").slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort().reverse();
  const out: T[] = [];
  for (const day of days) {
    const dayRows = byDay.get(day) ?? [];
    const buckets = new Map<string, T[]>();
    for (const row of dayRows) {
      const list = buckets.get(row.source) ?? [];
      list.push(row);
      buckets.set(row.source, list);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => (b.first_seen_at ?? "").localeCompare(a.first_seen_at ?? ""));
    }
    const cycle = [
      ...PRIVATE_LISTINGS_SOURCE_CYCLE.filter((source) => buckets.has(source)),
      ...[...buckets.keys()].filter(
        (source) => !(PRIVATE_LISTINGS_SOURCE_CYCLE as readonly string[]).includes(source),
      ),
    ];
    let remaining = dayRows.length;
    while (remaining > 0) {
      for (const source of cycle) {
        const row = buckets.get(source)?.shift();
        if (row) {
          out.push(row);
          remaining -= 1;
        }
      }
    }
  }
  return out;
}

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
