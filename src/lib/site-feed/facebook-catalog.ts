/**
 * Feed CSV pentru Catalogul Facebook (Meta Commerce Manager, „Home listings”).
 * Logică pură, fără acces la DB: primește rândurile deja citite și produce CSV-ul
 * plus statistica de excludere. Nu inventează valori: lipsă = gol sau exclus.
 */
import { publicCoords } from "@/lib/geo";
import {
  feedImageUrl,
  isImageFeedEligible,
  offerUrl,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";

export const FACEBOOK_MAX_IMAGES = 20;

export const FACEBOOK_CATALOG_COLUMNS = [
  "home_listing_id",
  "name",
  "description",
  "availability",
  "price",
  "url",
  ...Array.from({ length: FACEBOOK_MAX_IMAGES }, (_, i) => `image[${i}].url`),
  "address.addr1",
  "address.city",
  "address.region",
  "address.country",
  "address.postal_code",
  "latitude",
  "longitude",
  "neighborhood[0]",
  "property_type",
  "listing_type",
  "num_beds",
  "num_baths",
  "year_built",
  "area_size",
  "area_unit",
] as const;

export type ExclusionReason = "no_price" | "no_coordinates" | "no_images" | "no_city";

export type FacebookCatalogResult = {
  csv: string;
  included: number;
  excluded: Record<ExclusionReason, number>;
  /** Anunțurile excluse, cu primul motiv (aditiv; nu intră în CSV). */
  excludedItems?: { id: string; reference: string | null; title: string; reason: ExclusionReason }[];
  excludedTotal: number;
};

/** Escapare RFC 4180: ghilimele dacă apare separator, ghilimele sau newline. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Text simplu din descriere: fără taguri HTML, entități de bază decodate. */
export function plainText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** ş/ţ (sedilă) → ș/ț (virgulă), inclusiv majuscule. */
export function normalizeRoDiacritics(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u015F/g, "\u0219")
    .replace(/\u015E/g, "\u0218")
    .replace(/\u0163/g, "\u021B")
    .replace(/\u0162/g, "\u021A")
    .trim();
}

const BUCHAREST_RE = /^bucure[sșş]ti\b/i;
const SECTOR_RE = /\bsector(?:ul)?\s*([1-6])\b/i;

/** Oraș curat pentru Meta + sectorul (1–6), dacă reiese din oraș. */
export function metaCity(raw: string | null | undefined): { city: string; sector: number | null } {
  const value = normalizeRoDiacritics(raw);
  const sectorMatch = SECTOR_RE.exec(value);
  const sector = sectorMatch ? Number(sectorMatch[1]) : null;
  if (BUCHAREST_RE.test(value) || (sector !== null && value.replace(SECTOR_RE, "").trim() === "")) {
    return { city: "București", sector };
  }
  return { city: value, sector: null };
}

/** Valorile Meta pentru property_type: apartment, condo, house, land, townhouse, other... */
export function metaPropertyType(type: string | null | undefined): string {
  switch (type) {
    case "apartment":
    case "studio":
      return "apartment";
    case "house":
    case "villa":
      return "house";
    case "land":
      return "land";
    default:
      return "other";
  }
}

type Offer = { mode: "sale" | "rent"; amount: number; currency: string };

/** Vânzarea are prioritate; închirierea doar dacă nu e de vânzare cu preț. */
export function pickOffer(p: PropertyRow): Offer | null {
  const isRent = p.transaction_kind === "rent";
  const forSale = p.for_sale ?? !isRent;
  const forRent = p.for_rent ?? isRent;
  const salePrice = p.sale_price ?? (isRent ? null : p.price);
  const rentPrice = p.rent_price ?? (isRent ? p.price : null);
  const saleCurrency = p.sale_currency ?? (isRent ? null : p.currency);
  const rentCurrency = p.rent_currency ?? (isRent ? p.currency : null);
  if (forSale && typeof salePrice === "number" && salePrice > 0 && saleCurrency) {
    return { mode: "sale", amount: salePrice, currency: saleCurrency.toUpperCase() };
  }
  if (forRent && typeof rentPrice === "number" && rentPrice > 0 && rentCurrency) {
    return { mode: "rent", amount: rentPrice, currency: rentCurrency.toUpperCase() };
  }
  return null;
}

