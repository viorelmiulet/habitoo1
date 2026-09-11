/**
 * Mapper pur Habitoo → HomePitch.ro (fără DB, fără rețea).
 *
 * Modelul HomePitch este PULL: portalul citește endpointurile noastre
 * `/api/public/homepitch/v1/*` cu o cheie API emisă de Habitoo. Push-ul
 * punctual folosește ACEEAȘI schemă de date, dar este declanșat de noi.
 *
 * Schema are nume de câmpuri EXACTE cerute de HomePitch. Câmpurile fără
 * echivalent real în Habitoo rămân `null` — nu inventăm valori.
 *
 * Reguli de excludere (o ofertă fără ele NU intră în feed și nu se împinge):
 *  - `lat` + `lng` reale (niciodată 0/0);
 *  - email valid al agentului asignat (cheia de match la HomePitch);
 *  - titlu, descriere, preț în EUR, tip de proprietate mapabil.
 */
import {
  feedImageUrl,
  isImageFeedEligible,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";
import { publicCoords } from "@/lib/geo";

export const HOMEPITCH_MAX_IMAGES = 40;
export const HOMEPITCH_MAX_TITLE = 200;
/** Recomandat de HomePitch, nu obligatoriu: descrierile scurte primesc avertisment. */
export const HOMEPITCH_RECOMMENDED_DESCRIPTION = 300;

export type HomePitchPropertyType =
  "apartament" | "casa" | "birou" | "spatiu_comercial" | "teren" | "spatiu_industrial";

export type HomePitchTransactionType = "vanzare" | "inchiriere";

export type HomePitchProperty = {
  external_id: string;
  title: string;
  description: string;
  property_type: HomePitchPropertyType;
  transaction_type: HomePitchTransactionType;
  price: number;
  city_name: string | null;
  zone_name: string | null;
  street: string | null;
  lat: number;
  lng: number;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  surface_usable: number | null;
  surface_built: number | null;
  surface_total: number | null;
  surface_land: number | null;
  floor: number | string | null;
  building_floors: number | null;
  year_built: number | null;
  images: string[];
  video_link: string | null;
  virtual_tour_link: string | null;
  tags: string[];
  collab_commission_percent: number | null;
  date_added: string | null;
  date_updated: string | null;
  agent: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  };
};

export type HomePitchMapResult =
  { ok: true; property: HomePitchProperty; warnings: string[] } | { ok: false; reasons: string[] };

/** Habitoo → cele 6 valori acceptate de HomePitch. */
const PROPERTY_TYPE_MAP: Record<string, HomePitchPropertyType> = {
  apartment: "apartament",
  apartament: "apartament",
  studio: "apartament",
  garsoniera: "apartament",
  penthouse: "apartament",
  duplex: "apartament",
  house: "casa",
  casa: "casa",
  villa: "casa",
  vila: "casa",
  office: "birou",
  birou: "birou",
  birouri: "birou",
  commercial: "spatiu_comercial",
  retail: "spatiu_comercial",
  spatiu_comercial: "spatiu_comercial",
  land: "teren",
  teren: "teren",
  industrial: "spatiu_industrial",
  warehouse: "spatiu_industrial",
  hala: "spatiu_industrial",
  depozit: "spatiu_industrial",
};

/** Corespondențe EXPLICITE Habitoo → slug-urile de tag HomePitch. */
const TAG_MAP: { match: RegExp; tag: string }[] = [
  { match: /aer condi[țt]ionat|climatizare|split/i, tag: "aer-conditionat" },
  { match: /central[ăa] (proprie|termic[ăa]|de apartament)/i, tag: "centrala-proprie" },
  { match: /^lift$|ascensor/i, tag: "lift" },
  { match: /parcare|parking/i, tag: "parcare" },
  { match: /balcon/i, tag: "balcon" },
  { match: /teras/i, tag: "terasa" },
  { match: /gr[aă]din/i, tag: "gradina" },
  { match: /piscin/i, tag: "piscina" },
  { match: /box[ăa]/i, tag: "boxa" },
];

export function homepitchPropertyType(type: string | null): HomePitchPropertyType | null {
  if (!type) return null;
  return PROPERTY_TYPE_MAP[type.trim().toLowerCase()] ?? null;
}

