/** Etichetele Vrexa din fila Publicare (browser-safe). */
export const VREXA_PENDING_LABEL = "În verificare la Vrexa";
export const VREXA_PENDING_SENTENCE = "Anunțul a ajuns la Vrexa și este în verificare.";
export const VREXA_INACTIVE_LABEL = "Oprit pe Vrexa";

/** `pending` (processing/pending la Vrexa) apare în celulă ca state `syncing`. */
export function vrexaPendingView(portalId: string, state: string): { label: string; pill: "pending" } | null {
  return portalId === "vrexa" && state === "syncing" ? { label: VREXA_PENDING_LABEL, pill: "pending" } : null;
}

/** „Oprit pe Vrexa”: nicio ofertă activă/în verificare și cel puțin una `inactive`. */
export function vrexaInactiveView(offers: Array<{ status?: string; env?: string }>, env: string): boolean {
  const mine = offers.filter((o) => (o.env === "production" ? "production" : "test") === env && o.status !== "deleted");
  return mine.length > 0 && mine.some((o) => o.status === "inactive") && !mine.some((o) => ["active", "pending", "processing", "rejected"].includes(o.status ?? ""));
}
