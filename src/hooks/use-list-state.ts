import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { compactListSearch, listStateKey, readListState } from "@/lib/list-state";

/** URL remains authoritative; storage is consulted only when entering a list. */
export function useListState<T extends Record<string, unknown>>({ list, userId, search, apply, enabled = true, family, ready = true }: {
  list: string; userId?: string; search: T; apply: (search: T) => void;
  enabled?: boolean; family?: string; ready?: boolean;
}) {
  const location = useLocation();
  const active = useRef("");
  const restoring = useRef<number | null>(null);
  const latest = useRef({ search, apply });
  latest.current = { search, apply };
  const serialized = JSON.stringify(compactListSearch(search));
  useEffect(() => {
    if (!userId || !enabled) { active.current = ""; return; }
    const identity = listStateKey(userId, list);
    try {
      const entering = active.current !== identity;
      active.current = identity;
      const explicit = Object.keys(compactListSearch(location.search)).some((key) => key !== "lista");
      let saved = readListState(localStorage, userId, list);
      if (entering && !explicit && family && !location.search.lista) saved = readListState(localStorage, userId, family) ?? saved;
      if (entering && saved) {
        if (!explicit || JSON.stringify(saved.search) === serialized) restoring.current = saved.scroll;
        if (!explicit && JSON.stringify(saved.search) !== serialized) {
          latest.current.apply(saved.search as T);
          return;
        }
      }
      const snapshot = { search: JSON.parse(serialized), scroll: restoring.current ?? window.scrollY };
      localStorage.setItem(identity, JSON.stringify(snapshot));
      if (family) localStorage.setItem(listStateKey(userId, family), JSON.stringify(snapshot));
    } catch { /* Browser storage may be disabled. URL navigation still works. */ }
  }, [list, userId, enabled, family, serialized, location.search]);

  useEffect(() => {
    if (!enabled || !userId || !ready || restoring.current === null) return;
    const target = restoring.current;
    let attempts = 0;
    const timer = window.setInterval(() => {
      window.scrollTo({ top: target, behavior: "instant" });
      if (Math.abs(window.scrollY - target) < 3 || ++attempts >= 50) {
        restoring.current = null;
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [enabled, userId, ready, serialized]);

  useEffect(() => {
    if (!userId || !enabled) return;
    const saveScroll = () => {
      if (restoring.current !== null) return;
      try {
        const snapshot = { search: compactListSearch(latest.current.search), scroll: window.scrollY };
        localStorage.setItem(listStateKey(userId, list), JSON.stringify(snapshot));
        if (family) localStorage.setItem(listStateKey(userId, family), JSON.stringify(snapshot));
      } catch { /* Storage unavailable. */ }
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => window.removeEventListener("scroll", saveScroll);
  }, [list, userId, enabled, family]);

  return () => {
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