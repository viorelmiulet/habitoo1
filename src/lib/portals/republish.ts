/**
 * Republicarea anunțurilor DEJA publicate: alegerea perechilor proprietate–portal.
 * Pur, fără rețea; aceeași regulă la previzualizare, la pornire și în worker.
 */

/** Portalurile care își preiau singure ofertele: nu primesc trimiteri. */
export const AUTO_PULL_PORTALS = new Set(["imove", "properstar", "clickimob", "facebook_catalog"]);
export const AUTO_PULL_MESSAGE = "Se actualizează automat la următoarea preluare.";
export const EXCLUDED_PROPERTY_STATUSES = new Set(["sold", "rented", "archived"]);
/** Pauza dintre două trimiteri pe același portal. */
export const REPUBLISH_PORTAL_SPACING_MS = 3_000;

export type RepublishScope = "mine" | "all";
export type RepublishProperty = { id: string; status: string | null; deleted_at: string | null; assigned_to: string | null };
export type RepublishListing = { property_id: string; portal: string; status: string | null; external_id: string | null };
export type RepublishPublication = { property_id: string; portal_key: string; enabled: boolean | null };
export type RepublishPair = { propertyId: string; portalId: string };

/** Agentul simplu nu are altă opțiune decât propriile anunțuri. */
export function effectiveRepublishScope(requested: RepublishScope, agentOnly: boolean): RepublishScope {
  return agentOnly ? "mine" : requested;
}

export function isPublishedPair(listing: RepublishListing | undefined, publication: RepublishPublication | undefined): boolean {
  return Boolean(
    listing && listing.external_id && (listing.status === "published" || listing.status === "updated") && publication?.enabled === true,
  );
}

export function isRepublishableProperty(property: RepublishProperty | undefined): boolean {
  return Boolean(property && !property.deleted_at && !EXCLUDED_PROPERTY_STATUSES.has(property.status ?? ""));
}

export function selectRepublishPairs(input: {
  scope: RepublishScope;
  userId: string;
  portalFilter: string[] | null;
  activePortals: Set<string>;
  properties: RepublishProperty[];
  listings: RepublishListing[];
  publications: RepublishPublication[];
}): { queued: RepublishPair[]; autoPull: RepublishPair[] } {
  const byId = new Map(input.properties.map((p) => [p.id, p]));
  const pubs = new Map(input.publications.map((p) => [`${p.property_id}|${p.portal_key}`, p]));
  const queued: RepublishPair[] = [];
  const autoPull: RepublishPair[] = [];
  const seen = new Set<string>();
  for (const listing of input.listings) {
    const key = `${listing.property_id}|${listing.portal}`;
    if (seen.has(key)) continue;
    const property = byId.get(listing.property_id);
    if (!isRepublishableProperty(property)) continue;
    if (input.scope === "mine" && property!.assigned_to !== input.userId) continue;
    if (input.portalFilter && !input.portalFilter.includes(listing.portal)) continue;
    if (!input.activePortals.has(listing.portal)) continue;
    if (!isPublishedPair(listing, pubs.get(key))) continue;
    seen.add(key);
    const pair = { propertyId: listing.property_id, portalId: listing.portal };
    (AUTO_PULL_PORTALS.has(listing.portal) ? autoPull : queued).push(pair);
  }
  return { queued, autoPull };
}

export function countByPortal(pairs: RepublishPair[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of pairs) out[pair.portalId] = (out[pair.portalId] ?? 0) + 1;
  return out;
}

/** Ritm limitat: trimiterile pe același portal se eșalonează. */
export function staggerRepublishPairs(pairs: RepublishPair[], nowMs: number) {
  const index: Record<string, number> = {};
  return pairs.map((pair) => {
    const i = index[pair.portalId] ?? 0;
    index[pair.portalId] = i + 1;
    return { ...pair, nextAttemptAt: new Date(nowMs + i * REPUBLISH_PORTAL_SPACING_MS).toISOString() };
  });
}
