// „Site-ul agenției”: portal privat per agenție, citit prin feedul /api/public/sites/v1.
// Modul pur (fără acces la DB), folosit de server, UI și teste.

export const AGENCY_SITE_PORTAL_KEY = "agency_site";
export const AGENCY_SITE_LABEL = "Site-ul agenției";

/** Tokenul de site e acceptat doar când site-ul agenției există și este activ. */
export function agencySiteAccepts(site: { active?: boolean | null } | null | undefined): boolean {
  return site?.active === true;
}

/** Cheia de selecție per anunț aplicată feedului (portal sau site-ul agenției). */
export function feedSelectionPortal(auth: { portal: string | null; selectionPortal?: string }): string | null {
  return auth.portal ?? auth.selectionPortal ?? null;
}

/** Adresa site-ului: doar https, fără credențiale; `null` = necompletată. */
export function normalizeAgencySiteUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Adresa site-ului nu este validă.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("Adresa site-ului trebuie să înceapă cu https://.");
  }
  return url.toString().replace(/\/$/, "");
}

export function agencySiteDisplayName(displayName: string | null | undefined, agencyName?: string | null): string {
  return (displayName ?? "").trim() || (agencyName ?? "").trim() || AGENCY_SITE_LABEL;
}

export function agencySiteRowLabel(displayName: string): string {
  return `${AGENCY_SITE_LABEL} — ${displayName}`;
}

export function agencySiteStatusLabel(enabled: boolean): string {
  return enabled ? "Publicat pe site" : "Retras de pe site";
}
