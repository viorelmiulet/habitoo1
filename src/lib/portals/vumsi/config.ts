/** Vumsi.com (API Orion): URL-ul fix și cheia de partener Habitoo (doar pe server, din secrete). */
export const VUMSI_PORTAL_KEY = "vumsi";
export const VUMSI_BASE_URL = "https://vumsi.com/api/orion";
export const VUMSI_KEY_MISSING_MESSAGE = "Cheia de partener Vumsi nu este configurată pe server.";

/** Cheia de partener din `VUMSI_API_KEY`; `null` dacă lipsește. Nu se loghează niciodată. */
export function readVumsiKey(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env["VUMSI_API_KEY"];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function hasVumsiKey(env: Record<string, string | undefined> = process.env): boolean {
  return readVumsiKey(env) !== null;
}

/** Vumsi fără cheie pe server → „Deconectat”. Alte portaluri: `false`. */
export function vumsiKeyMissing(portalId: string, env: Record<string, string | undefined> = process.env): boolean {
  return portalId === VUMSI_PORTAL_KEY && !hasVumsiKey(env);
}
