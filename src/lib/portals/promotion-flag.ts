/**
 * Promovarea prin flag (ex. Romimo `ad.promoted`): reguli pure, comune pentru
 * interfață și server. Valoarea salvată stă în `portal_publications.promoted`.
 */

/** „Promovat” există doar cât timp „Publicat” e bifat. */
export function effectivePromoted(published: boolean, promoted: boolean): boolean {
  return published && promoted;
}

/** Operația din jurnal când promovarea se schimbă; `null` = neschimbată. */
export function promotionOperation(
  saved: boolean,
  wanted: boolean,
): "promote_on" | "promote_off" | null {
  if (saved === wanted) return null;
  return wanted ? "promote_on" : "promote_off";
}

/**
 * Valoarea salvată după trimitere: doar un răspuns reușit al portalului o
 * schimbă; la refuz rămâne cea confirmată anterior (ex. NU); retragerea o șterge.
 */
export function promotedAfterAction(input: {
  action: "publish" | "update" | "withdraw";
  ok: boolean;
  saved: boolean;
  requested: boolean;
}): boolean {
  if (input.action === "withdraw") return input.ok ? false : input.saved;
  return input.ok ? input.requested : input.saved;
}
