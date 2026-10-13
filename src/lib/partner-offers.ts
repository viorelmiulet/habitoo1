export const PARTNER_OFFERS_PAGE_SIZE = 24;
export type PartnerOfferView = "cards" | "list";
export type PartnerOfferSort = "newest" | "price-asc" | "price-desc" | "commission-desc";
export const PARTNER_OFFER_SORTS = {
  newest: { column: "created_at", ascending: false },
  "price-asc": { column: "price", ascending: true },
  "price-desc": { column: "price", ascending: false },
  "commission-desc": { column: "collab_commission_percent", ascending: false },
} as const;
export function partnerOfferViewKey(userId: string) { return `habitoo-partner-offers-view:${userId}`; }
export function parsePartnerOfferView(value: string | null): PartnerOfferView { return value === "list" ? "list" : "cards"; }
export function nextPartnerOfferOffset(loaded: number, total: number) { return loaded < total ? loaded : undefined; }