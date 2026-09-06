/**
 * Mapper pur Habitoo → Imospot.ro (fără DB, fără rețea).
 *
 * Modelul Imospot este REST clasic cu PUSH direct:
 *   POST   /listings                 creează sau actualizează (idempotent pe external_id)
 *   PUT    /listings/{external_id}   actualizare explicită
 *   DELETE /listings/{external_id}   arhivare (nu ștergere definitivă)
 *
 * Reguli respectate strict:
 *  - `external_id` este stabil: derivat din UUID-ul intern al proprietății, nu
 *    din referința editabilă a agenției;
 *  - o proprietate cu ambele tranzacții active produce DOUĂ anunțuri distincte
 *    (`...-SALE` și `...-RENT`), fiecare cu prețul și moneda tranzacției lui;
 *  - câmpurile fără echivalent real în Habitoo (exclusive, zero_commission,
 *    video_url, promotion) NU sunt trimise deloc — nu inventăm valori;
 *  - nu trimitem id-uri de taxonomie: Imospot rezolvă zona din text + coordonate.
 */
import {
  feedImageUrl,
  isImageFeedEligible,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";

export const IMOSPOT_MIN_TITLE = 8;
export const IMOSPOT_MIN_DESCRIPTION = 60;
export const IMOSPOT_MAX_IMAGES = 40;

export type ImospotTransaction = "sale" | "rent";
export type ImospotPropertyType = "apartment" | "house" | "land" | "commercial" | "warehouse";

export type ImospotListing = {
  external_id: string;
  transaction: ImospotTransaction;
  property_type: ImospotPropertyType;
  title: string;
  description: string;
  price: number;
  currency: string;
  contact: {
    phone: string;
    agent?: { name: string; email?: string; phone?: string };
  };
  location: {
    county: string;
    city: string;
    neighborhood?: string;
    street?: string;
    lat?: number;
    lng?: number;
  };
  attributes: Record<string, string | number>;
  features: string[];
  images: string[];
};

export type ImospotMapResult =
  | { ok: true; listings: ImospotListing[]; warnings: string[] }
  | { ok: false; reasons: string[] };

const PROPERTY_TYPE_MAP: Record<string, ImospotPropertyType> = {
  apartment: "apartment",
  apartament: "apartment",
  studio: "apartment",
  garsoniera: "apartment",
  "garsonieră": "apartment",
  penthouse: "apartment",
  duplex: "apartment",
  house: "house",
  casa: "house",
  "casă": "house",
  villa: "house",
  vila: "house",
  "vilă": "house",
  land: "land",
  teren: "land",
  commercial: "commercial",
  spatiu_comercial: "commercial",
  "spațiu comercial": "commercial",
  retail: "commercial",
  office: "commercial",
  birou: "commercial",
  birouri: "commercial",
  warehouse: "warehouse",
  hala: "warehouse",
  "hală": "warehouse",
  depozit: "warehouse",
  industrial: "warehouse",
};

/**
 * Corespondențe EXPLICITE Habitoo → Imospot pentru `features`.
 * Doar ce are înțeles identic; restul dotărilor nu se trimite.
 */
const FEATURE_MAP: { match: RegExp; feature: string }[] = [
  { match: /parcare|parking/i, feature: "parking" },
  { match: /garaj|garage/i, feature: "garage" },
  { match: /^lift$|ascensor/i, feature: "elevator" },
  { match: /balcon/i, feature: "balcony" },
  { match: /teras/i, feature: "terrace" },
  { match: /gr[aă]din/i, feature: "garden" },
  { match: /curte/i, feature: "yard" },
  { match: /piscin/i, feature: "pool" },
  { match: /interfon|videointerfon/i, feature: "intercom" },
  { match: /supraveghere video/i, feature: "video_surveillance" },
  { match: /alarm/i, feature: "alarm" },
  { match: /aer condi[țt]ionat|climatizare|split/i, feature: "air_conditioning" },
  { match: /[șs]emineu/i, feature: "fireplace" },
  { match: /box[ăa] la subsol|box[ăa]/i, feature: "storage_room" },
  { match: /pivni[țt]/i, feature: "cellar" },
  { match: /dressing/i, feature: "dressing" },
  { match: /jacuzzi/i, feature: "jacuzzi" },
  { match: /sauna|spa/i, feature: "spa" },
];

/** `external_id` stabil: UUID-ul intern, imun la editarea referinței agenției. */
export function imospotExternalId(
  property: Pick<PropertyRow, "id">,
  transaction: ImospotTransaction,
): string {
  return `HBT-${property.id}-${transaction.toUpperCase()}`;
}

export function imospotPropertyType(type: string | null): ImospotPropertyType | null {
  if (!type) return null;
  return PROPERTY_TYPE_MAP[type.trim().toLowerCase()] ?? null;
}

/** Tranzacțiile active: dual (vânzare + închiriere) produce două anunțuri. */
export function imospotTransactions(p: PropertyRow): ImospotTransaction[] {
  const list: ImospotTransaction[] = [];
  if (p.for_sale) list.push("sale");
  if (p.for_rent) list.push("rent");
  if (list.length === 0 && p.transaction_kind === "sale") list.push("sale");
  if (list.length === 0 && p.transaction_kind === "rent") list.push("rent");
  return list;
}

function priceFor(p: PropertyRow, transaction: ImospotTransaction): { price: number | null; currency: string; rounded: boolean } {
  const raw = transaction === "sale" ? (p.sale_price ?? p.price) : (p.rent_price ?? p.price);
  const currency = (
    (transaction === "sale" ? p.sale_currency : p.rent_currency) ??
    p.currency ??
    "EUR"
  ).toUpperCase();
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return { price: null, currency, rounded: false };
  }
  const rounded = Math.round(raw);
  if (rounded <= 0) return { price: null, currency, rounded: false };
  return { price: rounded, currency, rounded: rounded !== raw };
}

