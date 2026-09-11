// Id-ul sesiunii de impersonare ținut în browser. Nu este un secret și nu acordă
// nicio putere singur: serverul revalidează la fiecare apel dacă sesiunea e
// aprobată și neexpirată.
const KEY = "habitoo.impersonation.v1";

export function getImpersonationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setImpersonationId(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* ignorat: modul privat */
  }
}

export function clearImpersonationId() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignorat */
  }
}

/** Timp rămas, formatat „3h 12m” / „12m 05s”. */
export function formatRemaining(expiresAt: string, now: number = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "expirat";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
