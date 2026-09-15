/**
 * Politica de erori și retry pentru La Cheie (funcții pure, fără rețea).
 *
 * Reguli fixate de documentație:
 *  - timeout / 5xx  → retry cu EXACT aceeași versiune, aceleași date, aceeași operație;
 *  - 429            → se respectă `Retry-After`, apoi retry cu aceeași versiune;
 *  - 409            → conflict: NU se incrementează versiunea, se cere reconcile;
 *  - 400            → eroare de schemă/business, fără retry automat;
 *  - 401            → credențiale/configurare;
 *  - 404            → resursă/conexiune;
 *  - 413            → payload prea mare.
 */
import type { PortalErrorCode } from "../errors";

export type LaCheieAction =
  /** Succes. */
  | "ok"
  /** Se reia identic (aceeași versiune, aceleași date). */
  | "retry_same"
  /** Se așteaptă `Retry-After`, apoi reluare identică. */
  | "retry_after"
  /** Conflict de versiune: reconcile, apoi versiune nouă. */
  | "reconcile"
  /** Eroare definitivă pentru această operație. */
  | "stop";

export type LaCheieClassification = {
  action: LaCheieAction;
  code: PortalErrorCode;
  /** Mesaj în română, sigur de afișat (fără secrete, fără payload brut). */
  message: string;
  waitMs: number;
};

export const LACHEIE_MAX_ATTEMPTS = 3;
export const LACHEIE_MAX_WAIT_MS = 30_000;

/** `Retry-After` poate fi secunde sau dată HTTP. Rezultatul este limitat superior. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 0;
  const raw = header.trim();
  if (/^\d+$/.test(raw)) return Math.min(Number(raw) * 1000, LACHEIE_MAX_WAIT_MS);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - now, 0), LACHEIE_MAX_WAIT_MS);
  }
  return 0;
}

/** Backoff exponențial mărginit pentru 5xx/timeout (attempt începe de la 1). */
export function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** Math.max(attempt - 1, 0), 8_000);
}

export function classifyLaCheieStatus(input: {
  status: number;
  attempt: number;
  retryAfter?: string | null;
  now?: number;
}): LaCheieClassification {
  const { status, attempt } = input;
  const canRetry = attempt < LACHEIE_MAX_ATTEMPTS;

  if (status >= 200 && status < 300) {
    return { action: "ok", code: "PORTAL_ERROR", message: "", waitMs: 0 };
  }
  if (status === 429) {
    const wait = retryAfterMs(input.retryAfter ?? null, input.now) || backoffMs(attempt);
    return {
      action: canRetry ? "retry_after" : "stop",
      code: "RATE_LIMIT",
      message:
        "La Cheie a limitat temporar cererile (60 scrieri / 120 citiri pe minut). Se reia după intervalul cerut de portal.",
      waitMs: wait,
    };
  }
  if (status === 409) {
    return {
      action: "reconcile",
      code: "PORTAL_ERROR",
      message:
        "Conflict de versiune la La Cheie: anunțul a fost modificat între timp. Se reconciliază versiunea înainte de o nouă trimitere.",
      waitMs: 0,
    };
  }
  if (status === 400 || status === 422) {
    return {
      action: "stop",
      code: "INVALID_REQUEST",
      message: "La Cheie a respins datele anunțului. Corectează câmpurile semnalate și reia.",
      waitMs: 0,
    };
  }
  if (status === 401 || status === 403) {
    return {
      action: "stop",
      code: "AUTH_ERROR",
      message: "La Cheie a refuzat cheia API. Verifică cheia salvată pentru conexiunea Production.",
      waitMs: 0,
    };
  }
  if (status === 404) {
    return {
      action: "stop",
      code: "NOT_FOUND",
      message: "La Cheie nu a găsit resursa cerută. Verifică conexiunea agenției și anunțul.",
      waitMs: 0,
    };
  }
  if (status === 413) {
    return {
      action: "stop",
      code: "INVALID_REQUEST",
      message: "Anunțul depășește limita de 1 MiB acceptată de La Cheie. Reduce textul sau imaginile.",
      waitMs: 0,
    };
  }
  if (status >= 500) {
    return {
      action: canRetry ? "retry_same" : "stop",
      code: "PORTAL_ERROR",
      message: "La Cheie a returnat o eroare temporară. Se reia aceeași operație, fără versiune nouă.",
      waitMs: backoffMs(attempt),
    };
  }
  return {
    action: "stop",
    code: "PORTAL_ERROR",
    message: `La Cheie a răspuns neașteptat (HTTP ${status}).`,
    waitMs: 0,
  };
}

/** Timeout / rețea: aceeași operație, aceeași versiune. */
export function classifyLaCheieNetworkError(input: {
  attempt: number;
  timeout: boolean;
}): LaCheieClassification {
  const canRetry = input.attempt < LACHEIE_MAX_ATTEMPTS;
  return {
    action: canRetry ? "retry_same" : "stop",
    code: input.timeout ? "TIMEOUT" : "NETWORK_ERROR",
    message: input.timeout
      ? "La Cheie nu a răspuns în timp util. Se reia aceeași operație, cu aceeași versiune."
      : "La Cheie nu a putut fi contactat. Se reia aceeași operație, cu aceeași versiune.",
    waitMs: backoffMs(input.attempt),
  };
}
