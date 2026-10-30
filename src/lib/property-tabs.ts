const DIRECT_TABS = new Set(["agent", "location", "description", "price", "overview", "media", "matching", "documents", "acp", "history"]);

/** Fila inițială a fișei: „publishing”/„promotion” → Promovare; file eliminate sau necunoscute → Caracteristici. */
export function propertyTabFromSearch(tab: string | undefined): string {
  if (tab === "publishing" || tab === "promotion") return "publishing";
  return tab && DIRECT_TABS.has(tab) ? tab : "overview";
}
