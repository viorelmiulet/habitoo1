/**
 * Politica de erori și retry pentru Imobiliare.ro (funcții pure, fără rețea).
 *
 * 5xx / timeout → reluare identică; 429 → `Retry-After`; 400/422 → eroare de
 * validare, fără retry, cu numele câmpurilor respinse extrase din răspuns;
 * 401 → token expirat/invalid (se reînnoiește o singură dată de client).
 * Pe endpointul de autorizare (`endpoint: "auth"`) un 4xx este refuz de
 * credențiale: `AUTH_ERROR` cu mesajul despre datele de acces API.
 */
import type { PortalErrorCode } from "../errors";
import { IMOBILIARE_PATHS } from "./config";

export type ImobiliareAction = "ok" | "retry_same" | "retry_after" | "reauth" | "stop";

/**
 * „auth” = cererea de autorizare (`POST /api/v1/auth/oauth/token`): acolo un
 * răspuns 4xx înseamnă că portalul refuză utilizatorul sau parola.
 * „data” = orice altă cerere (anunț, imagini, promovări).
 */
export type ImobiliareEndpoint = "auth" | "data";

export type ImobiliareClassification = {
  action: ImobiliareAction;
  code: PortalErrorCode;
  message: string;
  waitMs: number;
};

export const IMOBILIARE_MAX_ATTEMPTS = 3;
export const IMOBILIARE_MAX_WAIT_MS = 30_000;

/**
 * Mesajul afișat când Imobiliare.ro refuză credențialele de autorizare.
 * Spune clar ce s-a întâmplat și ce date se folosesc: cele primite de la
 * Imobiliare.ro pentru integrarea cu un CRM, nu datele de logare de pe site.
 */
export const IMOBILIARE_AUTH_REJECTED_MESSAGE =
  "Imobiliare.ro nu acceptă utilizatorul sau parola. Folosește datele de acces API primite de la Imobiliare.ro pentru integrarea cu un CRM, nu datele de logare de pe site.";

/** Cererea de autorizare: aici un 4xx este refuz de credențiale, nu de anunț. */
export function isImobiliareAuthPath(path: string): boolean {
  return path === IMOBILIARE_PATHS.token;
}

export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 0;
  const raw = header.trim();
  if (/^\d+$/.test(raw)) return Math.min(Number(raw) * 1000, IMOBILIARE_MAX_WAIT_MS);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.min(Math.max(date - now, 0), IMOBILIARE_MAX_WAIT_MS);
  return 0;
}

export function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** Math.max(attempt - 1, 0), 8_000);
}

export function classifyImobiliareStatus(input: {
  status: number;
  attempt: number;
  retryAfter?: string | null;
  now?: number;
  endpoint?: ImobiliareEndpoint;
}): ImobiliareClassification {
  const { status, attempt } = input;
  const canRetry = attempt < IMOBILIARE_MAX_ATTEMPTS;

  if (status >= 200 && status < 300) {
    return { action: "ok", code: "PORTAL_ERROR", message: "", waitMs: 0 };
  }
  // Autorizare refuzată: portalul nu acceptă utilizatorul sau parola.
  if (input.endpoint === "auth" && (status === 400 || status === 401 || status === 403 || status === 422)) {
    return { action: "stop", code: "AUTH_ERROR", message: IMOBILIARE_AUTH_REJECTED_MESSAGE, waitMs: 0 };
  }
  if (status === 401) {
    return {
      action: "reauth",
      code: "AUTH_ERROR",
      message:
        "Imobiliare.ro a refuzat tokenul de acces. Se încearcă reînnoirea automată a autorizării.",
      waitMs: 0,
    };
  }
  if (status === 403) {
    return {
      action: "stop",
      code: "AUTH_ERROR",
      message:
        "Contul Imobiliare.ro nu are drept pentru această operație. Verifică utilizatorul conectat.",
      waitMs: 0,
    };
  }
  if (status === 429) {
    const wait = retryAfterMs(input.retryAfter ?? null, input.now) || backoffMs(attempt);
    return {
      action: canRetry ? "retry_after" : "stop",
      code: "RATE_LIMIT",
      message: "Imobiliare.ro a limitat temporar cererile. Se reia după intervalul cerut de portal.",
      waitMs: wait,
    };
  }
  if (status === 400 || status === 422) {
    return {
      action: "stop",
      code: "INVALID_REQUEST",
      message: "Imobiliare.ro a respins datele anunțului. Corectează câmpurile semnalate și reia.",
      waitMs: 0,
    };
  }
  if (status === 404) {
    return {
      action: "stop",
      code: "NOT_FOUND",
      message: "Imobiliare.ro nu a găsit resursa cerută (anunț, agent sau locație).",
      waitMs: 0,
    };
  }
  if (status === 413) {
    return {
      action: "stop",
      code: "INVALID_REQUEST",
      message:
        "Cererea depășește dimensiunea acceptată de Imobiliare.ro. Se trimit mai puține imagini pe lot.",
      waitMs: 0,
    };
  }
  if (status >= 500) {
    return {
      action: canRetry ? "retry_same" : "stop",
      code: "PORTAL_ERROR",
      message: "Imobiliare.ro a returnat o eroare temporară. Se reia aceeași operație.",
      waitMs: backoffMs(attempt),
    };
  }
  return {
    action: "stop",
    code: "PORTAL_ERROR",
    message: `Imobiliare.ro a răspuns neașteptat (HTTP ${status}).`,
    waitMs: 0,
  };
}

export function classifyImobiliareNetworkError(input: {
  attempt: number;
  timeout: boolean;
}): ImobiliareClassification {
  const canRetry = input.attempt < IMOBILIARE_MAX_ATTEMPTS;
  return {
    action: canRetry ? "retry_same" : "stop",
    code: input.timeout ? "TIMEOUT" : "NETWORK_ERROR",
    message: input.timeout
      ? "Imobiliare.ro nu a răspuns în timp util. Se reia aceeași operație."
      : "Imobiliare.ro nu a putut fi contactat. Se reia aceeași operație.",
    waitMs: backoffMs(input.attempt),
  };
}

/**
 * Extrage câmpurile respinse dintr-un răspuns de validare, indiferent de forma
 * folosită (`errors`, `error.fields`, `message`), ca text scurt afișabil.
 */
export function describeImobiliareValidation(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const candidates: unknown[] = [
    root["errors"],
    root["fields"],
    (root["error"] as Record<string, unknown> | undefined)?.["fields"],
    (root["error"] as Record<string, unknown> | undefined)?.["errors"],
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      const names = candidate
        .map((entry) =>
          typeof entry === "string"
            ? entry
            : entry && typeof entry === "object"
              ? String(
                  (entry as Record<string, unknown>)["field"] ??
                    (entry as Record<string, unknown>)["name"] ??
                    (entry as Record<string, unknown>)["message"] ??
                    "",
                )
              : "",
        )
        .filter((entry) => entry.length > 0);
      if (names.length) return names.slice(0, 12).join(", ");
    } else if (typeof candidate === "object") {
      const names = Object.entries(candidate as Record<string, unknown>).map(([key, value]) => {
        const detail = Array.isArray(value) ? value.join("; ") : String(value ?? "");
        return detail ? `${key}: ${detail}` : key;
      });
      if (names.length) return names.slice(0, 12).join(", ");
    }
  }
  const message =
    typeof root["message"] === "string"
      ? root["message"]
      : typeof (root["error"] as Record<string, unknown> | undefined)?.["message"] === "string"
        ? String((root["error"] as Record<string, unknown>)["message"])
        : null;
  return message && message.length ? message.slice(0, 300) : null;
}
