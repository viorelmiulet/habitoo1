/** Rezumatul cardului „Publicare” din fișă: aceleași celule ca fila de publicare, fără logică nouă. */
export type SheetPortalCell = { portalId: string; portalName: string; availability: string; selected: boolean; state: string };
export type ShortState = "published" | "pending" | "error" | "none";

export function shortPortalState(state: string): ShortState {
  if (state === "published" || state === "in_feed") return "published";
  if (state === "error") return "error";
  if (state === "selected" || state === "syncing" || state === "needs_packet" || state === "expired") return "pending";
  return "none";
}

export const SHORT_STATE_LABEL: Record<ShortState, string> = { published: "publicat", pending: "în așteptare", error: "eroare", none: "nepublicat" };

export function publishSummary(cells: SheetPortalCell[]) {
  const active = cells.filter((c) => c.availability === "available");
  return { active, selected: active.filter((c) => c.selected).length, total: active.length };
}
