/**
 * Clasificarea erorilor de portal pentru SuperAdmin: „listing” = anunț
 * completat greșit (treaba agenției), „platform” = conexiune, portal sau cod
 * Habitoo. Ce nu poate fi clasificat sigur intră la platformă.
 * Agențiile își văd în continuare toate erorile; clasificarea filtrează doar
 * vederile SuperAdmin.
 */
export type PortalErrorClass = "listing" | "agency" | "platform";

/** Coduri din `portal_operation_logs.error_code` care țin de datele anunțului. */
export const LISTING_ERROR_CODES = [
  "INVALID_REQUEST", // portalul a respins datele anunțului (422)
  "VALIDATION_ERROR", // validare locală: câmpuri lipsă, poze insuficiente
  "NOT_PUBLISHABLE", // statusul proprietății nu permite publicarea
  "MISSING_FIELDS",
  "olx_http_400", // OLX: „Data validation error”
  "olx_http_422",
] as const;

const LISTING_CODES = new Set<string>(LISTING_ERROR_CODES);

/** Limitele pachetului agenției pe portal (sloturi, număr de anunțuri, promovări): țin de agenție, nu de platformă. */
export const AGENCY_LIMIT_CODES = [
  "SLOT_LIMIT",
  "SLOTS_EXCEEDED",
  "LISTING_LIMIT",
  "QUOTA_EXCEEDED",
  "PROMOTION_UNAVAILABLE",
] as const;
const AGENCY_CODES = new Set<string>(AGENCY_LIMIT_CODES);
const AGENCY_MESSAGE = /slot|limita de anunțuri|numărul maxim de anunțuri|pachetul (agenției|tău)|promovare(a)? (nu este )?indisponibil/i;

export function classifyPortalErrorCode(code: string | null | undefined, message?: string | null): PortalErrorClass {
  if (code && LISTING_CODES.has(code)) return "listing";
  if ((code && AGENCY_CODES.has(code)) || AGENCY_MESSAGE.test(message ?? "")) return "agency";
  return "platform";
}

/** Textul `portal_publications.last_error` (fără cod): doar tiparele sigure de completare. */
const LISTING_MESSAGE =
  /oferta nu este publicabil|publicarea este blocată\s*[—-]\s*completează|a respins datele|câmpuri obligatorii|completează câmpurile|poze insuficiente|prea puține (poze|fotografii)/i;

export function classifyPublicationError(message: string | null | undefined): PortalErrorClass {
  if (LISTING_MESSAGE.test(message ?? "")) return "listing";
  if (AGENCY_MESSAGE.test(message ?? "")) return "agency";
  return "platform";
}

export const isPlatformPublicationError = (message: string | null | undefined) =>
  classifyPublicationError(message) === "platform";

/** Filtru PostgREST: eșecuri fără erorile de completare (cod null = platformă). */
export const PLATFORM_ERROR_CODE_FILTER = `error_code.is.null,error_code.not.in.(${LISTING_ERROR_CODES.join(",")})`;
/** Filtru PostgREST pentru jurnal: succese + eșecuri de platformă. */
export const HIDE_LISTING_ERRORS_FILTER = `success.eq.true,${PLATFORM_ERROR_CODE_FILTER}`;

/** Numărul de erori de platformă dintr-o listă de publicări în eroare. */
export function countPlatformPublicationErrors(rows: { last_error: string | null }[]): number {
  return rows.filter((r) => isPlatformPublicationError(r.last_error)).length;
}