/** Tranzacția expusă: dual (vânzare + închiriere) se trimite o singură dată, ca vânzare. */
export function homepitchTransaction(p: PropertyRow): HomePitchTransactionType | null {
  const forSale = p.for_sale === true || (p.for_sale == null && p.transaction_kind === "sale");
  const forRent = p.for_rent === true || (p.for_rent == null && p.transaction_kind === "rent");
  if (forSale) return "vanzare";
  if (forRent) return "inchiriere";
  return null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function priceEur(
  p: PropertyRow,
  transaction: HomePitchTransactionType,
): { price: number | null; currency: string } {
  const raw = transaction === "vanzare" ? (p.sale_price ?? p.price) : (p.rent_price ?? p.price);
  const currency = (
    (transaction === "vanzare" ? p.sale_currency : p.rent_currency) ??
    p.currency ??
    "EUR"
  ).toUpperCase();
  const value = numberOrNull(raw);
  if (value === null || value <= 0) return { price: null, currency };
  return { price: value, currency };
}

/** Etajul: HomePitch acceptă și „P”/„D”/„M” ca text. */
function floorValue(p: PropertyRow): number | string | null {
  const label = (p.floor_label ?? "").trim();
  if (label) {
    if (/^(parter|p)$/i.test(label)) return "P";
    if (/^(demisol|d)$/i.test(label)) return "D";
    if (/^(mansard[ăa]|m)$/i.test(label)) return "M";
    const asNumber = Number(label.replace(/\D+/g, ""));
    if (Number.isFinite(asNumber) && label.match(/\d/)) return asNumber;
    return label.slice(0, 12);
  }
  return numberOrNull(p.floor);
}

function collectTags(p: PropertyRow): string[] {
  const source: string[] = [
    ...(p.features ?? []),
    ...(p.building_amenities ?? []),
    ...(p.additional_spaces ?? []),
    ...(p.misc_features ?? []),
    ...(p.cooling_systems ?? []),
    ...(p.heating_systems ?? []),
    ...(p.appliances ?? []),
    ...(p.heating ? [p.heating] : []),
    ...(p.parking ? [p.parking] : []),
  ];
  if (p.balcony) source.push("Balcon");
  if ((p.parking_spaces ?? 0) > 0) source.push("Parcare");
  if ((p.terraces ?? 0) > 0) source.push("Terasă");

  const tags = new Set<string>();
  for (const value of source) {
    const text = (value ?? "").toString().trim();
    if (!text || /^f[ăa]r[ăa]$/i.test(text)) continue;
    for (const entry of TAG_MAP) if (entry.match.test(text)) tags.add(entry.tag);
  }
  const furnishing = (p.furnishing ?? "").toLowerCase();
  if (/mobilat/.test(furnishing) && !/nemobilat/.test(furnishing)) tags.add("mobilat");
  if (/utilat/.test(furnishing)) tags.add("utilat");
  if (p.pet_friendly) tags.add("pet-friendly");
  return [...tags];
}

/**
 * Comisionul de colaborare: Habitoo nu are un câmp numeric dedicat, doar
 * `collaboration` (boolean) și `commission` (text liber). Extragem procentul
 * DOAR când textul îl conține explicit, altfel rămâne `null`.
 */
export function collabCommissionPercent(p: PropertyRow): number | null {
  if (p.collaboration !== true) return null;
  const match = (p.commission ?? "").match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function agentNames(fullName: string | null): { first: string | null; last: string | null } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0] ?? null, last: null };
  return { first: parts[0] ?? null, last: parts.slice(1).join(" ") };
}

export type HomePitchMapOptions = {
  /** Origin absolut HTTPS pentru URL-urile de imagine. */
  baseUrl: string;
  images?: PropertyImageRow[];
  agent?: Pick<ProfileRow, "full_name" | "email" | "phone"> | null;
};

