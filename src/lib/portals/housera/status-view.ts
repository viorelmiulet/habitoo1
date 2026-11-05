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
