/**
 * Evenimentele Housera (webhook + `GET events`): decizia pură pentru fiecare tip
 * și aplicarea ei pe rândul `portal_listings`. Fără acces la DB.
 */
import type { PortalOffer } from "../imobiliare/offer-links";

export type HouseraEvent = { id: string; type: string; created_at?: string; connection?: unknown; data: Record<string, unknown> };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseHouseraEvent(value: unknown): HouseraEvent | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const id = str(o["id"]);
  const type = str(o["type"]);
  if (!id || !type) return null;
  const data = o["data"] && typeof o["data"] === "object" ? (o["data"] as Record<string, unknown>) : {};
  return { id, type, created_at: str(o["created_at"]) ?? undefined, connection: o["connection"], data };
}

/** `connection` din corp: șir sau `{ id }`. */
export function houseraEventConnection(e: HouseraEvent): string | null {
  const c = e.connection;
  if (typeof c === "string" || typeof c === "number") return String(c).trim() || null;
  if (c && typeof c === "object") return str((c as Record<string, unknown>)["id"]) ?? (typeof (c as Record<string, unknown>)["id"] === "number" ? String((c as Record<string, unknown>)["id"]) : null);
  return null;
}

export const HOUSERA_DEFERRED_NOTE = "neprocesat";
export const HOUSERA_UNCONFIRMED_WARNING = "Housera a scos anunțul din căutare: disponibilitatea nu a fost confirmată.";
export const HOUSERA_EDITED_WARNING = "Anunțul a fost editat în Housera; la următoarea salvare în Habitoo se retrimite varianta din Habitoo.";

const REJECTION_RO: Record<string, string> = {
  contact_in_text: "date de contact în text",
  duplicate: "anunț duplicat",
  duplicate_listing: "anunț duplicat",
  wrong_price: "preț greșit",
  wrong_location: "locație greșită",
  wrong_category: "categorie greșită",
  low_quality_photos: "poze de calitate slabă",
  watermark: "poze cu watermark",
  misleading: "conținut înșelător",
};
const MEDIA_RO: Record<string, string> = {
  download_failed: "nu au putut fi descărcate",
  hotspot_photo_missing: "un punct de pe plan nu și-a găsit poza",
  processing_failed: "nu au putut fi procesate",
};

function rejectionText(d: Record<string, unknown>): string {
  const codes = Array.isArray(d["rejection_codes"]) ? (d["rejection_codes"] as unknown[]).filter((c): c is string => typeof c === "string") : [];
  const reason = str(d["reason"]);
  const ro = codes.map((c) => REJECTION_RO[c] ?? c);
  return [reason, ro.length ? `(${ro.join(", ")})` : null].filter(Boolean).join(" ") || "motiv nespecificat";
}

export type HouseraEffect =
  | { kind: "log"; note: string }
  | { kind: "deferred"; note: string }
  | {
      kind: "listing";
      code: string | null;
      externalRef: string | null;
      /** Noua stare a ofertei (`null` = neschimbată). */
      offerStatus: string | null;
      /** Oferta a fost ștearsă pe Housera: se scoate din `portal_offers`. */
      remove?: boolean;
      etag?: string | null;
      url?: string | null;
      lastError?: string | null;
      lastWarning?: string | null;
      notify?: "published" | "rejected";
    };

