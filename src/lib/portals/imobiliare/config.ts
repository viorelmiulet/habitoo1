/**
 * Configurarea integrării Imobiliare.ro (API v3).
 *
 * Pur: nu atinge rețeaua, nu decriptează nimic. Adresa API este fixată
 * server-side (portalul are un singur mediu real, ca La Cheie): nu cerem și nu
 * presupunem o adresă de test.
 */

export const IMOBILIARE_PORTAL_KEY = "imobiliare_ro";
export const IMOBILIARE_BASE_URL = "https://www.imobiliare.ro";

/** Căile documentate. Autentificarea este pe v1, restul pe v3. */
export const IMOBILIARE_PATHS = {
  token: "/api/v1/auth/oauth/token",
  logout: "/api/v3/logout",
  listings: "/api/v3/listings",
  agents: "/api/v3/agents",
  /** Endpointuri candidate pentru catalogul de categorii (`category_api`). */
  categories: ["/api/v3/categories", "/api/v3/listings/categories"] as const,
} as const;

export function listingPath(customReference?: string): string {
  return customReference
    ? `${IMOBILIARE_PATHS.listings}/${encodeURIComponent(customReference)}`
    : IMOBILIARE_PATHS.listings;
}

export function promotionsPath(customReference: string): string {
  return `${listingPath(customReference)}/promotions`;
}

export function mediasPath(customReference: string): string {
  return `${listingPath(customReference)}/medias`;
}

/** Limitele impuse de portal, aplicate și local ca protecție. */
export const IMOBILIARE_TITLE_MAX = 80;
export const IMOBILIARE_DESCRIPTION_MIN = 80;
/** Anunțul devine public doar cu `promotions.status = online`. */
export const IMOBILIARE_STATUS_ONLINE = "online";
export const IMOBILIARE_STATUS_DRAFT = "draft";

/** Imaginile se trimit base64: le grupăm în loturi ca să nu depășim payload-ul. */
export const IMOBILIARE_IMAGES_PER_BATCH = 5;
export const IMOBILIARE_MAX_IMAGES = 30;
export const IMOBILIARE_MAX_BATCH_BYTES = 8 * 1024 * 1024;

/** Tokenul de acces expiră în 31 de zile; îl reînnoim cu 3 zile înainte. */
export const IMOBILIARE_TOKEN_TTL_SECONDS = 2_678_400;
export const IMOBILIARE_REFRESH_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;

export type ImobiliareSettings = {
  /** `custom_reference` folosit ultima dată; util pentru diagnostic. */
  categoriesFetchedAt: string | null;
  categoriesError: string | null;
  locationsApproximate: boolean;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readImobiliareSettings(
  settings: Record<string, unknown> | null,
): ImobiliareSettings {
  const raw = settings ?? {};
  return {
    categoriesFetchedAt: text(raw["imobiliare_categories_fetched_at"]),
    categoriesError: text(raw["imobiliare_categories_error"]),
    locationsApproximate: raw["imobiliare_locations_approximate"] === true,
  };
}

/** `custom_reference`: strict `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. */
export function imobiliareCustomReference(reference: string | null, propertyId: string): string {
  const raw = (reference ?? "").trim() || `HB-${propertyId.replace(/-/g, "").slice(0, 12)}`;
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  const safe = (cleaned || `HB${propertyId.replace(/-/g, "").slice(0, 10)}`).slice(0, 64);
  return safe;
}

export function isValidCustomReference(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}
