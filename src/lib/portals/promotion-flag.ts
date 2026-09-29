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

/**
 * Decizia din fluxul „Publică” pentru un portal cu promovare prin flag:
 * ce valoare se trimite, ce operație apare în jurnal și dacă o schimbare
 * doar la „Promovat” pe un anunț publicat cere o actualizare.
 */
export function promotionPlan(input: {
  flag: boolean;
  enabled: boolean;
  published: boolean;
  previous: boolean;
  savedPromoted: boolean;
  wantedPromoted: boolean | undefined;
}): {
  promoted: boolean;
  operation: "promote_on" | "promote_off" | null;
  /** Anunț deja publicat, schimbată doar promovarea → actualizare cu noul `promoted`. */
  promotionOnlyUpdate: boolean;
} {
  if (!input.flag) return { promoted: false, operation: null, promotionOnlyUpdate: false };
  const promoted = effectivePromoted(input.enabled, input.wantedPromoted ?? input.savedPromoted);
  const operation = promotionOperation(input.savedPromoted, promoted);
  return {
    promoted,
    operation,
    promotionOnlyUpdate: input.enabled && input.previous && input.published && operation !== null,
  };
}
