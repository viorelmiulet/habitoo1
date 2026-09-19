/**
 * Regulile de redactare recursivă folosite în tracing și audit.
 *
 * Două liste distincte, cu semantici diferite:
 * - `SECRET_PATTERN`: potrivire pe subșir, pentru secrete tehnice (chei, tokenuri,
 *   parole). O cheie ca `stripeApiKey` trebuie prinsă oriunde apare.
 * - `IDENTITY_KEYS`: potrivire exactă pe cheia normalizată (fără `_`/`-`, case
 *   insensitive), pentru câmpurile de identitate din actul de identitate.
 *   Potrivirea exactă este obligatorie ca să nu ascundem date operaționale:
 *   `address`, `adresa`, `propertyAddress` NU se redactează (adresele
 *   proprietăților trebuie să rămână vizibile în audit și tracing), iar
 *   `enumeratedValues` nu trebuie prins din cauza subșirului „nume”.
 */
export const SECRET_PATTERN = /(key|secret|token|password|apikey|authorization)/i;

/** Chei de identitate redactate prin potrivire exactă (după normalizare). */
export const IDENTITY_KEYS: ReadonlySet<string> = new Set([
  "cnp",
  "mrz",
  "serie",
  "series",
  "documentnumber",
  "birthdate",
  "dateofbirth",
  "datanasterii",
  "surname",
  "givennames",
  "fullname",
  "holdername",
  "nume",
  "prenume",
  "sex",
  "nationality",
  "nationalitate",
  "expirydate",
  "dataexpirarii",
  "imagebase64",
  "imagedata",
  "idimage",
  "documentimage",
  /* Adresa din actul de identitate — cheie dedicată, distinctă de `address`. */
  "idaddress",
  "adresaact",
]);

/** `documentNumber`, `document_number`, `DOCUMENT-NUMBER` → `documentnumber`. */
export function normalizeRedactionKey(key: string): string {
  return key.replace(/[_-]/g, "").toLowerCase();
}

/** Cheia se redactează dacă este un secret tehnic (subșir) sau un câmp de identitate (exact). */
export function isRedactedDetailKey(key: string): boolean {
  if (SECRET_PATTERN.test(key)) return true;
  return IDENTITY_KEYS.has(normalizeRedactionKey(key));
}

/** Numele câmpurilor returnate de modulul de citire a actului, pentru verificări. */
export const ID_DOCUMENT_FIELD_NAMES = [
  "documentNumber",
  "nationality",
  "birthDate",
  "sex",
  "expiryDate",
  "surname",
  "givenNames",
  "cnp",
  "series",
  "idAddress",
] as const;