function collectFeatures(p: PropertyRow): string[] {
  const source: string[] = [
    ...(p.features ?? []),
    ...(p.building_amenities ?? []),
    ...(p.additional_spaces ?? []),
    ...(p.misc_features ?? []),
    ...(p.cooling_systems ?? []),
    ...(p.parking ? [p.parking] : []),
  ];
  if (p.balcony) source.push("Balcon");
  if ((p.parking_spaces ?? 0) > 0) source.push("Loc de parcare");
  if ((p.garages ?? 0) > 0) source.push("Garaj");
  if ((p.terraces ?? 0) > 0) source.push("Terasă");

  const out = new Set<string>();
  for (const value of source) {
    const text = (value ?? "").toString().trim();
    if (!text || /^f[ăa]r[ăa]$/i.test(text)) continue;
    for (const entry of FEATURE_MAP) {
      if (entry.match.test(text)) out.add(entry.feature);
    }
  }
  return [...out];
}

function attributesOf(p: PropertyRow): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  const put = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string" && !value.trim()) return;
    if (typeof value === "number" && !Number.isFinite(value)) return;
    attrs[key] = typeof value === "string" ? value.trim() : value;
  };
  put("rooms", p.rooms);
  put("bathrooms", p.bathrooms);
  put("surface", p.usable_surface ?? p.surface ?? p.built_surface ?? p.land_surface);
  put("floor", p.floor);
  put("total_floors", p.building_floors);
  put("year_built", p.build_year);
  put("comfort", p.comfort);
  put("condition", p.finish_state);
  put("heating", p.heating ?? (p.heating_systems ?? [])[0] ?? null);
  return attrs;
}

export type ImospotMapOptions = {
  /** Origin pentru URL-urile publice de imagine (HTTPS în producție). */
  baseUrl: string;
  images?: PropertyImageRow[];
  agent?: Pick<ProfileRow, "full_name" | "email" | "phone"> | null;
  /** Telefonul agenției, folosit când agentul nu are telefon. */
  organizationPhone?: string | null;
};

/**
 * Validează local și construiește payload-urile Imospot.
 * Ofertele care nu îndeplinesc cerințele obligatorii NU se trimit trunchiate:
 * întoarcem motivele exacte, afișabile în UI înainte de orice request.
 */
