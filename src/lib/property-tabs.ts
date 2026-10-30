/** Fila inițială a fișei: vechile linkuri „publishing” și „promotion” deschid fila unică Promovare. */
export function propertyTabFromSearch(tab: string | undefined): string {
  return tab === "publishing" || tab === "promotion" ? "publishing" : "overview";
}
