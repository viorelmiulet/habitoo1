/**
 * Model generic de erori pentru integrările cu portaluri.
 * Utilizatorul vede un mesaj clar în română; detaliile tehnice (URL-uri,
 * răspunsuri brute, credențiale) rămân server-side.
 */

export type PortalErrorCode =
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "NOT_SUPPORTED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "PORTAL_ERROR"
  | "VALIDATION_ERROR"
  | "CONFIG_ERROR";

export const PORTAL_ERROR_MESSAGE: Record<PortalErrorCode, string> = {
  AUTH_ERROR: "Portalul a refuzat credențialele. Verifică tokenul și identificatorul agenției.",
  RATE_LIMIT: "Prea multe cereri către portal. Încearcă din nou în câteva minute.",
  INVALID_REQUEST: "Portalul a respins cererea ca fiind invalidă.",
  NOT_FOUND: "Portalul nu a găsit resursa cerută.",
  NOT_SUPPORTED: "Portalul nu suportă această operație.",
  NETWORK_ERROR: "Portalul nu a putut fi contactat.",
  TIMEOUT: "Portalul nu a răspuns în timp util.",
  PORTAL_ERROR: "Portalul a returnat o eroare. Reîncearcă mai târziu.",
  VALIDATION_ERROR: "Datele proprietății nu îndeplinesc cerințele de publicare.",
  CONFIG_ERROR: "Integrarea nu este configurată complet.",
};

export class PortalError extends Error {
  readonly code: PortalErrorCode;
  /** Detaliu sanitizat, sigur pentru logare (fără secrete). */
  readonly detail: string | null;

  constructor(code: PortalErrorCode, detail?: string | null, message?: string) {
    super(message ?? PORTAL_ERROR_MESSAGE[code]);
    this.name = "PortalError";
    this.code = code;
    this.detail = detail ?? null;
  }
}

/** Mapează un status HTTP al portalului la codul generic. */
export function codeFromHttpStatus(status: number): PortalErrorCode {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status === 408) return "TIMEOUT";
  if (status === 429) return "RATE_LIMIT";
  if (status === 400 || status === 422) return "INVALID_REQUEST";
  if (status >= 500) return "PORTAL_ERROR";
  return "PORTAL_ERROR";
}

/** Normalizează orice eroare într-un PortalError, fără să scurgă detalii. */
export function toPortalError(error: unknown): PortalError {
  if (error instanceof PortalError) return error;
  if (error instanceof Error) {
    if (error.name === "AbortError" || /timeout/i.test(error.message)) {
      return new PortalError("TIMEOUT");
    }
    if (/fetch|network|dns|econn/i.test(error.message)) {
      return new PortalError("NETWORK_ERROR");
    }
  }
  return new PortalError("PORTAL_ERROR");
}

export function portalErrorMessage(code: PortalErrorCode): string {
  return PORTAL_ERROR_MESSAGE[code];
}