export function houseraEventEffect(e: HouseraEvent): HouseraEffect {
  const d = e.data;
  const [group] = e.type.split(".");
  if (e.type === "webhook.test") return { kind: "log", note: "webhook.test" };
  if (group === "lead" || group === "viewing" || group === "partnership" || group === "complex") return { kind: "deferred", note: HOUSERA_DEFERRED_NOTE };
  const base = { kind: "listing" as const, code: str(d["code"]), externalRef: str(d["external_ref"]) };
  const status = str(d["status"]);
  const etag = str(d["etag"]);
  switch (e.type) {
    case "listing.published":
      return { ...base, offerStatus: status ?? "active", url: str(d["url"]), lastError: null, notify: "published" };
    case "listing.rejected":
      return { ...base, offerStatus: status ?? "rejected", lastError: `Housera a respins anunțul: ${rejectionText(d)}.`, notify: "rejected" };
    case "listing.paused":
      return { ...base, offerStatus: status ?? "paused" };
    case "listing.reactivated":
      return { ...base, offerStatus: status ?? "active", lastWarning: null };
    case "listing.sold":
      return { ...base, offerStatus: status ?? "sold" };
    case "listing.unconfirmed":
      return { ...base, offerStatus: status ?? "unconfirmed", lastWarning: HOUSERA_UNCONFIRMED_WARNING };
    case "listing.withdrawn":
      return d["deleted"] === true ? { ...base, offerStatus: null, remove: true } : { ...base, offerStatus: status ?? "withdrawn" };
    case "listing.edit_approved":
      return { ...base, offerStatus: status, etag, lastWarning: null };
    case "listing.edit_rejected":
      return { ...base, offerStatus: status, lastWarning: `Housera a respins modificarea: ${rejectionText(d)}. Versiunea publică rămâne cea veche.` };
    case "listing.edited_in_portal":
      return { ...base, offerStatus: status, etag, lastWarning: HOUSERA_EDITED_WARNING };
    case "media.failed": {
      const n = typeof d["count"] === "number" ? d["count"] : Number(d["count"]) || 0;
      const reason = str(d["reason"]);
      return { ...base, offerStatus: null, lastWarning: `Housera a refuzat ${n} ${n === 1 ? "poză" : "poze"}: ${reason ? MEDIA_RO[reason] ?? reason : "motiv nespecificat"}.` };
    }
    default:
      return { kind: "log", note: `fără efect (${e.type})` };
  }
}

export function findHouseraOffer(offers: PortalOffer[], code: string | null, externalRef: string | null): number {
  if (code) { const i = offers.findIndex((o) => o.id === code); if (i >= 0) return i; }
  if (externalRef) return offers.findIndex((o) => o.reference === externalRef);
  return -1;
}

/** Starea rândului `portal_listings` derivată din ofertele Housera. */
export function houseraListingStatus(offers: PortalOffer[], current: string): string {
  if (!offers.length) return "withdrawn";
  const s = offers.map((o) => o.status ?? "");
  if (s.some((x) => x === "active" || x === "unconfirmed")) return "published";
  if (s.some((x) => x === "pending" || x === "draft")) return "pending";
  if (s.some((x) => x === "rejected")) return "error";
  if (s.every((x) => x === "")) return current;
  return "withdrawn";
}

export type HouseraListingRow = { status: string; portal_offers: PortalOffer[]; public_url: string | null; last_error: string | null; last_warning: string | null; published_at: string | null };
export type HouseraListingPatch = Partial<HouseraListingRow> & { last_event_at: string };

/** Aplică efectul pe rând; `null` = oferta nu a fost găsită. */
export function applyHouseraEffect(row: HouseraListingRow, effect: Extract<HouseraEffect, { kind: "listing" }>, nowIso: string): HouseraListingPatch | null {
  const offers = row.portal_offers.map((o) => ({ ...o }));
  const i = findHouseraOffer(offers, effect.code, effect.externalRef);
  if (i < 0) return null;
  if (effect.remove) offers.splice(i, 1);
  else {
    const o = offers[i]!;
    if (effect.offerStatus) o.status = effect.offerStatus;
    if (effect.etag) o.etag = effect.etag;
    if (effect.url && effect.url.startsWith("https://")) o.url = effect.url;
  }
  const status = houseraListingStatus(offers, row.status);
  const patch: HouseraListingPatch = { portal_offers: offers, status, last_event_at: nowIso };
  if (effect.url && effect.url.startsWith("https://")) patch.public_url = effect.url;
  if (effect.lastError !== undefined) patch.last_error = effect.lastError;
  if (effect.lastWarning !== undefined) patch.last_warning = effect.lastWarning;
  if (status === "published" && !row.published_at) patch.published_at = nowIso;
  return patch;
}
