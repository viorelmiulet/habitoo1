/**
 * Separarea domeniilor: site public (habitoo.ro) vs aplicația CRM (crm.habitoo.ro).
 * Doar logică de host/rutare — nu atinge auth, RLS, RBAC sau datele.
 */
export const PUBLIC_SITE_HOST = "www.habitoo.ro";
export const CRM_HOST = "crm.habitoo.ro";

export const PUBLIC_SITE_URL = `https://${PUBLIC_SITE_HOST}`;
export const CRM_URL = `https://${CRM_HOST}`;

/** Host-uri care servesc aplicația CRM (subdomeniul crm.* pe orice mediu). */
export function isCrmHostname(host?: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  return h === CRM_HOST || h.startsWith("crm.");
}

/** Host-urile care servesc STRICT site-ul public de marketing. */
export const PUBLIC_SITE_HOSTS = ["habitoo.ro", "www.habitoo.ro"] as const;

export function isPublicHostname(host?: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  return (PUBLIC_SITE_HOSTS as readonly string[]).includes(h);
}

/** Rutele care aparțin exclusiv aplicației CRM (auth + zone autentificate). */
const CRM_PATH_RE =
  /^\/(login|register|forgot-password|reset-password|auth\/callback|app|superadmin|onboarding)(\/|$)/;

export function isCrmPath(pathname?: string | null): boolean {
  if (!pathname) return false;
  return CRM_PATH_RE.test(pathname);
}

/** URL absolut pe domeniul CRM. */
export function getCrmUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${CRM_URL}${p}`;
}

/**
 * URL absolut pentru fluxurile de autentificare (callback, reset parolă,
 * confirmare email, Google OAuth). Pe domeniile de producție forțează
 * domeniul CRM; pe preview/local rămâne same-origin ca să nu rupă testarea.
 */
export function authUrl(path: string): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (isPublicHostname(host) || isCrmHostname(host)) return getCrmUrl(path);
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return getCrmUrl(path);
}

/** Mută navigarea pe domeniul CRM (client-side), fără bucle pe crm.*. */
export function redirectToCrm(path = "/"): boolean {
  if (typeof window === "undefined") return false;
  if (isCrmHostname(window.location.hostname)) return false;
  window.location.replace(getCrmUrl(path));
  return true;
}

/**
 * Normalizează o destinație internă la o cale relativă sigură (same-origin).
 * Blochează URL-uri absolute, protocol-relative și rute de autentificare
 * (care ar crea bucle de redirect).
 */
export function safeInternalPath(value?: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/^\/(login|register|auth\/callback|forgot-password|reset-password)(\/|\?|$)/.test(value)) {
    return null;
  }
  return value;
}
