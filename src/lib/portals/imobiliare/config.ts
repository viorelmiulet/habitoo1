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
  /** Contul conectat: abonament, tip, număr de anunțuri online. */
  me: "/api/v3/me",
  /** Endpointuri candidate pentru catalogul de categorii (`category_api`). */
  categories: ["/api/v3/categories", "/api/v3/listings/categories"] as const,
  /** Inventarul serviciilor de promovare, pe `slot_type`. */
  promotionSlots: "/api/v3/promotions/slots",
  /** Anunțurile care consumă sloturile unui `slot_type`. */
  promotionListings: "/api/v3/promotions/listings",
} as const;

export function promotionSlotsPath(slotType: string): string {
  return `${IMOBILIARE_PATHS.promotionSlots}/${encodeURIComponent(slotType)}`;
}

export function promotionListingsPath(slotType: string): string {
  return `${IMOBILIARE_PATHS.promotionListings}/${encodeURIComponent(slotType)}`;
}


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

/**
 * Linkul public al anunțului, construit din câmpul `data.path` returnat de
 * GET /api/v3/listings/{ref} (ex. `/oferta/...-275991125`). `null` dacă
 * portalul nu îl trimite, forma nu e cea așteptată sau anunțul nu este încă
 * `online` (un anunț în ciornă redirectează către prima pagină a portalului).
 */
export function imobiliarePublicUrlFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as Record<string, unknown>)["data"];
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const state = typeof record["state"] === "string" ? record["state"] : null;
  if (state !== null && state !== IMOBILIARE_STATUS_ONLINE) return null;
  const path = record["path"];
  if (typeof path !== "string" || !path.startsWith("/oferta/")) return null;
  return `${IMOBILIARE_BASE_URL}${path}`;
}

/** Starea raportată de portal pentru anunț (`online`, `draft`, ...). */
export function imobiliareStateFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as Record<string, unknown>)["data"];
  if (!data || typeof data !== "object") return null;
  const state = (data as Record<string, unknown>)["state"];
  return typeof state === "string" && state.trim() ? state.trim() : null;
}
