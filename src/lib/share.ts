/**
 * Distribuire fără conexiuni la rețele: meniul de partajare al telefonului
 * (Web Share cu fișiere) sau linkuri publice de partajare pe calculator.
 */
import { formatMoney } from "@/lib/format";
import { OG_IMAGE_URL, SITE_URL } from "@/components/marketing/public-head";

export const OFFER_SITE_URL = SITE_URL;
export const SHARE_MAX_PHOTOS = 10;

export function offerShareUrl(propertyId: string) {
  return `${OFFER_SITE_URL}/oferta/${propertyId}`;
}

export type ShareNetwork = "facebook" | "whatsapp" | "linkedin";
export const SHARE_NETWORK_LABEL: Record<ShareNetwork, string> = { facebook: "Facebook", whatsapp: "WhatsApp", linkedin: "LinkedIn" };

export function shareLinks(link: string, text: string): Record<ShareNetwork, string> {
  const u = encodeURIComponent(link);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent([text.trim(), link].filter(Boolean).join("\n\n"))}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
  };
}

type ShareNav = { canShare?: (data?: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };

/** Telefonul poate partaja fișiere? (butoanele „Distribuie …” apar doar atunci) */
export function canShareFiles(nav: ShareNav | undefined | null, sample?: File[]): boolean {
  if (!nav?.canShare || !nav.share) return false;
  const files = sample ?? (typeof File !== "undefined" ? [new File([new Uint8Array([0])], "test.jpg", { type: "image/jpeg" })] : []);
  try { return files.length > 0 && nav.canShare({ files }) === true; } catch { return false; }
}

export type OfferOgInput = {
  id: string; title: string; price: number | null; currency: string; transactionKind: string;
  rooms: number | null; usableSurface: number | null; district: string | null; city: string | null;
  agencyName: string | null; images: { id: string; width?: number | null; height?: number | null }[];
};

/** Metadate de previzualizare pentru /oferta/<id>. Fără sursa anunțului sau data adăugării. */
export function offerOgMeta(o: OfferOgInput, origin = OFFER_SITE_URL) {
  const first = o.images[0];
  const image = first ? `${origin.replace(/\/$/, "")}/api/public/sites/v1/media/${first.id}.jpg` : OG_IMAGE_URL;
  const width = first ? first.width ?? null : 1200;
  const height = first ? first.height ?? null : 630;
  const price = o.price ? `${formatMoney(o.price, o.currency)}${o.transactionKind === "rent" ? "/lună" : ""}` : "Preț la cerere";
  const facts = [
    o.rooms ? `${o.rooms} ${o.rooms === 1 ? "cameră" : "camere"}` : null,
    o.usableSurface ? `${Math.round(o.usableSurface)} mp utili` : null,
    o.district || o.city ? [o.district, o.city].filter(Boolean).join(", ") : null,
  ].filter(Boolean);
  return { image, width, height, description: [price, ...facts].join(" · "), siteName: o.agencyName || "Habitoo" };
}
