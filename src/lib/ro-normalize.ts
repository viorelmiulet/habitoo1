/**
 * Normalizare pentru căutarea în nomenclatorul SIRUTA.
 * Trebuie să producă exact același rezultat ca funcția SQL public.ro_normalize_name:
 * fără diacritice, litere mici, orice caracter care nu e literă/cifră devine spațiu,
 * spațiile multiple sunt comprimate și cele de la capete eliminate.
 *
 * "Chiajna" → "chiajna" · "Brașov" → "brasov" · "București" → "bucuresti"
 */
export function normalizeRoName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ș|ş/gi, "s")
    .replace(/ț|ţ/gi, "t")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Prefixele administrative din denumirile oficiale, eliminate pentru afișare. */
export function prettyUatName(name: string): string {
  return name
    .replace(/^(MUNICIPIUL|ORAŞ|ORAȘ|ORASUL|ORAŞUL|ORAȘUL|COMUNA|JUDEŢUL|JUDEȚUL)\s+/i, "")
    .trim();
}

/** Denumire cu prima literă mare per cuvânt, pentru datele oficiale scrise cu majuscule. */
export function titleCaseRo(value: string): string {
  return value
    .toLocaleLowerCase("ro-RO")
    .split(/(\s|-|\/)/)
    .map((part) =>
      /^[\s\-/]$/.test(part) ? part : part.charAt(0).toLocaleUpperCase("ro-RO") + part.slice(1),
    )
    .join("");
}

/**
 * Variante de denumire normalizată pentru potrivirea cu nomenclatorul, unde
 * denumirile oficiale includ prefixul administrativ ("MUNICIPIUL BUCUREŞTI").
 */
export function nameVariants(value: string): string[] {
  const base = normalizeRoName(prettyUatName(value));
  if (!base) return [];
  return [
    base,
    `municipiul ${base}`,
    `orasul ${base}`,
    `oras ${base}`,
    `comuna ${base}`,
    `judetul ${base}`,
  ];
}