/** active/negotiation → for_sale|for_rent; reserved → sale_pending (doar la vânzare). */
export function metaAvailability(status: string, mode: "sale" | "rent"): string {
  if (mode === "sale" && status === "reserved") return "sale_pending";
  return mode === "sale" ? "for_sale" : "for_rent";
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function buildFacebookCatalogCsv(input: {
  properties: PropertyRow[];
  imagesByProperty: Map<string, PropertyImageRow[]>;
  baseUrl: string;
  publicSiteUrl: string;
}): FacebookCatalogResult {
  const excluded: Record<ExclusionReason, number> = {
    no_price: 0,
    no_coordinates: 0,
    no_images: 0,
    no_city: 0,
  };
  const lines = [FACEBOOK_CATALOG_COLUMNS.join(",")];
  const excludedItems: NonNullable<FacebookCatalogResult["excludedItems"]> = [];
  let included = 0;

  for (const p of input.properties) {
    const offer = pickOffer(p);
    const coords = publicCoords(p);
    const images = (input.imagesByProperty.get(p.id) ?? [])
      .filter(isImageFeedEligible)
      .sort((a, b) =>
        a.is_primary === b.is_primary
          ? (a.position ?? 0) - (b.position ?? 0)
          : a.is_primary
            ? -1
            : 1,
      )
      .slice(0, FACEBOOK_MAX_IMAGES);
    const { city, sector } = metaCity(p.city);

    // Un singur motiv per anunț, în ordinea priorității.
    const reason: ExclusionReason | null = !offer
      ? "no_price"
      : !coords
        ? "no_coordinates"
        : images.length === 0
          ? "no_images"
          : !city
            ? "no_city"
            : null;
    if (reason || !offer || !coords) {
      if (reason) {
        excluded[reason] += 1;
        excludedItems.push({ id: p.id, reference: p.reference ?? null, title: p.title, reason });
      }
      continue;
    }

    const imageCols = Array.from({ length: FACEBOOK_MAX_IMAGES }, (_, i) =>
      images[i] ? feedImageUrl(input.baseUrl, images[i]!.id) : "",
    );
    const addr1 = p.location_precise
      ? [p.street, p.street_number].filter((v) => v && String(v).trim()).join(" ") ||
        (p.address ?? "")
      : "";
    const area = p.usable_surface ?? p.surface ?? null;

    const row: (string | number | null)[] = [
      p.reference ?? p.id,
      p.title,
      plainText(p.description),
      metaAvailability(p.status, offer.mode),
      `${formatAmount(offer.amount)} ${offer.currency}`,
      offerUrl(input.publicSiteUrl, p.id),
      ...imageCols,
      addr1,
      city,
      metaCity(p.county).city,
      "RO",
      p.postal_code ?? "",
      coords.lat,
      coords.lng,
      normalizeRoDiacritics(p.district) || (sector ? `Sectorul ${sector}` : ""),
      metaPropertyType(p.property_type),
      offer.mode === "sale" ? "for_sale_by_agent" : "for_rent_by_agent",
      p.bedrooms ?? null,
      p.bathrooms ?? null,
      p.build_year ?? null,
      area,
      area !== null ? "sq_m" : "",
    ];
    lines.push(row.map(csvField).join(","));
    included += 1;
  }

  const excludedTotal = Object.values(excluded).reduce((a, b) => a + b, 0);
  return { csv: `${lines.join("\r\n")}\r\n`, included, excluded, excludedTotal, excludedItems };
}

/** Rezumat scurt pentru `site_feed_access_logs.detail`. */
export function exclusionDetail(result: FacebookCatalogResult): string {
  const e = result.excluded;
  return `excluded=${result.excludedTotal};no_price=${e.no_price};no_coordinates=${e.no_coordinates};no_images=${e.no_images};no_city=${e.no_city}`;
}
