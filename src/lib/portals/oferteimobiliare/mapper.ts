/**
 * Mapper pur Habitoo → OferteImobiliare.ro (fără DB, fără rețea).
 *
 * Portalul este „Powered by ImmoFlux", deci utilitățile, finisajele și dotările
 * folosesc codurile numerice IMMOFLUX (vezi `taxonomy.ts`). Diferența față de
 * feedul nostru IMMOFLUX este transportul (REST cu POST) și numele câmpurilor.
 *
 * Reguli:
 *  - `id` este identificatorul intern al ofertei (UUID Habitoo), `ref` este
 *    referința agenției (`HB-xxxx`), exact cum cere documentația;
 *  - o proprietate cu ambele tranzacții active produce DOUĂ anunțuri, fiecare cu
 *    tranzacția și prețul lui, cu `id` distinct ca să nu se suprascrie;
 *  - câmpurile fără echivalent real în Habitoo nu se trimit deloc;
 *  - locațiile se trimit ca ID-uri ale portalului (județ/oraș/zonă), rezolvate
 *    din cache-ul geografic; fără județ și oraș potrivite anunțul nu se trimite.
 */
import { publicCoords } from "@/lib/geo";
import {
  feedImageUrl,
  isImageFeedEligible,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";
import {
  OI_APPLIANCES,
  OI_BLINDS,
  OI_BUILDING,
  OI_BUILDING_STRUCTURE,
  OI_BUILDING_TYPE,
  OI_COMFORT,
  OI_COOLING,
  OI_CURRENCY,
  OI_ENTRY_DOOR,
  OI_FINISH_STAGE,
  OI_FLOORS,
  OI_FURNITURE,
  OI_FURNITURE_EQUIPMENT,
  OI_HEATING,
  OI_INSULATION,
  OI_INTERIOR_DOORS,
  OI_KITCHEN,
  OI_LAND_CLASSIFICATION,
  OI_METERING,
  OI_MISC,
  OI_ORIENTATION,
  OI_PARTITIONING,
  OI_SHUTTERS,
  OI_SPACES,
  OI_TRANSACTION,
  OI_UTILITIES_GENERAL,
  OI_WALLS,
  OI_WINDOWS,
  codesFor,
  oiCategoryId,
  oiFloor,
  oiSubcategoryId,
  unmappedLabels,
  type OiTransaction,
} from "./taxonomy";

export const OI_MIN_TITLE = 8;
export const OI_MIN_DESCRIPTION = 40;
export const OI_MAX_IMAGES = 50;

export type OiImage = { id: string; filename: string; src: string };

export type OiListing = {
  /** Identificatorul intern al ofertei la agenție (stabil, folosit ca upsert key). */
  id: string;
  ref: string | null;
  external_ref: string | null;
  agent: string | null;
  agency: string | null;
  title: { ro: string; en: string | null };
  description: { ro: string; en: string | null };
  transaction_id: number;
  category_id: number;
  subcategory_id: number | null;
  price: number;
  price_currency: number;
  price_negociable: boolean;
  plus_vat: boolean | null;
  commision_colaboration: number | null;
  address: string | null;
  county_id: number;
  city_id: number;
  zone_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  url: string | null;
  utilities: number[];
  finishes: number[];
  equipment: number[];
  public_images: OiImage[];
  exclusivity?: boolean;
  pet_friendly?: boolean;
  [key: string]: unknown;
};

export type OiMapResult =
  { ok: true; listings: OiListing[]; warnings: string[] } | { ok: false; reasons: string[] };

/** Locațiile portalului, rezolvate din cache-ul geografic. */
export type OiLocationIds = {
  countyId: number | null;
  cityId: number | null;
  zoneId: number | null;
};

export type OiMapOptions = {
  /** Origin absolut pentru URL-urile de imagine (imaginile trec prin proxy-ul Habitoo). */
  baseUrl: string;
  /** Linkul public al ofertei, dacă există site public. */
  offerUrl?: string | null;
  images?: PropertyImageRow[];
  agent?: Pick<ProfileRow, "full_name" | "email" | "phone"> | null;
  agencyName?: string | null;
  location: OiLocationIds;
};

/** Tranzacțiile active ale ofertei. */
export function oiTransactions(p: PropertyRow): OiTransaction[] {
  const list: OiTransaction[] = [];
  if (p.for_sale) list.push("sale");
  if (p.for_rent) list.push("rent");
  if (list.length === 0 && p.transaction_kind === "rent") list.push("rent");
  if (list.length === 0 && p.transaction_kind === "sale") list.push("sale");
  return list;
}

/**
 * `id` trimis portalului. Vânzarea păstrează identificatorul ofertei, iar
 * închirierea primește un sufix, ca cele două anunțuri să nu se suprascrie.
 */
export function oiListingId(propertyId: string, transaction: OiTransaction): string {
  return transaction === "sale" ? propertyId : `${propertyId}-RENT`;
}

function priceFor(p: PropertyRow, transaction: OiTransaction) {
  const raw = transaction === "sale" ? (p.sale_price ?? p.price) : (p.rent_price ?? p.price);
  const currency = (
    (transaction === "sale" ? p.sale_currency : p.rent_currency) ??
    p.currency ??
    "EUR"
  ).toUpperCase();
  const price = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
  return { price, currency, currencyId: OI_CURRENCY[currency] ?? null };
}

function utilitiesCodes(p: PropertyRow): number[] {
  return [
    ...codesFor(OI_UTILITIES_GENERAL, p.utilities ?? []),
    ...codesFor(OI_HEATING, [...(p.heating_systems ?? []), p.heating]),
    ...codesFor(OI_COOLING, p.cooling_systems ?? []),
  ];
}

function finishesCodes(p: PropertyRow): number[] {
  return [
    ...codesFor(OI_INSULATION, p.insulation ?? []),
    ...codesFor(OI_WALLS, p.wall_finishes ?? []),
    ...codesFor(OI_FLOORS, p.floor_finishes ?? []),
    ...codesFor(OI_FINISH_STAGE, [p.finish_state]),
    ...codesFor(OI_WINDOWS, p.windows ?? []),
    ...codesFor(OI_BLINDS, p.blinds ?? []),
    ...codesFor(OI_SHUTTERS, p.shutters ?? []),
    ...codesFor(OI_ENTRY_DOOR, p.entry_door ?? []),
    ...codesFor(OI_INTERIOR_DOORS, p.interior_doors ?? []),
  ];
}

function equipmentCodes(p: PropertyRow): number[] {
  return [
    ...codesFor(OI_SPACES, p.additional_spaces ?? []),
    ...codesFor(OI_KITCHEN, p.kitchen_features ?? []),
    ...codesFor(OI_METERING, p.metering ?? []),
    ...codesFor(OI_FURNITURE_EQUIPMENT, [p.furnishing]),
    ...codesFor(OI_BUILDING, p.building_amenities ?? []),
    ...codesFor(OI_APPLIANCES, p.appliances ?? []),
    ...codesFor(OI_MISC, [...(p.misc_features ?? []), ...(p.features ?? [])]),
  ];
}

/** Etichetele fără cod IMMOFLUX documentat, raportate ca avertisment. */
function unmappedNotes(p: PropertyRow): string[] {
  const skipped = [
    ...unmappedLabels(OI_UTILITIES_GENERAL, p.utilities ?? []),
    ...unmappedLabels(OI_HEATING, p.heating_systems ?? []),
    ...unmappedLabels(OI_FLOORS, p.floor_finishes ?? []),
    ...unmappedLabels(OI_WINDOWS, p.windows ?? []),
    ...unmappedLabels(OI_BUILDING, p.building_amenities ?? []),
    ...unmappedLabels(OI_APPLIANCES, p.appliances ?? []),
  ];
  return skipped.length
    ? [`Fără cod la OferteImobiliare, deci netrimise: ${[...new Set(skipped)].join(", ")}.`]
    : [];
}

function put(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (typeof value === "number" && !Number.isFinite(value)) return;
  if (typeof value === "string" && !value.trim()) return;
  target[key] = value;
}

/** Validează local și construiește payload-urile pentru `POST /property`. */
export function mapPropertyToOferteImobiliare(p: PropertyRow, options: OiMapOptions): OiMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const title = (p.title ?? "").trim();
  if (title.length < OI_MIN_TITLE) {
    reasons.push(`Titlul trebuie să aibă minimum ${OI_MIN_TITLE} caractere.`);
  }
  const description = (p.description ?? "").trim();
  if (description.length < OI_MIN_DESCRIPTION) {
    reasons.push(
      `Descrierea trebuie să aibă minimum ${OI_MIN_DESCRIPTION} caractere (are ${description.length}).`,
    );
  }

  const categoryId = oiCategoryId(p.property_type);
  if (!categoryId) {
    reasons.push(
      `Tipul de proprietate „${p.property_type ?? "necunoscut"}” nu are categorie la OferteImobiliare.`,
    );
  }

  const transactions = oiTransactions(p);
  if (transactions.length === 0)
    reasons.push("Nu este bifată nicio tranzacție (vânzare sau închiriere).");

  if (!options.location.countyId) {
    reasons.push(
      `Județul „${p.county ?? "—"}” nu a putut fi potrivit cu lista de județe a portalului.`,
    );
  }
  if (!options.location.cityId) {
    reasons.push(
      `Localitatea „${p.city ?? "—"}” nu a putut fi potrivită cu lista de orașe a portalului.`,
    );
  }
  if (!options.location.zoneId && (p.district ?? "").trim()) {
    warnings.push(
      `Zona „${p.district}” nu există în lista portalului; anunțul se trimite fără zonă.`,
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
    }
    if (entry.currencyId === null) {
      reasons.push(
        `Moneda ${entry.currency} nu este acceptată de portal (doar EUR, RON, USD, CHF).`,
      );
    }
  }

  const eligibleImages = (options.images ?? [])
    .filter(isImageFeedEligible)
    .sort((a, b) =>
      a.is_primary === b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1,
    );
  if (eligibleImages.length === 0) reasons.push("Oferta nu are nicio imagine publicabilă.");
  if (eligibleImages.length > OI_MAX_IMAGES) {
    warnings.push(
      `Oferta are ${eligibleImages.length} imagini publicabile; se trimit primele ${OI_MAX_IMAGES}.`,
    );
  }

  if (reasons.length) return { ok: false, reasons };

  const images: OiImage[] = eligibleImages.slice(0, OI_MAX_IMAGES).map((img, index) => ({
    id: img.id,
    filename: `${img.id}.jpg`,
    src: feedImageUrl(options.baseUrl, img.id),
    position: index + 1,
    is_main: index === 0,
  })) as OiImage[];

  warnings.push(...unmappedNotes(p));
  if (transactions.length === 2) {
    warnings.push(
      "Proprietatea are ambele tranzacții active: se trimit două anunțuri separate (vânzare și închiriere).",
    );
  }

  const coords = publicCoords(p);
  const utilities = utilitiesCodes(p);
  const finishes = finishesCodes(p);
  const equipment = equipmentCodes(p);

  const listings: OiListing[] = priced.map((entry) => {
    const listing: OiListing = {
      id: oiListingId(p.id, entry.transaction),
      ref: p.reference ?? null,
      external_ref: p.external_id ?? null,
      agent: options.agent?.full_name ?? null,
      agency: options.agencyName ?? null,
      title: { ro: title, en: null },
      description: { ro: description, en: null },
      transaction_id: OI_TRANSACTION[entry.transaction],
      category_id: categoryId as number,
      subcategory_id: oiSubcategoryId(p.property_type, p.category),
      price: entry.price as number,
      price_currency: entry.currencyId as number,
      price_negociable: Boolean(p.negotiable),
      plus_vat: typeof p.vat_included === "boolean" ? !p.vat_included : null,
      // Comisionul de colaborare se trimite doar când oferta este deschisă
      // colaborării în Habitoo — altfel rămâne informație internă.
      commision_colaboration: p.collaboration ? (p.collab_commission_percent ?? null) : null,
      address: p.location_precise ? (p.address ?? p.street ?? null) : (p.street ?? null),
      county_id: options.location.countyId as number,
      city_id: options.location.cityId as number,
      zone_id: options.location.zoneId,
      created_at: p.created_at ?? null,
      updated_at: p.updated_at ?? null,
      url: options.offerUrl ?? null,
      utilities,
      finishes,
      equipment,
      public_images: images,
    };

    put(listing, "rooms", p.rooms);
    put(listing, "bedrooms", p.bedrooms);
    put(listing, "bathrooms", p.bathrooms);
    put(listing, "bathroom_window", p.bathroom_window);
    put(listing, "kitchen_open", p.open_kitchen);
    put(listing, "kitchens", p.kitchens);
    put(listing, "balconies", p.balconies);
    put(listing, "terraces", p.terraces);
    put(listing, "terraces_size", p.terrace_surface);
    put(listing, "balcony_size", p.balcony_surface);
    put(listing, "garages", p.garages);
    put(listing, "parking", p.parking_spaces);
    put(listing, "surface_size", p.usable_surface ?? p.surface);
    put(listing, "surface_total", p.total_usable_surface ?? p.built_surface);
    put(listing, "land_size", p.land_surface);
    put(listing, "garden_size", p.garden_surface);
    put(listing, "confort", OI_COMFORT[(p.comfort ?? "").toLowerCase()] ?? null);
    put(
      listing,
      "partitioning",
      p.layout ? (codesFor(OI_PARTITIONING, [p.layout])[0] ?? null) : null,
    );
    put(
      listing,
      "furniture",
      p.furnishing ? (codesFor(OI_FURNITURE, [p.furnishing])[0] ?? null) : null,
    );
    put(
      listing,
      "orientation",
      p.orientation ? (codesFor(OI_ORIENTATION, [p.orientation])[0] ?? null) : null,
    );
    put(listing, "floor", oiFloor({ floorLabel: p.floor_label, floor: p.floor }));
    put(listing, "floor_max", p.building_floors);
    put(listing, "building_levels", p.building_floors);
    put(listing, "built_year", p.build_year);
    put(listing, "renovation_year", p.renovation_year);
    put(
      listing,
      "building_type",
      p.building_type ? (codesFor(OI_BUILDING_TYPE, [p.building_type])[0] ?? null) : null,
    );
    put(
      listing,
      "building_structure",
      p.building_structure
        ? (codesFor(OI_BUILDING_STRUCTURE, [p.building_structure])[0] ?? null)
        : null,
    );
    put(listing, "building_attic", p.has_attic);
    put(listing, "building_s", p.has_basement);
    put(listing, "building_d", p.has_semi_basement);
    put(listing, "building_m", p.has_loft);
    put(listing, "has_garden", (p.garden_surface ?? 0) > 0);
    put(
      listing,
      "land_classification",
      p.category ? (codesFor(OI_LAND_CLASSIFICATION, [p.category])[0] ?? null) : null,
    );
    put(listing, "pet_friendly", p.pet_friendly);
    if (coords) {
      put(listing, "latitude", coords.lat);
      put(listing, "longitude", coords.lng);
    }
    return listing;
  });

  return { ok: true, listings, warnings };
}
