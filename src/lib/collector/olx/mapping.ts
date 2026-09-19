/**
 * Tipurile de proprietate ale colectorului și maparea categoriei OLX.
 *
 * Tipul vine din CATEGORIA DE CĂUTARE, niciodată din titlu. O categorie
 * nemapată dă „necunoscut”, fără ghiceli.
 */

export const COLLECTOR_PROPERTY_TYPES = [
  "garsonieră",
  "apartament 2 camere",
  "apartament 3 camere",
  "apartament 4+ camere",
  "casă/vilă",
  "teren",
  "spațiu comercial",
  "necunoscut",
] as const;

export type CollectorPropertyType = (typeof COLLECTOR_PROPERTY_TYPES)[number];

/** Categoria OLX → tipul nostru, din configurare. Nemapat → „necunoscut”. */
export function mapOlxCategoryId(
  categoryId: number | string | null | undefined,
  categoryTypes: Record<string, CollectorPropertyType>,
): CollectorPropertyType {
  if (categoryId === null || categoryId === undefined || categoryId === "") return "necunoscut";
  return categoryTypes[String(categoryId)] ?? "necunoscut";
}

/** Numele unei localități, normalizat pentru potrivirea exactă în nomenclator. */
export function localityKey(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
