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
  "primulanunt",
  "lacheie",
  "vdi",
  "imobiliare_ro",
  "romimo",
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
