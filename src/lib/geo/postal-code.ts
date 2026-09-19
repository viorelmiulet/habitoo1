/**
 * Codul poștal al ofertei: reguli pure, fără rețea și fără bază de date.
 *
 * Principii (aceleași în CRM, în feeduri și la backfill):
 *  - un cod introdus de om („manual”) nu se suprascrie NICIODATĂ;
 *  - un cod dedus se rezolvă din nou doar dacă adresa sau coordonatele s-au
 *    schimbat semnificativ față de momentul rezolvării;
 *  - nu inventăm niciodată un cod: dacă nu avem sursă, câmpul rămâne gol.
 */

export type PostalCodeSource = "manual" | "geocoded" | "approximate";

export type PostalCodeRow = {
  postal_code: string | null;
  postal_code_source: string | null;
  postal_code_resolved_from: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  county: string | null;
  lat: number | null;
  lng: number | null;
  locality_siruta_code: number | null;
  uat_siruta_code: number | null;
};

/** Precizie de ~11 m: suficient ca aceeași clădire să folosească un singur apel. */
export const COORD_CACHE_DECIMALS = 4;

export function coordCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(COORD_CACHE_DECIMALS)},${lng.toFixed(COORD_CACHE_DECIMALS)}`;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Amprenta locației folosită la rezolvare. Se schimbă doar la modificări
 * semnificative: altă stradă/zonă/localitate sau pinul mutat cu >~11 m.
 */
export function resolutionKey(row: PostalCodeRow): string {
  const text = [row.address, row.district, row.city, row.county].map(normalizeText).join("|");
  const coords =
    typeof row.lat === "number" && typeof row.lng === "number"
      ? coordCacheKey(row.lat, row.lng)
      : "-";
  return `${coords}#${text}`;
}

export type PostalDecision =
  | { resolve: false; reason: "manual" | "unchanged" | "no_location" }
  | { resolve: true; reason: "missing" | "location_changed" };

/** Decide dacă mai are rost să rezolvăm codul poștal pentru această ofertă. */
export function decidePostalResolution(row: PostalCodeRow): PostalDecision {
  const current = (row.postal_code ?? "").trim();
  const hasCoords = typeof row.lat === "number" && typeof row.lng === "number";
  const hasAddress = Boolean(
    normalizeText(row.city) || row.locality_siruta_code || row.uat_siruta_code,
  );
  if (current && row.postal_code_source !== "geocoded" && row.postal_code_source !== "approximate") {
    // Fără sursă cunoscută tratăm valoarea existentă ca introdusă de om.
    return { resolve: false, reason: "manual" };
  }
  if (!hasCoords && !hasAddress) return { resolve: false, reason: "no_location" };
  if (!current) return { resolve: true, reason: "missing" };
  if (row.postal_code_resolved_from !== resolutionKey(row)) {
    return { resolve: true, reason: "location_changed" };
  }
  return { resolve: false, reason: "unchanged" };
}

const POSTAL_RE = /^\d{6}$/;

/** Codurile poștale românești au exact 6 cifre; orice altceva se ignoră. */
export function normalizePostalCode(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D+/g, "");
  return POSTAL_RE.test(digits) ? digits : null;
}

export type PostalPick =
  | { postalCode: string; source: Exclude<PostalCodeSource, "manual"> }
  | { postalCode: null; source: null };

/**
 * Alege valoarea: codul de la nivel de stradă dacă furnizorul l-a întors,
 * altfel codul principal al localității („aproximativ”).
 */
export function pickPostalCode(input: {
  street: string | null | undefined;
  locality: string | null | undefined;
}): PostalPick {
  const street = normalizePostalCode(input.street);
  if (street) return { postalCode: street, source: "geocoded" };
  const locality = normalizePostalCode(input.locality);
  if (locality) return { postalCode: locality, source: "approximate" };
  return { postalCode: null, source: null };
}

/** Nota discretă din formular: doar pentru valorile de nivel localitate. */
export function postalCodeHint(source: string | null | undefined): string | null {
  return source === "approximate"
    ? "Cod poștal aproximativ (nivel localitate) — verifică-l dacă știi strada"
    : null;
}
