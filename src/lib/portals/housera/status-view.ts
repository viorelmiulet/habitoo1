/** Eticheta Housera din fila Publicare, după ofertele salvate (browser-safe). */
export type HouseraView = "paused" | "sold" | "deleted" | null;

export function houseraWithdrawnView(listingStatus: string | null | undefined, offers: Array<{ status?: string }>, externalId: string | null | undefined): HouseraView {
  if (listingStatus !== "withdrawn") return null;
  if (!offers.length) return externalId ? "deleted" : null;
  if (offers.some((o) => o.status === "sold")) return "sold";
  if (offers.every((o) => o.status === "paused")) return "paused";
  return null;
}

export const HOUSERA_VIEW_LABEL: Record<Exclude<HouseraView, null>, string> = {
  paused: "Pe pauză",
  sold: "Vândut",
  deleted: "Șters",
};

/** Housera „pending” (moderare) apare în celulă ca state `syncing`. */
export const HOUSERA_PENDING_LABEL = "În moderare Housera";
export const HOUSERA_PENDING_SENTENCE = "Anunțul a ajuns la Housera și așteaptă moderarea.";

export function houseraPendingView(portalId: string, state: string): { label: string; pill: "pending" } | null {
  return portalId === "housera" && state === "syncing" ? { label: HOUSERA_PENDING_LABEL, pill: "pending" } : null;
}
