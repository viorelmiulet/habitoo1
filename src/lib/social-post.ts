// Postare pe rețele sociale: șablon determinist din datele reale ale anunțului (fără AI).
// Ce lipsește din anunț lipsește și din text.
import { propertyTypeLabels } from "@/lib/labels";
import { formatMoney } from "@/lib/format";

export const SOCIAL_NETWORKS = ["facebook", "instagram", "whatsapp"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export const SOCIAL_NETWORK_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

export const SOCIAL_CHAR_LIMITS: Record<SocialNetwork, number> = {
  facebook: 2200,
  instagram: 2200,
  whatsapp: 1000,
};

export const SOCIAL_DEFAULT_PHOTOS = 5;
export const SOCIAL_MAX_PHOTOS = 10;

export type SocialPostData = {
  propertyType: string | null;
  transactionKind: "sale" | "rent";
  rooms: number | null;
  district: string | null;
  city: string | null;
  floor: number | null;
  usableSurface: number | null;
  features: string[];
  price: number | null;
  currency: string | null;
  agentName: string | null;
  agentPhone: string | null;
};

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function clean(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function typeLabel(d: SocialPostData): string {
  return d.propertyType ? (propertyTypeLabels[d.propertyType] ?? "") : "";
}

function roomsLabel(d: SocialPostData): string {
  if (d.propertyType === "studio" || !d.rooms || d.rooms <= 0) return "";
  return d.rooms === 1 ? "1 cameră" : `${d.rooms} camere`;
}

function floorLabel(d: SocialPostData): string {
  if (d.floor === null || d.floor === undefined) return "";
  return d.floor === 0 ? "Parter" : `Etaj ${d.floor}`;
}

function headline(d: SocialPostData): string {
  const what = [typeLabel(d), roomsLabel(d)].filter(Boolean).join(" ");
  const tx = d.transactionKind === "rent" ? "de închiriat" : "de vânzare";
  const where = [clean(d.district), clean(d.city)].filter(Boolean).join(", ");
  return [what ? `${what} ${tx}` : tx.charAt(0).toUpperCase() + tx.slice(1), where ? `în ${where}` : ""]
    .filter(Boolean)
    .join(" ");
}

function priceLine(d: SocialPostData): string {
  return typeof d.price === "number" && d.price > 0 && d.currency
    ? formatMoney(d.price, d.currency)
    : "";
}

function contactLine(d: SocialPostData): string {
  const phone = clean(d.agentPhone);
  if (!phone) return "";
  const name = clean(d.agentName);
  return `Pentru detalii și vizionare: ${name ? `${name}, ` : ""}${phone}`;
}

/** Hashtag-uri din zonă, tip + tranzacție și oraș (fără duplicate). */
export function socialHashtags(d: SocialPostData): string[] {
  const tags: string[] = [];
  const district = slug(clean(d.district));
  if (district) tags.push(district);
  const type = d.propertyType ? slug(propertyTypeLabels[d.propertyType] ?? "") : "";
  if (type) tags.push(`${type}${d.transactionKind === "rent" ? "deinchiriat" : "devanzare"}`);
  const city = slug(clean(d.city).replace(/\s*sector(ul)?\s*\d+/i, ""));
  if (city) tags.push(city);
  return [...new Set(tags)].map((t) => `#${t}`);
}

export function buildSocialPostText(network: SocialNetwork, d: SocialPostData): string {
  const details = [
    floorLabel(d),
    d.usableSurface ? `Suprafață utilă ${d.usableSurface} m²` : "",
  ].filter(Boolean);
  const features = d.features.map(clean).filter(Boolean).slice(0, network === "instagram" ? 3 : 5);
  const price = priceLine(d);
  const contact = contactLine(d);
  const tags = socialHashtags(d);

  if (network === "instagram") {
    const lines = [
      headline(d),
      [...details, ...features].join(" · "),
      price ? `Preț: ${price}` : "",
      contact,
      tags.join(" "),
    ];
    return lines.filter(Boolean).join("\n\n");
  }

  const bullets = [...details, ...(features.length ? [`Dotări: ${features.join(", ")}`] : [])]
    .map((l) => `• ${l}`)
    .join("\n");
  const parts = [headline(d), bullets, price ? `Preț: ${price}` : "", contact];
  if (network === "facebook" && tags.length) parts.push(tags.join(" "));
  return parts.filter(Boolean).join("\n\n");
}

/** Implicit primele 5 fotografii publicabile. */
export function defaultPhotoSelection(ids: string[]): string[] {
  return ids.slice(0, SOCIAL_DEFAULT_PHOTOS);
}

/** Bifează/debifează, păstrând ordinea selecției; maximum 10. */
export function togglePhotoSelection(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  if (selected.length >= SOCIAL_MAX_PHOTOS) return selected;
  return [...selected, id];
}

export type CatalogRowReason = "no_price" | "no_coordinates" | "no_images" | "no_city" | "not_published";

export const CATALOG_ROW_REASON_LABEL: Record<CatalogRowReason, string> = {
  no_price: "fără preț",
  no_coordinates: "fără coordonate",
  no_images: "fără poze",
  no_city: "fără oraș",
  not_published: "anunțul nu e publicat",
};

/** Dacă butonul AI apare: doar cu funcția de marketing AI activă pe agenție. */
export function showAiRewrite(isEnabled: (key: "ai_marketing") => boolean): boolean {
  return isEnabled("ai_marketing");
}
