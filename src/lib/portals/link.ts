/**
 * Decizia despre linkul public al unei oferte, izolată de I/O.
 *
 * Regula: o verificare care nu a reușit NU șterge linkul salvat. Linkul se
 * consideră dispărut doar când portalul raportează explicit o stare diferită
 * de `online`.
 */
export type LinkDiagnostics = {
  offerUrl: string | null;
  stateKnown?: boolean;
  portalState?: string | null;
  /**
   * Anunțul este `online` la portal, dar pagina publică nu funcționează din
   * motive de cont (ex. abonament inactiv). Linkul NU se afișează, dar nici nu
   * se șterge din bază: nu este o ciornă confirmată de portal.
   */
  offerUrlSuppressed?: boolean;
} | null;

export function portalSaysOffline(diagnostics: LinkDiagnostics): boolean {
  return diagnostics?.stateKnown === true && diagnostics.portalState !== "online";
}

/** Ce se salvează în `portal_listings.public_url`. */
export function resolveListingPublicUrl(
  diagnostics: LinkDiagnostics,
  stored: string | null,
): string | null {
  if (diagnostics?.offerUrl) return diagnostics.offerUrl;
  if (portalSaysOffline(diagnostics)) return null;
  return stored;
}

/** Ce se arată utilizatorului: niciun link care duce în prima pagină. */
export function displayListingPublicUrl(
  diagnostics: LinkDiagnostics,
  stored: string | null,
): string | null {
  if (diagnostics?.offerUrlSuppressed === true) return null;
  return resolveListingPublicUrl(diagnostics, stored);
}

/**
 * Backfill: scriem `public_url` DOAR când portalul raportează `online` și
 * trimite efectiv adresa, iar aceasta diferă de cea salvată. O ciornă nu
 * produce nicio scriere (nu ștergem, nu inventăm).
 */
export function shouldSaveBackfilledUrl(
  state: string | null,
  url: string | null,
  stored: string | null,
): boolean {
  return state === "online" && url !== null && url !== stored;
}
