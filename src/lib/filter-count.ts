/** Numărul de filtre active pentru butonul „Filtre (n)”. Sortarea, pagina și vederea nu sunt filtre. */
export const NON_FILTER_KEYS = ["page", "pagina", "sort", "sortare", "sortDir", "view", "vedere", "perPage", "perPagina", "pageSize"] as const;

export function countActiveFilters(
  values: Record<string, unknown>,
  defaults: Record<string, unknown>,
  ignore: readonly string[] = NON_FILTER_KEYS,
): number {
  return Object.keys(defaults).filter((k) => !ignore.includes(k) && values[k] !== defaults[k]).length;
}

/** Numără valorile completate (nu goale) dintr-o listă de filtre aplicate. */
export function countFilledValues(values: readonly unknown[]): number {
  return values.filter((v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)).length;
}
