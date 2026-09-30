import type { PropertyPortalCell } from "@/lib/portals.functions";

export type PropertyListDetailInput = {
  reference?: string | null;
  district?: string | null;
  city?: string | null;
  surface?: number | null;
  rooms?: number | null;
  floor?: number | null;
};

export function formatPropertyListDetails(property: PropertyListDetailInput): string {
  const location = [property.district, property.city].filter(Boolean).join(", ");
  const floor = property.floor === -1
    ? "demisol"
    : property.floor === 0
      ? "parter"
      : property.floor !== null && property.floor !== undefined
        ? `etaj ${property.floor}`
        : null;
  const rooms = property.rooms
    ? `${property.rooms} ${property.rooms === 1 ? "cameră" : "camere"}`
    : null;

  return [
    property.reference,
    location || null,
    property.surface ? `${new Intl.NumberFormat("ro-RO").format(property.surface)} m²` : null,
    rooms,
    floor,
  ].filter(Boolean).join(" · ");
}

export function formatPropertyListPrice(
  price: number | null | undefined,
  currency: string | null | undefined,
  transaction: string,
  surface: number | null | undefined,
) {
  if (price === null || price === undefined) return { main: "—", suffix: null, perSquareMeter: null };
  const code = currency || "EUR";
  const amount = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Number(price));
  const main = code === "EUR" ? `${amount} €` : `${amount} ${code}`;
  const perSquareMeter = surface && surface > 0
    ? `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Math.round(Number(price) / surface))} ${code === "EUR" ? "€" : code}/m²`
    : null;
  return { main, suffix: transaction === "rent" ? "/lună" : null, perSquareMeter };
}

export type PortalDotTone = "success" | "warning" | "danger" | "neutral";

export function portalDotTone(state: PropertyPortalCell["state"]): PortalDotTone {
  if (state === "published" || state === "in_feed") return "success";
  if (state === "selected" || state === "syncing" || state === "expired") return "warning";
  if (state === "error") return "danger";
  return "neutral";
}

export function portalStateLabel(state: PropertyPortalCell["state"]): string {
  const labels: Record<PropertyPortalCell["state"], string> = {
    published: "publicat",
    in_feed: "în feed",
    selected: "selectat",
    syncing: "în curs",
    expired: "expirat",
    error: "eroare",
    withdrawn: "retras",
    not_selected: "neselectat",
    not_configured: "neconfigurat",
    coming_soon: "indisponibil momentan",
  };
  return labels[state];
}

export function canShowDeleteAction(allowed: boolean): boolean {
  return allowed;
}
