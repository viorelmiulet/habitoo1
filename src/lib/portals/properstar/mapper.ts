/**
 * Properstar — generator XML pur (fără I/O, fără DB).
 *
 * Properstar este un portal de tip PULL: citește periodic feedul XML al
 * agenției. Aici se construiește EXACT structura documentată de ei, cu o
 * gardă pe câmpurile obligatorii: o ofertă incompletă este exclusă, niciodată
 * trimisă cu noduri obligatorii goale.
 *
 * Textul liber rămâne în română (Language="ro"): Properstar traduce la ei,
 * deci nu generăm versiuni în alte limbi. Structura rămâne multi-limbă.
 */
import type { Database } from "@/integrations/supabase/types";
import { publicCoords } from "@/lib/geo";
import { feedImageUrl, offerUrl, isImageFeedEligible } from "@/lib/site-feed/mapper";

type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type PropertyImageRow = Database["public"]["Tables"]["property_images"]["Row"];

export const PROPERSTAR_COUNTRY = "RO";
export const PROPERSTAR_LANGUAGE = "ro";
/** Câte zile rămâne o ofertă retrasă/vândută în feed cu Status=Deleted. */
export const PROPERSTAR_DELETED_DAYS = 7;
/** Plafon de siguranță pentru un răspuns de feed. */
export const PROPERSTAR_MAX_ADVERTS = 2000;

export type ProperstarStatus = "Active" | "Deleted";
export type ProperstarAdvertType = "Sale" | "Rent";

/** Tipurile Properstar folosite în SubType. */
const SUBTYPE_MAP: Record<string, string> = {
  apartment: "Apartment",
  apartament: "Apartment",
  duplex: "Apartment",
  penthouse: "Apartment",
  studio: "Studio",
  garsoniera: "Studio",
  garsonieră: "Studio",
  house: "House",
  casa: "House",
  casă: "House",
  villa: "Villa",
  vila: "Villa",
  vilă: "Villa",
  land: "Land",
  teren: "Land",
  commercial: "Commercial",
  spatiu_comercial: "Commercial",
  "spațiu comercial": "Commercial",
  retail: "Commercial",
  hala: "Commercial",
  industrial: "Commercial",
  office: "Office",
  birou: "Office",
  birouri: "Office",
  parking: "Parking",
  garaj: "Parking",
  building: "Building",
};

export function properstarSubType(propertyType: string | null | undefined): string | null {
  if (!propertyType) return null;
  return SUBTYPE_MAP[propertyType.trim().toLowerCase()] ?? null;
}

export function properstarAdvertType(
  kind: string | null | undefined,
): ProperstarAdvertType | null {
  if (kind === "sale") return "Sale";
  if (kind === "rent") return "Rent";
  return null;
}

/** Telefon în format internațional +40…, sau null dacă nu e un număr valid. */
export function properstarPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("0040")) local = local.slice(4);
  else if (local.startsWith("40") && local.length >= 11) local = local.slice(2);
  if (local.startsWith("0")) local = local.slice(1);
  return /^\d{9}$/.test(local) ? `+40${local}` : null;
}

const ALLOWED_TAGS = new Set(["ul", "ol", "li", "b", "strong", "i", "em", "p", "br"]);

/** Păstrează doar formatarea acceptată de Properstar; restul HTML-ului dispare. */
export function sanitizeProperstarHtml(input: string): string {
  return input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (match, rawTag: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      return match.startsWith("</") ? `</${tag}>` : tag === "br" ? "<br/>" : `<${tag}>`;
    })
    .replace(/\]\]>/g, "]]&gt;")
    .trim();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cdata(value: string): string {
  // `]]>` a fost deja neutralizat în sanitizeProperstarHtml.
  return `<![CDATA[${value.replace(/\]\]>/g, "]]&gt;")}]]>`;
}

/** Sufixul de cache-busting cerut de Properstar: ?date=zz/ll/aaaa. */
export function properstarPhotoDateSuffix(updatedAt: string | null | undefined): string {
  const date = updatedAt ? new Date(updatedAt) : null;
  const valid = date && !Number.isNaN(date.getTime()) ? date : new Date(0);
  const dd = String(valid.getUTCDate()).padStart(2, "0");
  const mm = String(valid.getUTCMonth() + 1).padStart(2, "0");
  return `?date=${dd}/${mm}/${valid.getUTCFullYear()}`;
}

export type ProperstarOffice = {
  officeId: string;
  officeName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  logo: string | null;
};

export type ProperstarAgent = {
  agentId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobilePhone: string | null;
  landPhone: string | null;
  photo: string | null;
};

