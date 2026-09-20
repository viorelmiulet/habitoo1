/**
 * Maparea rezultatelor Apify în forma ofertelor de piață Habitoo.
 *
 * Modul pur: nu face rețea și nu atinge baza de date. Maparea configurată pe
 * sursă (`field_mapping`) se compune peste maparea generică Habitoo, deci
 * normalizarea rămâne cea existentă (`normalizeRecord`). Nu inventăm valori:
 * ce lipsește rămâne gol. Un rând fără preț sau fără url este respins și
 * numărat cu motiv.
 */
import {
  MARKET_FIELDS,
  normalizeRecord,
  textValue,
  type MarketField,
  type MarketFieldMapping,
  type NormalizedListing,
} from "../normalize";
import { HABITOO_MAPPING } from "../sources";
import { normalizeRoName } from "@/lib/ro-normalize";

/** Câmpuri suplimentare pe care le citim, dar care nu au coloană proprie. */
export const APIFY_EXTRA_FIELDS = ["sellerType", "listingDate", "images"] as const;
export type ApifyExtraField = (typeof APIFY_EXTRA_FIELDS)[number];

/** Maparea stocată pe sursă: câmpul nostru → cheia (sau cheile) actorului. */
export type ApifyFieldMapping = Partial<
  Record<MarketField | ApifyExtraField, string | string[]>
>;

export type ApifyDiscard = { reference: string; reason: string };

export type ApifyMapResult = {
  listings: NormalizedListing[];
  discarded: ApifyDiscard[];
};

export type ApifySellerType = "owner" | "agency" | "unknown";

const MARKET_FIELD_SET = new Set<string>(MARKET_FIELDS);

/** Cheile de mapare pentru câmpurile cu coloană proprie. */
export function apifyMarketMapping(custom: ApifyFieldMapping | null): MarketFieldMapping {
  const out: MarketFieldMapping = { ...HABITOO_MAPPING };
  for (const [field, keys] of Object.entries(custom ?? {})) {
    if (!MARKET_FIELD_SET.has(field) || !keys) continue;
    out[field as MarketField] = keys;
  }
  return out;
}

function readPath(record: Record<string, unknown>, key: string): unknown {
  if (key in record) return record[key];
  if (key.includes(".")) {
    let current: unknown = record;
    for (const part of key.split(".")) {
      if (current === null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(record)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function readExtra(
  record: Record<string, unknown>,
  custom: ApifyFieldMapping | null,
  field: ApifyExtraField,
  fallbacks: readonly string[],
): unknown {
  const configured = custom?.[field];
  const keys = configured
    ? Array.isArray(configured)
      ? configured
      : [configured]
    : fallbacks;
  for (const key of keys) {
    const value = readPath(record, key);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/** Tipul vânzătorului, doar dacă sursa îl declară explicit. */
export function classifySellerType(value: unknown): ApifySellerType {
  if (typeof value === "boolean") return value ? "agency" : "owner";
  const text = textValue(value);
  if (text === null) return "unknown";
  const norm = normalizeRoName(text);
  if (/(proprietar|owner|persoana fizica|private|particular)/.test(norm)) return "owner";
  if (/(agentie|agency|agent|business|firma|dezvoltator|developer|company)/.test(norm)) {
    return "agency";
  }
  return "unknown";
}

/** Data anunțului, dacă sursa o publică într-o formă interpretabilă. */
export function parseListingDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const text = textValue(value);
  if (text === null) return null;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/** Toate url-urile de imagine publicate, fără descărcarea vreunui octet. */
export function collectImageUrls(value: unknown): string[] {
  const out: string[] = [];
  const push = (candidate: unknown) => {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nested = (candidate as Record<string, unknown>)["url"];
      if (typeof nested === "string") push(nested);
      return;
    }
    const text = textValue(candidate);
    if (text && /^https?:\/\//i.test(text) && !out.includes(text)) out.push(text);
  };
  if (Array.isArray(value)) value.forEach(push);
  else if (typeof value === "string") value.split(/[,\s]+/).forEach(push);
  else push(value);
  return out;
}

/**
 * Mapează un lot de rezultate Apify.
 * Ordinea regulilor: normalizarea existentă decide validitatea de bază, apoi
 * cerem explicit preț și url.
 */
export function mapApifyItems(
  sourceId: string,
  items: readonly unknown[],
  custom: ApifyFieldMapping | null,
): ApifyMapResult {
  const mapping = apifyMarketMapping(custom);
  const listings: NormalizedListing[] = [];
  const discarded: ApifyDiscard[] = [];

  items.forEach((item, index) => {
    const reference = `element ${index + 1}`;
    const result = normalizeRecord(sourceId, item, mapping);
    if (!result.ok) {
      discarded.push({
        reference,
        reason: result.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "),
      });
      return;
    }
    const listing = result.listing;
    if (listing.price === null || listing.price <= 0) {
      discarded.push({ reference: listing.sourceListingId, reason: "Lipsește prețul." });
      return;
    }
    if (listing.url === null) {
      discarded.push({ reference: listing.sourceListingId, reason: "Lipsește adresa anunțului." });
      return;
    }

    const record = item as Record<string, unknown>;
    const seller = classifySellerType(
      readExtra(record, custom, "sellerType", [
        "sellerType",
        "seller_type",
        "isBusiness",
        "is_agency",
        "advertiserType",
        "tip_vanzator",
      ]),
    );
    if (seller === "owner") listing.features["vanzator proprietar"] = true;
    if (seller === "agency") listing.features["vanzator agentie"] = true;

    const listingDate = parseListingDate(
      readExtra(record, custom, "listingDate", [
        "listingDate",
        "listing_date",
        "publishedAt",
        "published_at",
        "createdAt",
        "created_at",
        "data",
      ]),
    );
    if (listingDate) listing.rawData.original["listingDate"] = listingDate;

    const images = collectImageUrls(
      readExtra(record, custom, "images", ["images", "imageUrls", "photos", "poze"]),
    );
    if (!listing.imageUrl && images[0]) listing.imageUrl = images[0];
    if (images.length > 0) {
      listing.rawData.original["imageUrls"] = images.join(" ").slice(0, 500);
    }

    listings.push(listing);
  });

  return { listings, discarded };
}

/** Motivele de respingere, grupate pentru raportare. */
export function summarizeDiscards(discarded: readonly ApifyDiscard[]): {
  reason: string;
  count: number;
}[] {
  const counts = new Map<string, number>();
  for (const item of discarded) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
