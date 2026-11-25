/**
 * Derivarea stării unei oferte pe un portal — sursa unică pentru coloana
 * Portaluri (`getPropertiesPortalMatrix`) și pentru filtrul „Publicare pe
 * portaluri” din lista de proprietăți, ca cele două să nu se contrazică.
 */
export type PortalSelectionState =
  | "not_configured"
  | "coming_soon"
  | "not_selected"
  | "selected"
  | "syncing"
  | "needs_packet"
  | "published"
  | "in_feed"
  | "error"
  | "expired"
  | "withdrawn";

export function deriveState(input: {
  availability: "available" | "coming_soon" | "disabled";
  configured: boolean;
  selected: boolean;
  listingStatus: string;
  publicationStatus: string | null;
  /** Portalul acceptă trimiteri directe; altfel oferta circulă doar prin feed. */
  pushSupported: boolean;
  /** Doar pentru portalurile de tip feed: oferta este publicabilă în feed. */
  feedEligible: boolean;
}): PortalSelectionState {
  if (input.availability !== "available") return "coming_soon";
  if (!input.pushSupported) {
    // Portal de tip feed: nu există „trimitere”. Starea reală este prezența în feed.
    if (!input.configured) return "not_configured";
    if (!input.selected) return "not_selected";
    return input.feedEligible ? "in_feed" : "error";
  }
  if (input.listingStatus === "error" || input.publicationStatus === "error") return "error";
  if (input.listingStatus === "published" || input.listingStatus === "updated") return "published";
  if (input.listingStatus === "pending") return "syncing";
  if (input.listingStatus === "needs_packet") return "needs_packet";
  if (input.listingStatus === "expired") return "expired";
  if (input.listingStatus === "withdrawn") return "withdrawn";
  if (!input.configured) return "not_configured";
  return input.selected ? "selected" : "not_selected";
}

/**
 * Identificatorul unui portal în filtre: portalurile statice folosesc `_`,
 * cele dinamice (feed din SuperAdmin) pot avea cratime (`propri-ro`).
 */
export const PORTAL_ID_PATTERN = "[a-z0-9][a-z0-9_-]*";

/**
 * Răspunsul portalului (`partner_api_publications`) are prioritate peste
 * starea derivată: published → publicat, pending_review → în sincronizare,
 * rejected → eroare, altceva → retras. Folosit de card și de filtru.
 */
export function applyPortalFeedback(
  state: PortalSelectionState,
  feedbackStatus: string | null | undefined,
): PortalSelectionState {
  if (!feedbackStatus) return state;
  if (feedbackStatus === "published") return "published";
  if (feedbackStatus === "pending_review") return "syncing";
  if (feedbackStatus === "rejected") return "error";
  return "withdrawn";
}

export type PortalFilterBucket = "published" | "unpublished" | "error";

/** Publicate = published/in_feed; Cu erori = error; restul = Nepublicate. */
export function portalStateBucket(state: PortalSelectionState): PortalFilterBucket {
  if (state === "published" || state === "in_feed") return "published";
  if (state === "error") return "error";
  return "unpublished";
}

export type PortalFilter = { portal: string; state: PortalFilterBucket };

/** Valoarea din filtre: `all` sau `<portalId|any>:<published|unpublished|error>`. */
export function parsePortalFilter(value: string): PortalFilter | null {
  const m = new RegExp(`^(${PORTAL_ID_PATTERN}|any):(published|unpublished|error)$`).exec(value);
  return m ? { portal: m[1], state: m[2] as PortalFilterBucket } : null;
}

/** O ofertă se potrivește filtrului, după stările ei pe portalurile activate. */
export function matchesPortalFilter(
  cells: { portalId: string; state: PortalSelectionState }[],
  filter: PortalFilter,
): boolean {
  if (filter.portal === "any") {
    const buckets = cells.map((c) => portalStateBucket(c.state));
    if (filter.state === "published") return buckets.includes("published");
    if (filter.state === "error") return buckets.includes("error");
    return !buckets.includes("published");
  }
  const cell = cells.find((c) => c.portalId === filter.portal);
  const bucket = cell ? portalStateBucket(cell.state) : "unpublished";
  return bucket === filter.state;
}

export const PORTAL_BUCKET_LABELS: Record<PortalFilterBucket, string> = {
  published: "Publicate",
  unpublished: "Nepublicate",
  error: "Cu erori",
};
