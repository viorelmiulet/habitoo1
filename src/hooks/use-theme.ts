import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "habitoo.theme";
const EVENT = "habitoo:theme";

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

function resolve(pref: ThemePreference): "light" | "dark" {
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Tema aplicației CRM (light / dark / system). Clasa `dark` este aplicată pe
 * <html> DOAR cât timp este montată o zonă autentificată (vezi `useApplyTheme`
 * în AppShell), astfel încât site-ul public rămâne neschimbat.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>("light");

  useEffect(() => {
    setPreferenceState(readPreference());
    const onChange = () => setPreferenceState(readPreference());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* stocare indisponibilă */
    }
    setPreferenceState(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { preference, setPreference, resolved: resolve(preference) };
}

/** Aplică tema pe <html> cât timp componenta apelantă este montată. */
export function useApplyTheme() {
  const { preference } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const mode = resolve(readPreference());
      root.classList.toggle("dark", mode === "dark");
      root.style.colorScheme = mode;
    };
    apply();
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", apply);
    return () => {
      mql.removeEventListener("change", apply);
      root.classList.remove("dark");
      root.style.colorScheme = "";
    };
  }, [preference]);
}
