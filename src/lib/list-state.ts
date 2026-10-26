export type ListSnapshot = { search: Record<string, unknown>; scroll: number };
export const listStateKey = (userId: string, list: string) => `habitoo.listState.v1.${userId}.${list}`;

export function readListState(storage: Pick<Storage, "getItem">, userId: string, list: string): ListSnapshot | null {
  try {
    const value = JSON.parse(storage.getItem(listStateKey(userId, list)) ?? "null");
    if (!value || !value.search || typeof value.search !== "object" || Array.isArray(value.search)) return null;
    return { search: value.search, scroll: Number.isFinite(value.scroll) ? Math.max(0, value.scroll) : 0 };
  } catch { return null; }
}

export function compactListSearch(search: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(search).filter(([key, value]) => !["new", "nou", "proprietate", "contract"].includes(key) && value !== undefined).sort(([a], [b]) => a.localeCompare(b)));
}

/** Only known primitive fields enter local-list state; action parameters never persist. */
export function validateListSearch<T extends Record<string, string | number | boolean>>(defaults: T, search: Record<string, unknown>): Partial<T> & { new?: boolean } {
  const result: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = search[key];
    if (typeof value === typeof fallback && (typeof value !== "number" || (Number.isFinite(value) && value >= 0))) result[key] = value;
  }
  if (search.new === true || search.new === "true") result.new = true;
  return result as Partial<T> & { new?: boolean };
}