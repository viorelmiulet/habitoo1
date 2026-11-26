/**
 * Politica unică pentru eșecurile temporare de tip timeout / rețea la portaluri.
 *
 * - `TIMEOUT` și `NETWORK_ERROR` (sau mesajele lor românești) se reîncearcă
 *   automat DOAR la portalurile idempotente, unde retrimiterea actualizează
 *   același anunț (nu creează duplicate): după 30 s, apoi după 2 min (max 2).
 * - La celelalte portaluri un timeout nu se reîncearcă automat: portalul poate
 *   fi creat deja anunțul, iar o retrimitere ar putea dubla anunțul.
 * - Un anunț deja publicat a cărui actualizare a expirat rămâne „Publicat”,
 *   cu nota `UNCONFIRMED_UPDATE_NOTE`, nu trece pe „Eroare”.
 */

/** Portalurile la care retrimiterea actualizează același anunț. */
export const TIMEOUT_RETRY_PORTALS: ReadonlySet<string> = new Set([
  "imospot",
  "mvaimobiliare",
  "primulanunt",
  "lacheie",
  "vdi",
  "imobiliare_ro",
  "romimo",
  "imopedia",
  "zonata",
  "homedirect",
]);

/** Pauzele înainte de reîncercare: 30 s, apoi 2 min. */
export const TIMEOUT_RETRY_DELAYS_MS: readonly number[] = [30_000, 120_000];

export const UNCONFIRMED_UPDATE_NOTE = "Ultima actualizare nu a fost confirmată de portal";

const TIMEOUT_LIKE_CODES = new Set(["TIMEOUT", "NETWORK_ERROR"]);
const TIMEOUT_LIKE_TEXT =
  /în timp util|in timp util|nu a putut fi contactat|network|rețea|retea|timeout|timed out/i;

/**
 * Timeout sau eroare de rețea: codul `TIMEOUT`/`NETWORK_ERROR` sau mesajul lor.
 * Un răspuns explicit 429/5xx de la portal nu este timeout (are regula lui).
 */
export function isTimeoutLikeFailure(input: {
  code?: string | null;
  httpStatus?: number | null;
  message?: string | null;
}): boolean {
  if (input.code && TIMEOUT_LIKE_CODES.has(input.code)) return true;
  if (input.code === "RATE_LIMIT" || input.httpStatus === 429 || (input.httpStatus ?? 0) >= 500) return false;
  return TIMEOUT_LIKE_TEXT.test(input.message ?? "");
}

export function isTimeoutRetryPortal(portalId: string | null | undefined): boolean {
  return Boolean(portalId && TIMEOUT_RETRY_PORTALS.has(portalId));
}

/**
 * Pauza până la următoarea încercare după un timeout/eroare de rețea, sau
 * `null` când nu se mai reîncearcă. `attemptNumber` = încercarea care tocmai a
 * eșuat (1 = prima trimitere).
 */
export function timeoutRetryDelayMs(input: { portalId: string | null | undefined; attemptNumber: number }): number | null {
  if (!isTimeoutRetryPortal(input.portalId)) return null;
  return TIMEOUT_RETRY_DELAYS_MS[input.attemptNumber - 1] ?? null;
}

/**
 * Starea salvată după o trimitere eșuată. Un anunț deja publicat pe portal,
 * cu actualizarea neconfirmată (timeout/rețea), rămâne publicat cu nota.
 */
export function unconfirmedUpdateState(input: {
  ok: boolean;
  action: string;
  code?: string | null;
  message?: string | null;
  previousStatus: string | null | undefined;
  externalId: string | null | undefined;
}): { keepStatus: string; note: string } | null {
  if (input.ok || input.action === "withdraw") return null;
  if (!isTimeoutLikeFailure(input)) return null;
  if (!input.externalId) return null;
  if (input.previousStatus !== "published" && input.previousStatus !== "updated") return null;
  return { keepStatus: input.previousStatus, note: `${UNCONFIRMED_UPDATE_NOTE}.` };
}

export function isUnconfirmedUpdateNote(lastError: string | null | undefined): boolean {
  return Boolean(lastError && lastError.includes(UNCONFIRMED_UPDATE_NOTE));
}

/**
 * Reîncercarea automată din coada `portal_publish_jobs` pentru erorile temporare:
 * 5xx (inclusiv 521/522/524 Cloudflare), 429, timeout, rețea și
 * `IMAGE_REHOST_FAILED` (HomeDirect). Aceeași operație, aceeași versiune.
 * Pauze: 2 min, 10 min, 30 min, 2 h, 6 h; la 429 cel puțin `Retry-After`.
 */
export const PUBLISH_RETRY_DELAYS_MS: readonly number[] = [
  2 * 60_000, 10 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000,
];

/** Portalurile trimise eșalonat de worker (un singur job simultan per portal). */
export const PACED_PUBLISH_PORTALS: readonly string[] = ["vdi", "lacheie", "homedirect"];

const DEFINITIVE_CODES = new Set(["VALIDATION_ERROR", "AUTH_ERROR", "UNAUTHORIZED", "FORBIDDEN", "TOKEN_EXPIRED", "INVALID_TOKEN", "NOT_PUBLISHABLE", "SLOT_LIMIT"]);
const DEFINITIVE_TEXT = /nu este publicabil|drepturi|neautorizat|token|cheie api|validare|obligatori/i;
const TRANSIENT_TEXT = /eroare temporar|temporar indisponibil|reîncearcă mai târziu|reincearca mai tarziu|reîncercăm automat|limita .* cereri|too many requests|bad gateway|service unavailable|gateway time/i;

export function isTransientPublishFailure(input: {
  code?: string | null;
  httpStatus?: number | null;
  message?: string | null;
  portalId?: string | null;
}): boolean {
  const message = input.message ?? "";
  if (/IMAGE_REHOST_FAILED/.test(message) || input.code === "IMAGE_REHOST_FAILED") return true;
  if (input.code && DEFINITIVE_CODES.has(input.code)) return false;
  const status = input.httpStatus ?? null;
  if (status === 429 || input.code === "RATE_LIMIT" || (status !== null && status >= 500)) return true;
  if (status !== null && status >= 400) return false;
  if (DEFINITIVE_TEXT.test(message) && !TRANSIENT_TEXT.test(message)) return false;
  // Timeout/rețea: doar unde retrimiterea nu poate dubla anunțul.
  if (isTimeoutLikeFailure(input)) return isTimeoutRetryPortal(input.portalId);
  return TRANSIENT_TEXT.test(message) || /\b5\d\d\b/.test(message);
}

/**
 * Pauza până la următoarea încercare sau `null` = eroare finală.
 * `attemptNumber` = încercarea care tocmai a eșuat (1 = prima trimitere).
 */
export function publishRetryDelayFor(input: { attemptNumber: number; retryAfterMs?: number | null }): number | null {
  const base = PUBLISH_RETRY_DELAYS_MS[input.attemptNumber - 1];
  if (base === undefined) return null;
  const after = input.retryAfterMs && input.retryAfterMs > 0 ? input.retryAfterMs : 0;
  return Math.max(base, after);
}

/** „Se reîncearcă (încercarea N, următoarea la HH:MM)” — ora României. */
export function retryStatusLabel(nextAttemptNumber: number, at: Date): string {
  const hhmm = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Bucharest" }).format(at);
  return `Se reîncearcă (încercarea ${nextAttemptNumber}, următoarea la ${hhmm})`;
}
