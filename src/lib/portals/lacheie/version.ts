/**
 * `X-Source-Version` pentru La Cheie — aritmetică pe ȘIRURI, cu BigInt.
 *
 * Portalul acceptă valori întregi foarte mari; `Number` ar pierde precizia
 * peste 2^53, deci versiunea este păstrată și trimisă EXCLUSIV ca text zecimal.
 * Versiunea este separată PER external_id, nu per proprietate sau agenție.
 *
 * Reguli implementate aici (fără rețea, fără DB):
 *  - o versiune nouă se generează doar pentru o operație NOUĂ;
 *  - un retry (timeout, 5xx, 429) refolosește EXACT aceeași versiune;
 *  - un 409 NU incrementează orbește: se marchează conflict, iar următoarea
 *    versiune se calculează din versiunea acceptată de portal, după reconcile.
 */

const DECIMAL = /^[0-9]{1,32}$/;

export function isValidSourceVersion(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.test(value) && value === stripLeadingZeros(value);
}

function stripLeadingZeros(value: string): string {
  const trimmed = value.replace(/^0+(?=\d)/, "");
  return trimmed === "" ? "0" : trimmed;
}

/** Normalizează orice reprezentare primită de la portal la text zecimal. */
export function normalizeSourceVersion(value: unknown): string | null {
  if (typeof value === "string" && DECIMAL.test(value.trim())) {
    return stripLeadingZeros(value.trim());
  }
  // Numerele întregi mici sunt acceptate, dar convertite imediat la text.
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  return null;
}

/** Prima versiune folosită pentru un external_id nou. */
export const FIRST_SOURCE_VERSION = "1";

/**
 * Versiunea următoare pentru o operație NOUĂ de scriere.
 * `accepted` (versiunea confirmată de portal la un 409) are prioritate față de
 * versiunea locală, ca să nu rămânem în urmă după un conflict.
 */
export function nextSourceVersion(input: {
  current: string | null;
  accepted?: string | null;
}): string {
  const current = isValidSourceVersion(input.current ?? "") ? BigInt(input.current as string) : 0n;
  const accepted =
    input.accepted && isValidSourceVersion(input.accepted) ? BigInt(input.accepted) : 0n;
  const base = accepted > current ? accepted : current;
  return (base + 1n).toString();
}

export function compareSourceVersions(a: string, b: string): -1 | 0 | 1 {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Citește versiunea acceptată dintr-un corp de răspuns 409, dacă există. */
export function acceptedVersionFromConflict(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const candidates = [
    record["accepted_version"],
    record["current_version"],
    record["source_version"],
    record["version"],
    (record["error"] as Record<string, unknown> | undefined)?.["accepted_version"],
    (record["data"] as Record<string, unknown> | undefined)?.["accepted_version"],
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSourceVersion(candidate);
    if (normalized) return normalized;
  }
  return null;
}
