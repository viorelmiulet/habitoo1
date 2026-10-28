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
export type ListRestoreStep =
  | { action: "restore"; search: Record<string, unknown>; scroll: number }
  | { action: "save"; snapshot: ListSnapshot; scroll: number | null }
  | { action: "none"; scroll: number | null };

/**
 * Pure decision logic for list-state restoration. Inputs must already be canonical
 * (see the hook's `canonicalize`), so equivalent URLs never trigger a navigation.
 * A restore runs at most once per entry; the navigation it causes is never treated
 * as a fresh entry, which prevents restore/save ping-pong.
 */
export class ListRestoreTracker {
  private active = "";
  private previous = "";
  private pending: string | null = null;
  private restored = false;
  clearing = false;
  reset() { this.active = ""; }
  step(input: { identity: string; search: Record<string, unknown>; saved: ListSnapshot | null; familySaved?: ListSnapshot | null; scrollY: number }): ListRestoreStep {
    const search = compactListSearch(input.search);
    const serialized = JSON.stringify(search);
    const explicit = Object.keys(search).some((key) => key !== "lista");
    const save = (scroll: number | null): ListRestoreStep => ({ action: "save", snapshot: { search: JSON.parse(serialized), scroll: scroll ?? input.scrollY }, scroll });
    if (this.pending !== null && this.active === input.identity) {
      const landed = this.pending === serialized;
      this.pending = null;
      if (landed) { this.previous = serialized; return save(null); }
    }
    const firstEntry = this.active === "";
    if (this.active !== input.identity) this.restored = false;
    if (explicit) this.restored = false;
    const bare = !explicit && this.previous !== serialized;
    const suppress = this.clearing;
    const entering = this.active !== input.identity || (bare && !suppress);
    this.previous = serialized;
    if (bare) this.clearing = false;
    this.active = input.identity;
    let saved = input.saved;
    if (firstEntry && !explicit && input.familySaved !== undefined && !search.lista) saved = input.familySaved ?? saved;
    let scroll: number | null = null;
    if (entering && saved && !suppress && !this.restored) {
      const savedSerialized = JSON.stringify(compactListSearch(saved.search));
      if (!explicit || savedSerialized === serialized) scroll = saved.scroll;
      if (!explicit && savedSerialized !== serialized) {
        this.restored = true;
        this.pending = savedSerialized;
        return { action: "restore", search: compactListSearch(saved.search), scroll: saved.scroll };
      }
    }
    if (suppress && !bare) return { action: "none", scroll };
    return save(scroll);
  }
}
