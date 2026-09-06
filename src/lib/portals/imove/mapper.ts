/**
 * Mapper pur Habitoo → iMove.ro (fără DB, fără rețea).
 *
 * Schema respectă STRICT documentația oficială https://imove.ro/docs/feeds:
 *  - feedul este un obiect JSON cu array-ul `listings`;
 *  - câmpuri obligatorii: title, description, price, transactionType, propertyType;
 *  - `externalId` este stabil, unic și maximum 120 caractere [A-Za-z0-9_-];
 *  - `transactionType` ∈ SALE|RENT, `propertyType` ∈
 *    APARTMENT|STUDIO|HOUSE|LAND|COMMERCIAL|OFFICE;
 *  - maximum 40 imagini publice HTTPS (JPG/PNG/WebP).
 *
 * Nu inventăm câmpuri: ce nu există în Habitoo lipsește din payload.
 */
import {
  feedImageUrl,
  isImageFeedEligible,
  offerUrl,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";

export const IMOVE_MAX_IMAGES = 40;
export const IMOVE_EXTERNAL_ID_MAX = 120;

export type ImoveTransactionType = "SALE" | "RENT";
export type ImovePropertyType =
  | "APARTMENT"
  | "STUDIO"
  | "HOUSE"
  | "LAND"
  | "COMMERCIAL"
  | "OFFICE";

export type ImoveListing = {
  externalId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  transactionType: ImoveTransactionType;
  propertyType: ImovePropertyType;
  citySlug: string | null;
  districtSlug: string | null;
  addressPublic: string | null;
  rooms: number | null;
  bathrooms: number | null;
  usableArea: number | null;
  floor: number | null;
  totalFloors: number | null;
  constructionYear: number | null;
  imageUrls: string[];
  agentPhone: string | null;
  agentEmail: string | null;
  url: string | null;
  updatedAt: string | null;
};

export type ImoveMapResult =
  | { ok: true; listing: ImoveListing; warnings: string[] }
  | { ok: false; reasons: string[] };

const PROPERTY_TYPE_MAP: Record<string, ImovePropertyType> = {
  apartment: "APARTMENT",
  apartament: "APARTMENT",
  penthouse: "APARTMENT",
  duplex: "APARTMENT",
  studio: "STUDIO",
  garsoniera: "STUDIO",
  "garsonieră": "STUDIO",
  house: "HOUSE",
  casa: "HOUSE",
  "casă": "HOUSE",
  villa: "HOUSE",
  vila: "HOUSE",
  "vilă": "HOUSE",
  land: "LAND",
  teren: "LAND",
  commercial: "COMMERCIAL",
  spatiu_comercial: "COMMERCIAL",
  "spațiu comercial": "COMMERCIAL",
  retail: "COMMERCIAL",
  hala: "COMMERCIAL",
  industrial: "COMMERCIAL",
  office: "OFFICE",
  birou: "OFFICE",
  birouri: "OFFICE",
};

/** Slug ASCII stabil, fără diacritice, folosit pentru citySlug/districtSlug. */
export function imoveSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[țţ]/gi, "t")
    .replace(/[șş]/gi, "s")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

/** `externalId` stabil: referința agenției dacă există, altfel UUID-ul intern. */
export function imoveExternalId(property: Pick<PropertyRow, "id" | "reference">): string {
  const raw = (property.reference ?? "").trim() || property.id;
  const safe = raw.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const value = safe || property.id.replace(/[^A-Za-z0-9_-]+/g, "-");
  return value.slice(0, IMOVE_EXTERNAL_ID_MAX);
}

export function imoveTransactionType(kind: string | null): ImoveTransactionType | null {
  if (kind === "sale") return "SALE";
  if (kind === "rent") return "RENT";
  return null;
}

export function imovePropertyType(type: string | null): ImovePropertyType | null {
  if (!type) return null;
  return PROPERTY_TYPE_MAP[type.trim().toLowerCase()] ?? null;
}

export type ImoveMapOptions = {
  /** Origin pentru URL-urile publice de imagine (HTTPS în producție). */
  baseUrl: string;
  /** Origin al site-ului public pentru linkul ofertei. */
  publicSiteUrl?: string;
  images?: PropertyImageRow[];
  agent?: Pick<ProfileRow, "full_name" | "email" | "phone"> | null;
};

/**
 * Mapează o proprietate Habitoo la o ofertă iMove. Ofertele care nu îndeplinesc
 * cerințele obligatorii NU sunt trimise trunchiate: sunt excluse cu motiv.
 */
export function mapPropertyToImove(p: PropertyRow, options: ImoveMapOptions): ImoveMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const title = (p.title ?? "").trim();
  if (!title) reasons.push("Lipsește titlul.");
  const description = (p.description ?? "").trim();
  if (!description) reasons.push("Lipsește descrierea.");

  const price = typeof p.price === "number" && p.price > 0 ? p.price : null;
  if (price === null) reasons.push("Lipsește prețul sau prețul nu este pozitiv.");

  const transactionType = imoveTransactionType(p.transaction_kind);
  if (!transactionType) reasons.push("Tipul tranzacției nu poate fi mapat (vânzare/închiriere).");

  const propertyType = imovePropertyType(p.property_type);
  if (!propertyType) {
    reasons.push(`Tipul de proprietate „${p.property_type ?? "necunoscut"}” nu are echivalent iMove.`);
  }

  if (reasons.length) return { ok: false, reasons };

  const eligibleImages = (options.images ?? [])
    .filter(isImageFeedEligible)
    .sort((a, b) =>
      a.is_primary === b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1,
    );
  if (eligibleImages.length > IMOVE_MAX_IMAGES) {
    warnings.push(
      `Oferta are ${eligibleImages.length} imagini publicabile; iMove acceptă maximum ${IMOVE_MAX_IMAGES}.`,
    );
  }
  // Extensia `.jpg` este necesară pentru importatoarele care validează
  // formatul imaginii din URL (iMove ignoră silențios URL-uri fără extensie).
  const imageUrls = eligibleImages
    .slice(0, IMOVE_MAX_IMAGES)
    .map((img) => `${feedImageUrl(options.baseUrl, img.id)}.jpg`);

  if (imageUrls.length === 0) warnings.push("Oferta nu are nicio imagine publicabilă.");

  const citySlug = imoveSlug(p.city);
  if (!citySlug) warnings.push("Lipsește localitatea; iMove poate respinge potrivirea zonei.");

  return {
    ok: true,
    warnings,
    listing: {
      externalId: imoveExternalId(p),
      title,
      description,
      price: price as number,
      currency: (p.currency ?? "EUR").toUpperCase(),
      transactionType: transactionType as ImoveTransactionType,
      propertyType: propertyType as ImovePropertyType,
      citySlug,
      districtSlug: imoveSlug(p.district),
      // Adresa publică: doar strada/zona, nu numărul exact dacă lipsește acordul.
      addressPublic: p.location_precise ? (p.address ?? null) : (p.street ?? p.district ?? null),
      rooms: p.rooms ?? null,
      bathrooms: p.bathrooms ?? null,
      usableArea: p.usable_surface ?? p.surface ?? null,
      floor: p.floor ?? null,
      totalFloors: p.building_floors ?? null,
      constructionYear: p.build_year ?? null,
      imageUrls,
      agentPhone: options.agent?.phone ?? null,
      agentEmail: options.agent?.email ?? null,
      url: options.publicSiteUrl ? offerUrl(options.publicSiteUrl, p.id) : null,
      updatedAt: p.updated_at ?? null,
    },
  };
}