export type ProperstarMapOptions = {
  /** Origin absolut HTTPS pentru URL-urile de imagine. */
  baseUrl: string;
  /** Origin absolut al site-ului public, pentru OriginalUrl. */
  publicSiteUrl: string;
  images?: PropertyImageRow[];
  office: ProperstarOffice;
  agent: ProperstarAgent | null;
  status: ProperstarStatus;
};

export type ProperstarAdvert = {
  advertId: string;
  reference: string | null;
  originalUrl: string;
  advertType: ProperstarAdvertType;
  subType: string;
  publicationDate: string;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  livingArea: number | null;
  landArea: number | null;
  title: string | null;
  description: string;
  photos: string[];
  price: number | null;
  priceCurrency: string;
  showPrice: boolean;
  address: string | null;
  postalCode: string;
  city: string;
  state: string | null;
  country: string;
  showAddress: boolean;
  latitude: number | null;
  longitude: number | null;
  floor: number | null;
  constructionYear: number | null;
  amenities: string[];
  videos: string[];
  virtualTours: string[];
  status: ProperstarStatus;
  office: ProperstarOffice;
  agent: ProperstarAgent;
};

export type ProperstarMapResult =
  | { ok: true; advert: ProperstarAdvert }
  | { ok: false; missing: string[] };

function amenitiesOf(p: PropertyRow): string[] {
  const all = [
    ...(p.features ?? []),
    ...(p.building_amenities ?? []),
    ...(p.additional_spaces ?? []),
  ];
  return Array.from(new Set(all.map((a) => a.trim()).filter(Boolean)));
}

/**
 * Mapează o proprietate la un Advert Properstar.
 * Fără câmpurile obligatorii, oferta NU intră în feed: se întorc numele
 * câmpurilor lipsă, ca să apară în raportul „De completat pentru Properstar".
 */
export function mapPropertyToProperstar(
  p: PropertyRow,
  options: ProperstarMapOptions,
): ProperstarMapResult {
  const missing: string[] = [];

  const advertId = (p.reference ?? "").trim() || p.id;
  if (!advertId) missing.push("Identificator ofertă (AdvertId)");

  const advertType = properstarAdvertType(p.transaction_kind);
  if (!advertType) missing.push("Tip tranzacție (vânzare sau închiriere)");

  const subType = properstarSubType(p.property_type);
  if (!subType) missing.push("Tip proprietate acceptat de Properstar");

  const description = sanitizeProperstarHtml((p.description ?? "").trim());
  if (!description) missing.push("Descriere");

  // Codul poștal al agenției NU substituie codul ofertei: apare doar în <Contact>.
  const postalCode = (p.postal_code ?? "").trim();
  if (!postalCode) missing.push("Cod poștal");

  const city = (p.city ?? "").trim();
  if (!city) missing.push("Localitate");

  const priceCurrency = (p.currency ?? "").trim().toUpperCase();
  if (!priceCurrency) missing.push("Moneda prețului");

  if (!options.office.officeId) missing.push("Identificator birou agenție");
  if (!options.office.officeName?.trim()) missing.push("Nume birou agenție");
  const agent = options.agent;
  if (!agent?.agentId) missing.push("Agent responsabil");
  if (!agent?.email?.trim()) missing.push("Email agent responsabil");

  if (missing.length) return { ok: false, missing };

  const images = (options.images ?? [])
    .filter(isImageFeedEligible)
    .sort((a, b) =>
      a.is_primary === b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1,
    );
  const photos = images.map(
    (img) =>
      `${feedImageUrl(options.baseUrl, img.id)}.jpg${properstarPhotoDateSuffix(img.updated_at)}`,
  );

  const coords = publicCoords({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    location_precise: p.location_precise,
  });

  // Adresa exactă apare doar dacă agenția a permis afișarea locației precise.
  const showAddress = p.location_precise === true;
  const streetAddress = [p.street, p.street_number].filter(Boolean).join(" ").trim();
  const address = showAddress ? (p.address ?? streetAddress) || null : null;

  const price =
    typeof p.price === "number" && p.price > 0
      ? p.price
      : advertType === "Rent" && typeof p.rent_price === "number" && p.rent_price > 0
        ? p.rent_price
        : typeof p.sale_price === "number" && p.sale_price > 0
          ? p.sale_price
          : null;

  return {
    ok: true,
    advert: {
      advertId,
      reference: p.reference?.trim() || null,
      originalUrl: offerUrl(options.publicSiteUrl, p.id),
      advertType: advertType as ProperstarAdvertType,
      subType: subType as string,
      publicationDate: (p.published_at ?? p.created_at).slice(0, 10),
      rooms: p.rooms ?? null,
      bedrooms: p.bedrooms ?? null,
      bathrooms: p.bathrooms ?? null,
      livingArea: p.usable_surface ?? p.built_surface ?? p.surface ?? null,
      landArea: p.land_surface ?? null,
      title: (p.title ?? "").trim() || null,
      description,
      photos,
      price,
      priceCurrency,
      showPrice: price !== null,
      address,
      postalCode,
      city,
      state: p.county?.trim() || null,
      country: PROPERSTAR_COUNTRY,
      showAddress,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      floor: p.floor ?? null,
      constructionYear: p.build_year ?? null,
      amenities: amenitiesOf(p),
      videos: [],
      virtualTours: [],
      status: options.status,
      office: options.office,
      agent: agent as ProperstarAgent,
    },
  };
}

