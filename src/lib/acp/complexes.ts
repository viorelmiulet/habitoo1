/**
 * Ansambluri rezidențiale recunoscute de ACP.
 *
 * Un ansamblu este tratat ca zonă separată, cu propria localitate (de ex.
 * Militari Residence → Chiajna, Ilfov), indiferent de orașul înregistrat în
 * fișa proprietății (care rămâne neschimbat pentru portaluri). Pentru un
 * ansamblu nou se adaugă doar o intrare în listă.
 */
export type AcpResidentialComplex = {
  key: string;
  label: string;
  city: string;
  county: string;
  /** Se aplică pe text normalizat (minuscule, fără diacritice, spații simple). */
  pattern: RegExp;
  /** Fragmente pentru căutarea în baza de date (ILIKE), fără caractere speciale. */
  searchTerms: string[];
};

export const ACP_RESIDENTIAL_COMPLEXES: readonly AcpResidentialComplex[] = [
  {
    key: "militari-residence",
    label: "Militari Residence",
    city: "Chiajna",
    county: "Ilfov",
    pattern: /\bmilitari ?re[sz]i[dn]?[ea]n[ct]\w*/,
    searchTerms: ["militari resid", "militari rezid", "militari-resid", "militariresid"],
  },
];

const DIACRITICS: Record<string, string> = { ă: "a", â: "a", î: "i", ș: "s", ş: "s", ț: "t", ţ: "t" };

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ăâîșşțţ]/g, (c) => DIACRITICS[c] ?? c)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Primul ansamblu menționat în oricare dintre texte (titlu, descriere, adresă). */
export function detectResidentialComplex(
  ...texts: (string | null | undefined)[]
): AcpResidentialComplex | null {
  const joined = normalize(texts.filter((t): t is string => typeof t === "string").join(" "));
  if (!joined) return null;
  return ACP_RESIDENTIAL_COMPLEXES.find((c) => c.pattern.test(joined)) ?? null;
}

export function residentialComplexByKey(key: string | null | undefined): AcpResidentialComplex | null {
  if (!key) return null;
  return ACP_RESIDENTIAL_COMPLEXES.find((c) => c.key === key) ?? null;
}
