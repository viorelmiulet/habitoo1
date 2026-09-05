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