function node(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}>${xmlEscape(String(value))}</${name}>`;
}

function boolNode(name: string, value: boolean): string {
  return `<${name}>${value ? "true" : "false"}</${name}>`;
}

function contactBlock(advert: ProperstarAdvert): string {
  const o = advert.office;
  const a = advert.agent;
  return [
    "<Contact>",
    node("OfficeId", o.officeId),
    node("OfficeName", o.officeName),
    node("Email", o.email),
    node("OfficePhone", properstarPhone(o.phone)),
    node("Website", o.website),
    node("Address", o.address),
    node("PostalCode", o.postalCode),
    node("City", o.city),
    node("Country", PROPERSTAR_COUNTRY),
    node("Logo", o.logo),
    node("AgentId", a.agentId),
    node("FirstName", a.firstName),
    node("LastName", a.lastName),
    node("AgentEmail", a.email),
    node("MobilePhone", properstarPhone(a.mobilePhone)),
    node("AgentLandPhone", properstarPhone(a.landPhone)),
    node("Photo", a.photo),
    "</Contact>",
  ]
    .filter(Boolean)
    .join("");
}

function listBlock(wrapper: string, item: string, values: string[]): string {
  if (!values.length) return "";
  return `<${wrapper}>${values.map((v) => node(item, v)).join("")}</${wrapper}>`;
}

export function advertToXml(advert: ProperstarAdvert): string {
  const titles = advert.title
    ? `<Titles><Title Language="${PROPERSTAR_LANGUAGE}">${cdata(advert.title)}</Title></Titles>`
    : "";
  const descriptions = `<Descriptions><Description Language="${PROPERSTAR_LANGUAGE}">${cdata(
    advert.description,
  )}</Description></Descriptions>`;
  const geo =
    advert.latitude !== null && advert.longitude !== null
      ? `<Geolocation>${node("Latitude", advert.latitude)}${node("Longitude", advert.longitude)}</Geolocation>`
      : "";

  return [
    "<Advert>",
    node("AdvertId", advert.advertId),
    node("Reference", advert.reference),
    node("OriginalUrl", advert.originalUrl),
    node("AdvertType", advert.advertType),
    node("SubType", advert.subType),
    node("PublicationDate", advert.publicationDate),
    node("Rooms", advert.rooms),
    node("Bedrooms", advert.bedrooms),
    node("Bathrooms", advert.bathrooms),
    node("LivingArea", advert.livingArea),
    node("LandArea", advert.landArea),
    titles,
    descriptions,
    listBlock("Photos", "Photo", advert.photos),
    node("Price", advert.price),
    node("PriceCurrency", advert.priceCurrency),
    boolNode("ShowPrice", advert.showPrice),
    node("Address", advert.address),
    node("PostalCode", advert.postalCode),
    node("City", advert.city),
    node("State", advert.state),
    node("Country", advert.country),
    boolNode("ShowAddress", advert.showAddress),
    geo,
    node("Floor", advert.floor),
    node("ConstructionYear", advert.constructionYear),
    listBlock("Amenities", "Amenity", advert.amenities),
    listBlock("Videos", "Video", advert.videos),
    listBlock("VirtualTours", "VirtualTour", advert.virtualTours),
    node("Status", advert.status),
    contactBlock(advert),
    "</Advert>",
  ]
    .filter(Boolean)
    .join("");
}

export function buildProperstarXml(adverts: ProperstarAdvert[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Adverts>${adverts
    .map(advertToXml)
    .join("")}</Adverts>`;
}

/**
 * Oferta retrasă sau vândută/închiriată rămâne 7 zile în feed cu
 * Status=Deleted, ca Properstar să o scoată la ei, apoi dispare complet.
 */
export function properstarStatusFor(input: {
  withdrawn: boolean;
  referenceDate: string | null;
  now: Date;
}): ProperstarStatus | "omit" {
  if (!input.withdrawn) return "Active";
  const ref = input.referenceDate ? new Date(input.referenceDate) : null;
  if (!ref || Number.isNaN(ref.getTime())) return "omit";
  const ageMs = input.now.getTime() - ref.getTime();
  return ageMs <= PROPERSTAR_DELETED_DAYS * 24 * 60 * 60 * 1000 ? "Deleted" : "omit";
}
