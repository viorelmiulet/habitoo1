/** HomeDirect.ro: URL-urile permise și cheia CRM (doar pe server, din secrete). */
export const HOMEDIRECT_PORTAL_KEY = "homedirect";
export const HOMEDIRECT_PROD_URL = "https://www.homedirect.ro/api/crm/v1";
export const HOMEDIRECT_DEV_URL = "https://dev.homedirect.ro/api/crm/v1";
export const HOMEDIRECT_KEY_MISSING_MESSAGE = "Cheia CRM HomeDirect nu este configurată pe server.";
export const HOMEDIRECT_BASE_URL_INVALID_MESSAGE =
  "HOMEDIRECT_API_BASE_URL are o valoare nepermisă: sunt acceptate doar https://www.homedirect.ro/api/crm/v1 și https://dev.homedirect.ro/api/crm/v1.";

export type HomedirectEnvironment = "production" | "development";
export const HOMEDIRECT_ENVIRONMENT_LABEL: Record<HomedirectEnvironment, string> = {
  production: "Producție",
  development: "Dezvoltare",
};

/** Lipsă/gol = producție; doar cele două URL-uri documentate sunt acceptate. */
export function resolveHomedirectBaseUrl(
  raw: string | null | undefined,
): { ok: true; url: string; environment: HomedirectEnvironment } | { ok: false; message: string } {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  if (!v || v === HOMEDIRECT_PROD_URL) return { ok: true, url: HOMEDIRECT_PROD_URL, environment: "production" };
  if (v === HOMEDIRECT_DEV_URL) return { ok: true, url: HOMEDIRECT_DEV_URL, environment: "development" };
  return { ok: false, message: HOMEDIRECT_BASE_URL_INVALID_MESSAGE };
}

/** Cheia CRM din secrete; `null` dacă lipsește. Nu se loghează niciodată. */
export function readHomedirectKey(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env["HOMEDIRECT_CRM_API_KEY"];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function hasHomedirectKey(env: Record<string, string | undefined> = process.env): boolean {
  return readHomedirectKey(env) !== null;
}

/** HomeDirect fără cheie CRM pe server → „Deconectat” peste tot. Alte portaluri: `false`. */
export function homedirectKeyMissing(portalId: string, env: Record<string, string | undefined> = process.env): boolean {
  return portalId === HOMEDIRECT_PORTAL_KEY && !hasHomedirectKey(env);
}
