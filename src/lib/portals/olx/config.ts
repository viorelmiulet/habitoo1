/**
 * Constante OLX.ro Partner API 2.0 (https://www.olx.ro/api/partner).
 * Fără secrete: `OLXRO_CLIENT_ID` / `OLXRO_CLIENT_SECRET` se citesc doar server-side.
 */
export const OLX_DIRECT_PORTAL_ID = "olx_direct";
export const OLXRO_HOST = "www.olx.ro";
export const OLXRO_AUTHORIZE_URL = `https://${OLXRO_HOST}/oauth/authorize/`;
export const OLXRO_TOKEN_URL = `https://${OLXRO_HOST}/api/open/oauth/token`;
export const OLXRO_PARTNER_BASE = `https://${OLXRO_HOST}/api/partner`;
/** Callback înregistrat la OLX — exact acest URL, trimis și la schimbul de cod. */
export const OLXRO_REDIRECT_URI = "https://crm.habitoo.ro/api/public/portal/v1/olx/oauth/callback";
export const OLXRO_SCOPE_AUTHORIZE = "read write v2";
export const OLXRO_SCOPE_TOKEN = "v2 read write";
/** `state` și codul de autorizare sunt valabile 10 minute. */
export const OLXRO_STATE_TTL_MS = 10 * 60 * 1000;
export const OLXRO_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
export const OLXRO_USER_AGENT = "Habitoo-CRM/1.0 (+https://www.habitoo.ro)";

/**
 * Habitoo nu cumpără niciodată pachete sau promovări pe OLX.
 * Orice POST către aceste căi este blocat înainte de rețea.
 */
export function isForbiddenOlxPurchase(method: string, path: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const p = path.split("?")[0]!.replace(/\/+$/, "");
  return (
    /^\/packets(\/|$)/.test(p) ||
    /^\/users\/me\/packets(\/|$)/.test(p) ||
    /^\/adverts\/[^/]+\/packets(\/|$)/.test(p) ||
    /(^|\/)paid-features(\/|$)/.test(p)
  );
}
