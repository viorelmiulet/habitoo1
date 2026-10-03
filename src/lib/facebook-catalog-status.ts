// Starea afișată a Catalogului Facebook: doar connected / error / disconnected.
export type FacebookCatalogState = "connected" | "error" | "disconnected";

export type CatalogLogRow = { status: number; tokenPrefix: string | null; createdAt: string };

export const CATALOG_WINDOW_MS = 48 * 60 * 60 * 1000;

/** 401 fără token (încercare anonimă) nu contează ca eroare. */
function isTokenlessUnauthorized(row: CatalogLogRow): boolean {
  return row.status === 401 && !row.tokenPrefix;
}

export function facebookCatalogState(input: {
  hasToken: boolean;
  logs: CatalogLogRow[];
  now?: number;
}): FacebookCatalogState {
  if (!input.hasToken) return "disconnected";
  const now = input.now ?? Date.now();
  const recent = input.logs
    .filter((l) => !isTokenlessUnauthorized(l))
    .filter((l) => now - new Date(l.createdAt).getTime() <= CATALOG_WINDOW_MS)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last = recent[0];
  if (!last) return "disconnected";
  return last.status === 200 ? "connected" : "error";
}

export const FACEBOOK_CATALOG_STATE_LABEL: Record<FacebookCatalogState, string> = {
  connected: "Conectat",
  error: "Eroare",
  disconnected: "Deconectat",
};

export const EXCLUSION_REASON_LABEL = {
  no_price: "Fără preț",
  no_coordinates: "Fără coordonate",
  no_images: "Fără poze",
  no_city: "Fără oraș",
} as const;

export const FACEBOOK_CATALOG_PATH = "/api/public/catalog/v1/facebook.csv";
export const FACEBOOK_CATALOG_PUBLIC_ORIGIN = "https://crm.habitoo.ro";

export function facebookCatalogUrl(token: string): string {
  return `${FACEBOOK_CATALOG_PUBLIC_ORIGIN}${FACEBOOK_CATALOG_PATH}?token=${encodeURIComponent(token)}`;
}

/** Cheia rândului din `portal_publications` care marchează opt-in-ul în Catalogul Facebook. */
export const FACEBOOK_CATALOG_PORTAL_KEY = "facebook_catalog";

export type FacebookListingReason = keyof typeof EXCLUSION_REASON_LABEL | "not_published";

export const FACEBOOK_LISTING_REASON_LABEL: Record<FacebookListingReason, string> = {
  ...EXCLUSION_REASON_LABEL,
  not_published: "Anunțul nu e publicat",
};

/** Ce trebuie completat și unde, pentru fiecare motiv de excludere. */
export const FACEBOOK_LISTING_FIX: Record<FacebookListingReason, { hint: string; target: "details" | "media" }> = {
  no_price: { hint: "Completează prețul.", target: "details" },
  no_coordinates: { hint: "Completează locația pe hartă.", target: "details" },
  no_images: { hint: "Adaugă cel puțin o poză publicabilă.", target: "media" },
  no_city: { hint: "Completează orașul.", target: "details" },
  not_published: { hint: "Anunțul trebuie să fie activ și publicat.", target: "details" },
};

export type FacebookListingState =
  | { key: "in_catalog"; label: "În catalog"; reason: null }
  | { key: "excluded"; label: string; reason: FacebookListingReason }
  | { key: "disabled"; label: "Dezactivat"; reason: FacebookListingReason | null };

/** Singura regulă pentru starea unui anunț în Catalogul Facebook. */
export function facebookListingState(
  enabled: boolean,
  reason: FacebookListingReason | null,
): FacebookListingState {
  if (!enabled) return { key: "disabled", label: "Dezactivat", reason };
  if (!reason) return { key: "in_catalog", label: "În catalog", reason: null };
  return {
    key: "excluded",
    label: `Activat, dar exclus: ${FACEBOOK_LISTING_REASON_LABEL[reason]}`,
    reason,
  };
}
