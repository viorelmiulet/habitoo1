/**
 * Linkul public al anunțului pe portal, pentru rezumatele cu logo-uri
 * („Publicat pe N portaluri” din lista de proprietăți, carduri, celule).
 *
 * Sursa linkului este exclusiv `portal_listings.public_url`, salvat la
 * publicare din răspunsul real al portalului. Nu construim și nu ghicim
 * linkuri: portalurile care nu întorc un link public (ClickImob, iMove,
 * Properstar) rămân neclicabile, cu tooltip explicativ.
 */

/** Stările în care anunțul este efectiv vizibil pe portal. */
const LINKABLE_STATES = new Set(["published", "in_feed"]);

export type PortalListingLinkInput = {
  portalId: string;
  portalName: string;
  /** Starea derivată a celulei (PortalSelectionState). */
  state: string;
  publicUrl: string | null;
};

export type PortalListingLink = {
  /** URL https sigur, sau null când logo-ul rămâne neclicabil. */
  href: string | null;
  /**
   * Tooltipul linkului, sau null când anunțul nu e publicat și apelantul
   * păstrează tooltipul de stare existent.
   */
  tooltip: string | null;
};

/** Acceptăm doar URL-uri https absolute; orice altceva este ignorat. */
export function safeListingUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Decide dacă logo-ul portalului din rezumat este link către anunț.
 *
 * - publicat + public_url valid → link cu tooltip „Vezi anunțul pe <portal>”;
 * - publicat fără public_url → fără link, tooltip „Linkul anunțului nu este
 *   disponibil de la <portal>”;
 * - orice altă stare → fără link, tooltip null (apelantul arată starea).
 */
export function portalListingLink(cell: PortalListingLinkInput): PortalListingLink {
  if (!LINKABLE_STATES.has(cell.state)) return { href: null, tooltip: null };
  const href = safeListingUrl(cell.publicUrl);
  if (href) return { href, tooltip: `Vezi anunțul pe ${cell.portalName}` };
  return { href: null, tooltip: `Linkul anunțului nu este disponibil de la ${cell.portalName}` };
}
