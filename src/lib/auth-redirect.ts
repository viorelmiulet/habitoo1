import { safeInternalPath } from "@/lib/host";

const KEY = "habitoo.postLoginRedirect";

/** Reține destinația CRM cerută înainte de un flux OAuth (doar în tab-ul curent). */
export function rememberPostLoginRedirect(path?: string | null) {
  const safe = safeInternalPath(path);
  try {
    if (safe) sessionStorage.setItem(KEY, safe);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* sessionStorage indisponibil */
  }
}

/** Consumă destinația reținută; întoarce null dacă nu există una validă. */
export function takePostLoginRedirect(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return safeInternalPath(value);
  } catch {
    return null;
  }
}
