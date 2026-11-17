import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "habitoo.theme";
const EVENT = "habitoo:theme";
/** Tema implicită a CRM-ului: „Deep Space” (întunecată). */
export const DEFAULT_THEME: ThemePreference = "dark";
/** Scope-ul tokenurilor „Deep Space”, aplicat pe <html> împreună cu `dark`. */
export const APP_DEEP_CLASS = "app-deep";

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" || v === "system" ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function resolve(pref: ThemePreference): "light" | "dark" {
  if (pref !== "system") return pref;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Tema aplicației CRM (light / dark / system). Clasa `dark` este aplicată pe
 * <html> DOAR cât timp este montată o zonă autentificată (vezi `useApplyTheme`
 * în AppShell), astfel încât site-ul public rămâne neschimbat.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME);

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
      root.classList.toggle(APP_DEEP_CLASS, mode === "dark");
      root.style.colorScheme = mode;
    };
    apply();
    const mql = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    mql?.addEventListener("change", apply);
    return () => {
      mql?.removeEventListener("change", apply);
      root.classList.remove("dark");
      root.classList.remove(APP_DEEP_CLASS);
      root.style.colorScheme = "";
    };
  }, [preference]);
}
