/** Mărimile de pagină acceptate în listele paginate (Anunțuri particulari, Proprietăți). */
export const LIST_PAGE_SIZES = [15, 50, 100, 200] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];
export const DEFAULT_LIST_PAGE_SIZE: ListPageSize = 15;

export function isListPageSize(value: unknown): value is ListPageSize {
  return typeof value === "number" && (LIST_PAGE_SIZES as readonly number[]).includes(value);
}

/** Orice valoare necunoscută (URL vechi, localStorage corupt) revine la implicit. */
export function normalizeListPageSize(value: unknown): ListPageSize {
  const n = typeof value === "string" ? Number(value) : value;
  return isListPageSize(n) ? n : DEFAULT_LIST_PAGE_SIZE;
}

/** „51–100 din 1.240 rezultate” — page este 1-based. */
export function pageRangeLabel(page: number, pageSize: number, total: number): string {
  const fmt = (n: number) => new Intl.NumberFormat("ro-RO").format(n);
  if (total <= 0) return "0 rezultate";
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return `${fmt(from)}–${fmt(to)} din ${fmt(total)} ${total === 1 ? "rezultat" : "rezultate"}`;
}

/** Paginare numerotată: prima, ultima și paginile din jurul celei curente. */
export function pageNumbers(current: number, pages: number): (number | "…")[] {
  const wanted = new Set([1, pages, current - 1, current, current + 1]);
  const list = [...wanted].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of list) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
