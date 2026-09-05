import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "habitoo.sidebar.collapsed";

/** Starea (colapsat / extins) a meniului lateral pe desktop, persistată local. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      setCollapsedState(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* stocare indisponibilă */
    }
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* stocare indisponibilă */
    }
  }, []);

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  return { collapsed, setCollapsed, toggle };
}