export function mapPropertyToHomePitch(
  p: PropertyRow,
  options: HomePitchMapOptions,
): HomePitchMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const title = (p.title ?? "").trim();
  if (!title) reasons.push("Lipsește titlul ofertei.");

  const description = (p.description ?? "").trim();
  if (!description) reasons.push("Lipsește descrierea ofertei.");
  else if (description.length < HOMEPITCH_RECOMMENDED_DESCRIPTION) {
    warnings.push(
      `HomePitch recomandă minimum ${HOMEPITCH_RECOMMENDED_DESCRIPTION} caractere de descriere (are ${description.length}).`,
    );
  }

  const propertyType = homepitchPropertyType(p.property_type);
  if (!propertyType) {
    reasons.push(`Tipul „${p.property_type ?? "necunoscut"}” nu are echivalent HomePitch.`);
  }

  const transaction = homepitchTransaction(p);
  if (!transaction) reasons.push("Nu este bifată nicio tranzacție (vânzare sau închiriere).");

  const { price, currency } = transaction
    ? priceEur(p, transaction)
    : { price: null, currency: "EUR" };
  if (price === null) reasons.push("Lipsește prețul tranzacției sau nu este pozitiv.");
  else if (currency !== "EUR") {
    reasons.push(`HomePitch acceptă doar EUR; oferta este în ${currency}.`);
  }

  // HomePitch cere lat/lng obligatoriu: dacă locația nu e marcată exactă,
  // trimitem coordonatele aproximative, nu excludem oferta.
  const coords = publicCoords(p);
  const lat = coords ? coords.lat : numberOrNull(p.lat);
  const lng = coords ? coords.lng : numberOrNull(p.lng);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    reasons.push("Lipsesc coordonatele (lat/lng) — HomePitch le cere obligatoriu.");
  }

  const agentEmail = (options.agent?.email ?? "").trim();
  if (!agentEmail || !EMAIL_RE.test(agentEmail)) {
    reasons.push("Agentul asignat nu are un email valid (cheia de match la HomePitch).");
  }

  if (reasons.length > 0) return { ok: false, reasons };

  const eligibleImages = (options.images ?? [])
    .filter(isImageFeedEligible)
    .sort((a, b) =>
      a.is_primary === b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1,
    );
  if (eligibleImages.length > HOMEPITCH_MAX_IMAGES) {
    warnings.push(
      `Oferta are ${eligibleImages.length} imagini publicabile; se expun primele ${HOMEPITCH_MAX_IMAGES}.`,
    );
  }

  // Dual: o singură intrare, ca vânzare, cu mențiunea închirierii în descriere.
  let finalDescription = description;
  const alsoRent =
    transaction === "vanzare" && p.for_rent === true && numberOrNull(p.rent_price ?? null) !== null;
  if (alsoRent) {
    const rentCurrency = (p.rent_currency ?? p.currency ?? "EUR").toUpperCase();
    finalDescription = `${description}\n\nDisponibilă și pentru închiriere: ${p.rent_price} ${rentCurrency}/lună.`;
    warnings.push(
      "Oferta are ambele tranzacții active: se expune ca vânzare, cu mențiune în descriere.",
    );
  }

  const names = agentNames(options.agent?.full_name ?? null);

  return {
    ok: true,
    warnings,
    property: {
      external_id: p.id,
      title: title.slice(0, HOMEPITCH_MAX_TITLE),
      description: finalDescription,
      property_type: propertyType as HomePitchPropertyType,
      transaction_type: transaction as HomePitchTransactionType,
      price: price as number,
      city_name: (p.city ?? "").trim() || null,
      zone_name: (p.district ?? "").trim() || null,
      street:
        (p.location_precise ? (p.street ?? p.address ?? "") : (p.street ?? "")).trim() || null,
      lat: lat as number,
      lng: lng as number,
      rooms: numberOrNull(p.rooms),
      bedrooms: numberOrNull(p.bedrooms),
      bathrooms: numberOrNull(p.bathrooms),
      surface_usable: numberOrNull(p.usable_surface ?? p.surface),
      surface_built: numberOrNull(p.built_surface),
      surface_total: numberOrNull(p.total_usable_surface ?? p.surface),
      surface_land: numberOrNull(p.land_surface),
      floor: floorValue(p),
      building_floors: numberOrNull(p.building_floors),
      year_built: numberOrNull(p.build_year),
      images: eligibleImages
        .slice(0, HOMEPITCH_MAX_IMAGES)
        .map((img) => feedImageUrl(options.baseUrl, img.id)),
      // Habitoo nu are câmpuri pentru video / tur virtual: rămân null, nu inventăm.
      video_link: null,
      virtual_tour_link: null,
      tags: collectTags(p),
      collab_commission_percent: collabCommissionPercent(p),
      date_added: p.created_at ?? null,
      date_updated: p.updated_at ?? null,
      agent: {
        email: agentEmail,
        first_name: names.first,
        last_name: names.last,
        phone: (options.agent?.phone ?? "").trim() || null,
      },
    },
  };
}
