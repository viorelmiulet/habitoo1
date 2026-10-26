/** Filtre pentru modulul „Anunțuri particulari” — logică pură, testabilă. */
/** Mărimea implicită a paginii (aceeași cu cea din selectorul comun). */
export const PRIVATE_LISTINGS_PAGE_SIZE = 15;

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
export const PRIVATE_LISTINGS_SOURCE_CYCLE = ["storia", "romimo", "olx", "imoradar", "imobiliare", "anuntul", "facebook"] as const;

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

/** Opțiunile „Zile în piață”: 0 = De azi, apoi ultimele 2/3/7 zile. */
export const PRIVATE_LISTINGS_DAYS = [0, 2, 3, 7] as const;

/** Începutul zilei curente în fusul României, ca dată UTC. */
export function romaniaTodayStart(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Bucharest",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const offsetMs =
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) -
    now.getTime();
  const local = new Date(now.getTime() + offsetMs);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs);
}

/** Pragul `first_seen_at` pentru „Zile în piață”: N zile include ziua curentă. */
export function daysCutoff(days: number, now: Date = new Date()): string {
  const start = romaniaTodayStart(now);
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));
  return start.toISOString();
}

/** Taburile de categorie înlocuiesc filtrul „Tip proprietate” (valori românești în date). */
export const PRIVATE_LISTINGS_CATEGORIES = ["apartamente", "case", "comerciale", "terenuri"] as const;
export type PrivateListingsCategory = (typeof PRIVATE_LISTINGS_CATEGORIES)[number];

export const PRIVATE_LISTINGS_CATEGORY_FILTERS: Record<PrivateListingsCategory, string> = {
  apartamente: "property_type.ilike.%apart%",
  case: "property_type.ilike.%cas%",
  comerciale: "property_type.ilike.%comercial%,property_type.ilike.%birou%,property_type.ilike.%garaj%",
  terenuri: "property_type.ilike.%teren%",
};
