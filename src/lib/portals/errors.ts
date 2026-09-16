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
  | "FEED_ERROR"
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
  FEED_ERROR: "Feedul Habitoo pe care îl citește portalul nu a răspuns corect.",
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

/**
 * Pregătește pentru jurnalizare corpul BRUT al răspunsului primit de la portal.
 * Se păstrează integral (până la o limită de dimensiune), ca să putem vedea
 * exact `error.code`, `error.message` și `error.fields`, dar cheile care pot
 * conține secrete sunt înlocuite cu `[redacted]`.
 */
const SECRET_KEY_PATTERN = /(token|secret|password|apikey|api_key|authorization|bearer|cookie)/i;
const MAX_LOGGED_RESPONSE_BYTES = 16 * 1024;

export function sanitizePortalResponse(body: unknown, depth = 0): unknown {
  if (body === null || body === undefined) return null;
  if (depth > 8) return "[truncated]";
  if (typeof body === "string") {
    return body.length > MAX_LOGGED_RESPONSE_BYTES
      ? `${body.slice(0, MAX_LOGGED_RESPONSE_BYTES)}…[truncated]`
      : body;
  }
  if (typeof body === "number" || typeof body === "boolean") return body;
  if (Array.isArray(body)) {
    return body.slice(0, 200).map((entry) => sanitizePortalResponse(entry, depth + 1));
  }
  if (typeof body === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key)
        ? "[redacted]"
        : sanitizePortalResponse(value, depth + 1);
    }
    return out;
  }
  return null;
}

/** Împachetează răspunsul portalului pentru coloana `portal_response`. */
export function portalResponseLog(input: {
  status?: number | null;
  body: unknown;
}): Record<string, unknown> | null {
  const body = sanitizePortalResponse(input.body);
  if (body === null && (input.status === null || input.status === undefined)) return null;
  return { http_status: input.status ?? null, body };
}