export function mapPropertyToImospot(p: PropertyRow, options: ImospotMapOptions): ImospotMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const title = (p.title ?? "").trim();
  if (title.length < IMOSPOT_MIN_TITLE) {
    reasons.push(`Titlul trebuie să aibă minimum ${IMOSPOT_MIN_TITLE} caractere.`);
  }
  const description = (p.description ?? "").trim();
  if (description.length < IMOSPOT_MIN_DESCRIPTION) {
    reasons.push(
      `Descrierea trebuie să aibă minimum ${IMOSPOT_MIN_DESCRIPTION} caractere (are ${description.length}).`,
    );
  }

  const propertyType = imospotPropertyType(p.property_type);
  if (!propertyType) {
    reasons.push(`Tipul de proprietate „${p.property_type ?? "necunoscut"}” nu are echivalent Imospot.`);
  }

  const transactions = imospotTransactions(p);
  if (transactions.length === 0) {
    reasons.push("Nu este bifată nicio tranzacție (vânzare sau închiriere).");
  }

  const phone = (options.agent?.phone ?? "").trim() || (options.organizationPhone ?? "").trim();
  if (!phone) reasons.push("Lipsește telefonul de contact (agent sau agenție).");

  const county = (p.county ?? "").trim();
  const city = (p.city ?? "").trim();
  if (!county) reasons.push("Lipsește județul.");
  if (!city) reasons.push("Lipsește localitatea.");

  const eligibleImages = (options.images ?? [])
    .filter(isImageFeedEligible)
    .sort((a, b) =>
      a.is_primary === b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1,
    );
  if (eligibleImages.length === 0) {
    reasons.push("Oferta nu are nicio imagine publicabilă (Imospot cere minimum una).");
  }
  if (eligibleImages.length > IMOSPOT_MAX_IMAGES) {
    warnings.push(
      `Oferta are ${eligibleImages.length} imagini publicabile; se trimit primele ${IMOSPOT_MAX_IMAGES}.`,
    );
  }

  const priced = transactions.map((t) => ({ transaction: t, ...priceFor(p, t) }));
  for (const entry of priced) {
    if (entry.price === null) {
      reasons.push(
        entry.transaction === "sale"
          ? "Lipsește prețul de vânzare sau nu este pozitiv."
          : "Lipsește prețul de închiriere sau nu este pozitiv.",
      );
    } else if (entry.rounded) {
      warnings.push(
        entry.transaction === "sale"
          ? `Prețul de vânzare a fost rotunjit la ${entry.price} (Imospot cere întreg).`
          : `Prețul de închiriere a fost rotunjit la ${entry.price} (Imospot cere întreg).`,
      );
    }
  }

  if (reasons.length) return { ok: false, reasons };

  const images = eligibleImages
    .slice(0, IMOSPOT_MAX_IMAGES)
    .map((img) => feedImageUrl(options.baseUrl, img.id));
  const features = collectFeatures(p);
  const attributes = attributesOf(p);
  const agentName = (options.agent?.full_name ?? "").trim();

  if (transactions.length === 2) {
    warnings.push(
      "Proprietatea are ambele tranzacții active: se trimit două anunțuri separate (vânzare și închiriere).",
    );
  }

  const listings: ImospotListing[] = priced.map((entry) => {
    const listing: ImospotListing = {
      external_id: imospotExternalId(p, entry.transaction),
      transaction: entry.transaction,
      property_type: propertyType as ImospotPropertyType,
      title,
      description,
      price: entry.price as number,
      currency: entry.currency,
      contact: { phone },
      location: { county, city },
      attributes,
      features,
      images,
    };
    if (agentName) {
      listing.contact.agent = {
        name: agentName,
        ...(options.agent?.email ? { email: options.agent.email } : {}),
        ...(options.agent?.phone ? { phone: options.agent.phone } : {}),
      };
    }
    const neighborhood = (p.district ?? "").trim();
    if (neighborhood) listing.location.neighborhood = neighborhood;
    // Strada exactă doar dacă locația este marcată ca publicabilă precis.
    const street = p.location_precise ? (p.address ?? p.street ?? "").trim() : (p.street ?? "").trim();
    if (street) listing.location.street = street;
    // Coordonatele respectă setarea de precizie: exacte doar cu `location_precise`.
    const coords = publicCoords(p);
    if (coords) {
      listing.location.lat = coords.lat;
      listing.location.lng = coords.lng;
    }
    return listing;
  });

  return { ok: true, listings, warnings };
}
