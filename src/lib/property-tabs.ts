/** Fila inițială a fișei: vechile linkuri „publishing” și „promotion” deschid fila unică Promovare. */
export function propertyTabFromSearch(tab: string | undefined): string {
  if (tab === "location") return "location";
  return tab === "publishing" || tab === "promotion" ? "publishing" : "overview";
}
