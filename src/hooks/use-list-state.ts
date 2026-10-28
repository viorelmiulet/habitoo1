import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { compactListSearch, listStateKey, ListRestoreTracker, readListState, type ListSnapshot } from "@/lib/list-state";

const canonicalSnapshot = (snapshot: ListSnapshot | null, canonicalize: (s: Record<string, unknown>) => Record<string, unknown>) =>
  snapshot ? { ...snapshot, search: compactListSearch(canonicalize(snapshot.search)) } : null;

/** URL remains authoritative; storage is consulted only when entering a list. */
export function useListState<T extends Record<string, unknown>>({ list, userId, search, apply, enabled = true, family, ready = true, canonicalize }: {
  list: string; userId?: string; search: T; apply: (search: T) => void;
  enabled?: boolean; family?: string; ready?: boolean;
  /** Maps equivalent searches (e.g. a default tab parameter) to one stored/compared form. */
  canonicalize?: (search: Record<string, unknown>) => Record<string, unknown>;
}) {
  // Single source of truth for the search is the route's `search`; we only wait until navigation settles.
  const pending = useRouterState({ select: (state) => state.status === "pending" });
  const tracker = useRef(new ListRestoreTracker());
  const restoring = useRef<number | null>(null);
  const latest = useRef({ search, apply, canonicalize });
  latest.current = { search, apply, canonicalize };
  const canon = (value: Record<string, unknown>) => compactListSearch((latest.current.canonicalize ?? ((s) => s))(value));
  const serialized = JSON.stringify(canon(search));
  useEffect(() => {
    if (!userId || !enabled) { tracker.current.reset(); return; }
    if (pending) return;
    const identity = listStateKey(userId, list);
    try {
      const c = latest.current.canonicalize ?? ((s: Record<string, unknown>) => s);
      const step = tracker.current.step({
        identity, search: JSON.parse(serialized), scrollY: window.scrollY,
        saved: canonicalSnapshot(readListState(localStorage, userId, list), c),
        familySaved: family ? canonicalSnapshot(readListState(localStorage, userId, family), c) : undefined,
      });
      if (step.action === "restore") { restoring.current = step.scroll; latest.current.apply(step.search as T); return; }
      if (step.scroll !== null) restoring.current = step.scroll;
      if (step.action === "none") return;
      const snapshot = { search: step.snapshot.search, scroll: restoring.current ?? window.scrollY };
      localStorage.setItem(identity, JSON.stringify(snapshot));
      if (family) localStorage.setItem(listStateKey(userId, family), JSON.stringify(snapshot));
    } catch { /* Browser storage may be disabled. URL navigation still works. */ }
  }, [list, userId, enabled, family, serialized, pending]);

  useEffect(() => {
    if (!enabled || !userId || !ready || pending || restoring.current === null) return;
    const target = restoring.current;
    let attempts = 0;
    let stable = 0;
    const timer = window.setInterval(() => {
      window.scrollTo({ top: target, behavior: "instant" });
      attempts += 1;
      stable = Math.abs(window.scrollY - target) < 3 ? stable + 1 : 0;
      if ((attempts >= 10 && stable >= 5) || attempts >= 100) {
        restoring.current = null;
        window.clearInterval(timer);
      }
    }, 100);
    const stop = () => { restoring.current = null; window.clearInterval(timer); };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    return () => { window.clearInterval(timer); window.removeEventListener("wheel", stop); window.removeEventListener("touchstart", stop); };
  }, [enabled, userId, ready, serialized, pending]);

  useEffect(() => {
    if (!userId || !enabled) return;
    const saveScroll = () => {
      if (restoring.current !== null || tracker.current.clearing) return;
      try {
        const snapshot = { search: canon(latest.current.search), scroll: window.scrollY };
        localStorage.setItem(listStateKey(userId, list), JSON.stringify(snapshot));
        if (family) localStorage.setItem(listStateKey(userId, family), JSON.stringify(snapshot));
      } catch { /* Storage unavailable. */ }
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => window.removeEventListener("scroll", saveScroll);
  }, [list, userId, enabled, family]);

  return () => {
    tracker.current.clearing = true;
    restoring.current = null;
    if (!userId) return;
    try {
      localStorage.removeItem(listStateKey(userId, list));
      if (family) localStorage.removeItem(listStateKey(userId, family));
      localStorage.removeItem(`habitoo.perPagina.v1.${list}.${userId}`);
    } catch { /* Storage unavailable. */ }
  };
}
/** Local filter lists use the same URL/storage contract without changing their controls. */
export function useFilterList<T extends Record<string, string | number | boolean>>(list: string, userId: string | undefined, defaults: T, search: Partial<T> & { new?: boolean }, apply: (search: Partial<T> & { new?: boolean }) => void) {
  const state = { ...defaults, ...search } as T;
  const clear = useListState({ list, userId, search, apply });
  const set = <K extends keyof T>(key: K, value: T[K] | ((previous: T[K]) => T[K])) => {
    const next = typeof value === "function" ? value(state[key]) : value;
    const updated = { ...search, [key]: next };
    if (key !== "page" && key !== "view" && key !== "tab" && "page" in defaults) Object.assign(updated, { page: 0 });
    apply(updated);
  };
  return { state, set, reset: () => { clear(); apply({}); } };
}