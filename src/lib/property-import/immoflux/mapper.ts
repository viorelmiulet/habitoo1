/**
 * Mapper IMMOFLUX → rând `properties` Habitoo. Funcție pură: fără rețea, fără DB.
 * `reference` NU se setează aici (se generează la inserare).
 */
import { ENERGY_CLASS_OPTIONS } from "@/lib/property-energy-class";
import { PROPERTY_ARRAY_FIELDS, type PropertyArrayField } from "@/lib/property-taxonomy";
import { IMMOFLUX_CODES, parseImmofluxCodes } from "./codes";

export type ImmofluxLocalized = { ro?: string | null; [lang: string]: string | null | undefined };

export type ImmofluxItem = {
  id: number;
  category_id?: number | null;
  subcategory_id?: number | null;
  transaction_id?: number | null;
  price?: number | string | null;
  price_currency?: number | null;
  title?: ImmofluxLocalized | null;
  description?: ImmofluxLocalized | null;
  rooms?: number | null;
  bathrooms?: number | null;
  floor?: number | null;
  building_levels?: number | null;
  surface_util_total?: string | number | null;
  surface_total?: string | number | null;
  built_year?: number | null;
  partitioning?: number | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  exact_location?: number | null;
  address?: string | null;
  address_nr?: string | null;
  address_building?: string | null;
  address_scara?: string | null;
  address_app?: string | null;
  city?: { name?: string | null } | null;
  zone?: { name?: string | null } | null;
  eficienta_energetica?: string | null;
  balconies?: number | null;
  land_size?: string | number | null;
  images?: { ordering?: number | null; src?: string | null }[] | null;
  // Liste de coduri (documentația IMMOFLUX pentru portaluri).
  utilities?: unknown;
  finishes?: unknown;
  equipment?: unknown;
  services?: unknown;
  zone_extra?: unknown;
  confort?: number | null;
  building_type?: number | null;
  building_structure?: number | null;
  built_stage?: number | null;
  destination_id?: number | null;
  orientation_id?: number | null;
  land_type?: number | null;
  offices_classification?: number | null;
  spaces_partitioning?: number | null;
  bedrooms?: number | null;
  kitchens?: number | null;
  surface_size?: string | number | null;
  bathroom_window?: number | boolean | null;
  kitchen_open?: number | boolean | null;
  key_in_agency?: number | boolean | null;
  price_negociable?: number | boolean | null;
  pet_friendly?: number | boolean | null;
  exclusivity?: number | null;
  building_attic?: number | boolean | null;
  parking?: number | null;
  garages?: number | null;
  terraces?: number | null;
  terraces_size?: string | number | null;
  balcony_size?: string | number | null;
  garden_size?: string | number | null;
  renovation_year?: number | null;
  plus_vat?: number | boolean | null;
  private_notes?: string | null;
  agent?: { email?: string | null } | null;
};

export type ImmofluxMapperContext = {
  organizationId: string;
  assignedTo: string | null;
  /** Membrii activi ai agenției; `agent.email` egal → responsabil la creare. */
  members?: readonly { id: string; email: string | null }[];
};

/**
 * Câmpuri completate din exportul IMMOFLUX doar dacă sunt goale în Habitoo
 * (la reimport nu suprascriu ce au completat agenții).
 */
export const FILL_IF_EMPTY_FIELDS = [
  ...PROPERTY_ARRAY_FIELDS,
  "finish_state",
  "furnishing",
  "comfort",
  "building_type",
  "building_structure",
  "construction_stage",
  "destination",
  "orientation",
  "bedrooms",
  "kitchens",
  "surface",
  "balcony",
  "bathroom_window",
  "open_kitchen",
  "key_in_agency",
  "negotiable",
  "pet_friendly",
  "is_exclusive",
  "has_attic",
  "parking_spaces",
  "garages",
  "terraces",
  "terrace_surface",
  "balcony_surface",
  "garden_surface",
  "renovation_year",
  "vat_included",
  "internal_notes",
] as const;

export type ImmofluxFillField = (typeof FILL_IF_EMPTY_FIELDS)[number];

export const UNMAPPED_CODES_PREFIX = "Coduri IMMOFLUX nemapate: ";

type ImmofluxFillValues = Record<PropertyArrayField, string[]> & {
  finish_state: string | null;
  furnishing: string | null;
  comfort: string | null;
  building_type: string | null;
  building_structure: string | null;
  construction_stage: string | null;
  destination: string | null;
  orientation: string | null;
  bedrooms: number | null;
  kitchens: number | null;
  surface: number | null;
  balcony: boolean;
  bathroom_window: boolean;
  open_kitchen: boolean;
  key_in_agency: boolean;
  negotiable: boolean;
  pet_friendly: boolean;
  is_exclusive: boolean;
  has_attic: boolean;
  parking_spaces: number | null;
  garages: number | null;
  terraces: number | null;
  terrace_surface: number | null;
  balcony_surface: number | null;
  garden_surface: number | null;
  renovation_year: number | null;
  vat_included: boolean;
  internal_notes: string | null;
};

export type ImmofluxPropertyRow = {
  organization_id: string;
  assigned_to: string | null;
  source: "immoflux";
  external_id: string;
  status: "active";
  property_type: ImmofluxPropertyType;
  title: string;
  description: string | null;
  transaction_kind: "sale" | "rent";
  for_sale: boolean;
  for_rent: boolean;
  price: number | null;
  currency: string;
  sale_price: number | null;
  sale_currency: string | null;
  rent_price: number | null;
  rent_currency: string | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  floor_label: string | null;
  building_floors: number | null;
  usable_surface: number | null;
  built_surface: number | null;
  build_year: number | null;
  layout: string | null;
  lat: number | null;
  lng: number | null;
  location_precise: boolean;
  street: string | null;
  street_number: string | null;
  address_building: string | null;
  address_staircase: string | null;
  address_apartment: string | null;
  city: string;
  county: string | null;
  county_siruta_code: number | null;
  uat_siruta_code: number | null;
  locality_siruta_code: number | null;
  district: string | null;
  energy_class: string | null;
  balconies: number | null;
  land_surface: number | null;
} & ImmofluxFillValues;

export type ImmofluxPropertyType =
  | "apartment"
  | "studio"
  | "house"
  | "land"
  | "office"
  | "commercial"
  | "industrial";

export type ImmofluxImage = { source_url: string; ordering: number };

export type ImmofluxMapResult =
  | { ok: true; row: ImmofluxPropertyRow; images: ImmofluxImage[]; warnings: string[] }
  | { ok: false; skipped: true; reasons: string[] };

const ENERGY_CLASSES = new Set<string>(ENERGY_CLASS_OPTIONS);

// Convenția Habitoo: județ și oraș cu „ş” (sedilă), ca în nomenclatorul SIRUTA.
const BUCHAREST = "Bucureşti";
const BUCHAREST_COUNTY_SIRUTA = 403;
const BUCHAREST_UAT_SIRUTA = 179132;
const BUCHAREST_SECTOR_SIRUTA: Record<number, number> = {
  1: 179141,
  2: 179150,
  3: 179169,
  4: 179178,
  5: 179187,
  6: 179196,
};

export const NO_SECTOR_WARNING =
  "fără sector: publicarea pe Romimo va cere completarea lui";

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\r\n/g, "\n").trim();
  return t.length > 0 ? t : null;
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function intOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isBucharest(name: string): boolean {
  return /\bbucuresti\b/.test(fold(name)) || /^sector(ul)?\s*[1-6]$/.test(fold(name).trim());
}

function sectorFrom(...values: (string | null)[]): number | null {
  for (const v of values) {
    if (!v) continue;
    const m = fold(v).match(/\bsector(?:ul)?\s*([1-6])\b/);
    if (m) return Number(m[1]);
  }
  return null;
}

function mapFloor(code: unknown): { floor: number | null; label: string | null } | null {
  if (code === 2) return { floor: -1, label: "Demisol" };
  if (code === 3) return { floor: 0, label: "Parter" };
  // ImmoFlux: 100 (cod 1000) = mansardă, nu „Etaj 100”.
  if (code === 1000 || code === 100) return { floor: null, label: "Mansardă" };
  if (code === 1001) return null;
  if (typeof code === "number" && code > 0 && code % 10 === 0) {
    const n = code / 10;
    return { floor: n, label: `Etaj ${n}` };
  }
  return null;
}

export function mapImmofluxItem(
  item: ImmofluxItem,
  context: ImmofluxMapperContext,
): ImmofluxMapResult {
  const title = text(item.title?.ro);
  const cityName = text(item.city?.name);

  // Ciorne goale din export: sărite fără eroare.
  const draftReasons: string[] = [];
  if (item.category_id === 0) draftReasons.push("Categorie lipsă (ciornă goală în export).");
  if (!title) draftReasons.push("Lipsește titlul în română.");
  if (!cityName) draftReasons.push("Lipsește orașul.");
  if (draftReasons.length > 0) return { ok: false, skipped: true, reasons: draftReasons };

  const reasons: string[] = [];
  const warnings: string[] = [];

  let kind: "sale" | "rent" | null = null;
  if (item.transaction_id === 1) kind = "sale";
  else if (item.transaction_id === 2) kind = "rent";
  else reasons.push(`Tip de tranzacție necunoscut (${String(item.transaction_id)}).`);

  // Documentația IMMOFLUX: 1 apartamente (101 apartament, 102 garsonieră,
  // 103 penthouse, 104 duplex), 2 case, 3 terenuri, 4 birouri,
  // 5 spații comerciale, 6 spații industriale; 7 hoteluri nu are tip Habitoo.
  let propertyType: ImmofluxPropertyType | null = null;
  if (item.subcategory_id === 102) propertyType = "studio";
  else if (item.category_id === 1 || item.subcategory_id === 101) propertyType = "apartment";
  else if (item.category_id === 2) propertyType = "house";
  else if (item.category_id === 3) propertyType = "land";
  else if (item.category_id === 4) propertyType = "office";
  else if (item.category_id === 5) propertyType = "commercial";
  else if (item.category_id === 6) propertyType = "industrial";
  else reasons.push(`Subcategorie neacceptată (${String(item.subcategory_id)}).`);

  const currency = CURRENCIES[item.price_currency ?? -1] ?? null;
  if (!currency) {
    reasons.push(`Monedă necunoscută (${String(item.price_currency)}).`);
  }

  if (reasons.length > 0 || !kind || !propertyType || !currency) {
    return { ok: false, skipped: true, reasons };
  }

  const price = positiveNumber(item.price);
  const isSale = kind === "sale";

  const isFlat = propertyType === "apartment" || propertyType === "studio";
  const floor = isFlat ? mapFloor(item.floor) : null;
  if (isFlat && item.floor === 1001) {
    warnings.push("Etaj „Ultimele 2 etaje” (cod 1001): lăsat necompletat.");
  } else if (isFlat && !floor && item.floor !== null && item.floor !== undefined) {
    warnings.push(`Etaj necunoscut (cod ${String(item.floor)}): lăsat necompletat.`);
  }

  let layout: string | null = null;
  if (!isFlat) layout = null;
  else if (item.partitioning && LAYOUTS[item.partitioning]) layout = LAYOUTS[item.partitioning]!;
  else if (item.partitioning !== null && item.partitioning !== undefined) {
    warnings.push(`Compartimentare necunoscută (cod ${String(item.partitioning)}): lăsată necompletată.`);
  }

  const district = text(item.zone?.name);
  let city = cityName!;
  let county: string | null = null;
  let countySiruta: number | null = null;
  let uatSiruta: number | null = null;
  let localitySiruta: number | null = null;
  if (isBucharest(cityName!)) {
    county = BUCHAREST;
    countySiruta = BUCHAREST_COUNTY_SIRUTA;
    uatSiruta = BUCHAREST_UAT_SIRUTA;
    const sector = sectorFrom(cityName, district);
    if (sector) {
      city = `${BUCHAREST} Sectorul ${sector}`;
      localitySiruta = BUCHAREST_SECTOR_SIRUTA[sector] ?? null;
    } else {
      city = BUCHAREST;
      warnings.push(NO_SECTOR_WARNING);
    }
  } else {
    warnings.push("Județul nu este în export: completează-l înainte de publicare.");
  }

  const energy = text(item.eficienta_energetica);

  const images: ImmofluxImage[] = (item.images ?? [])
    .map((img, index) => ({
      src: typeof img?.src === "string" ? img.src.trim() : "",
      ordering: typeof img?.ordering === "number" ? img.ordering : index,
      index,
    }))
    .filter((img) => img.src.startsWith("https://"))
    .sort((a, b) => a.ordering - b.ordering || a.index - b.index)
    .map((img) => ({ source_url: img.src, ordering: img.ordering }));

  const unmapped: string[] = [];
  const fill = mapFillValues(item, propertyType, unmapped);
  if (unmapped.length > 0) warnings.push(UNMAPPED_CODES_PREFIX + [...new Set(unmapped)].join(", "));

  const agentEmail = text(item.agent?.email)?.toLowerCase() ?? null;
  const member = agentEmail
    ? context.members?.find((m) => (m.email ?? "").trim().toLowerCase() === agentEmail)
    : undefined;

  const row: ImmofluxPropertyRow = {
    organization_id: context.organizationId,
    assigned_to: member?.id ?? context.assignedTo,
    source: "immoflux",
    external_id: String(item.id),
    status: "active",
    property_type: propertyType,
    title: title!,
    description: text(item.description?.ro),
    // Identic cu `transactionPayload` din formularul de creare.
    transaction_kind: kind,
    for_sale: isSale,
    for_rent: !isSale,
    price,
    currency,
    sale_price: isSale ? price : null,
    sale_currency: isSale ? currency : null,
    rent_price: isSale ? null : price,
    rent_currency: isSale ? null : currency,
    rooms: intOrNull(item.rooms),
    bathrooms: intOrNull(item.bathrooms),
    floor: floor?.floor ?? null,
    floor_label: floor?.label ?? null,
    building_floors: positiveNumber(item.building_levels),
    usable_surface: positiveNumber(item.surface_util_total),
    built_surface: positiveNumber(item.surface_total),
    build_year: positiveNumber(item.built_year),
    layout,
    lat: positiveNumber(item.latitude),
    lng: positiveNumber(item.longitude),
    location_precise: item.exact_location === 1,
    street: text(item.address),
    street_number: text(item.address_nr),
    address_building: text(item.address_building),
    address_staircase: text(item.address_scara),
    address_apartment: text(item.address_app),
    city,
    county,
    county_siruta_code: countySiruta,
    uat_siruta_code: uatSiruta,
    locality_siruta_code: localitySiruta,
    district,
    energy_class: energy && ENERGY_CLASSES.has(energy) ? energy : null,
    balconies: intOrNull(item.balconies),
    land_surface:
      propertyType === "house" || propertyType === "land" ? positiveNumber(item.land_size) : null,
    ...fill,
  };

  return { ok: true, row, images, warnings };
}

const CURRENCIES: Record<number, string> = { 1: "EUR", 2: "RON", 3: "USD" };

const LAYOUTS: Record<number, string> = {
  1: "Decomandat",
  2: "Semidecomandat",
  3: "Nedecomandat",
  4: "Circular",
  5: "Vagon",
};

const COMFORT: Record<number, string> = { 1: "1", 2: "2", 3: "3", 4: "Lux" };
const BUILDING_TYPES: Record<number, string> = { 1: "Bloc", 2: "Casă", 3: "Bloc", 4: "Bloc" };
const BUILDING_STRUCTURES: Record<number, string> = { 6: "Beton" };
const DESTINATIONS: Record<number, string> = { 1: "Rezidențială", 2: "Birouri", 4: "Comercială" };
const ORIENTATIONS: Record<number, string> = {
  1: "Nord",
  2: "Nord-Est",
  3: "Est",
  4: "Sud-Est",
  5: "Sud",
  6: "Sud-Vest",
  7: "Vest",
  8: "Nord-Vest",
  9: "Nord-Sud",
  10: "Est-Vest",
};

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function code(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n !== 0 ? Math.trunc(n) : null;
}

function simple(
  value: unknown,
  table: Record<number, string>,
  field: string,
  unmapped: string[],
): string | null {
  const c = code(value);
  if (c === null) return null;
  const v = table[c];
  if (!v) unmapped.push(`${field} ${c}`);
  return v ?? null;
}

function mapFillValues(
  item: ImmofluxItem,
  propertyType: ImmofluxPropertyType,
  unmapped: string[],
): ImmofluxFillValues {
  const lists = Object.fromEntries(PROPERTY_ARRAY_FIELDS.map((f) => [f, [] as string[]])) as Record<
    PropertyArrayField,
    string[]
  >;
  let finishState: string | null = null;
  let furnishing: string | null = null;
  const codes = [
    ...parseImmofluxCodes(item.utilities),
    ...parseImmofluxCodes(item.finishes),
    ...parseImmofluxCodes(item.equipment),
    ...parseImmofluxCodes(item.services),
    ...parseImmofluxCodes(item.zone_extra),
  ];
  for (const c of [...new Set(codes)].sort((a, b) => a - b)) {
    const entry = IMMOFLUX_CODES.get(c);
    if (!entry) {
      unmapped.push(String(c));
      continue;
    }
    if (!entry.field || !entry.value) {
      unmapped.push(`${c} (${entry.label})`);
      continue;
    }
    if (entry.field === "finish_state") finishState ??= entry.value;
    else if (entry.field === "furnishing") furnishing ??= entry.value;
    else if (!lists[entry.field].includes(entry.value)) lists[entry.field].push(entry.value);
  }

  // Fără câmp Habitoo: raportate, nu pierdute în tăcere.
  if (propertyType === "house" && item.subcategory_id && item.subcategory_id !== 201) {
    unmapped.push(`subcategory_id ${item.subcategory_id}`);
  }
  if (propertyType === "land") {
    if (item.subcategory_id) unmapped.push(`subcategory_id ${item.subcategory_id}`);
    if (code(item.land_type) !== null) unmapped.push(`land_type ${code(item.land_type)}`);
  }
  if (code(item.offices_classification) !== null) {
    unmapped.push(`offices_classification ${code(item.offices_classification)}`);
  }
  if (code(item.spaces_partitioning) !== null) {
    unmapped.push(`spaces_partitioning ${code(item.spaces_partitioning)}`);
  }

  let constructionStage: string | null = null;
  const stage = code(item.built_stage);
  if (stage === 1) constructionStage = "Finalizată";
  else if (stage === 4) {
    const year = positiveNumber(item.built_year);
    constructionStage = year !== null && year <= new Date().getFullYear() ? "Finalizată" : "În construcție";
  } else if (stage !== null) unmapped.push(`built_stage ${stage}`);

  const balconies = positiveNumber(item.balconies);
  const plusVat = flag(item.plus_vat);

  return {
    ...lists,
    finish_state: finishState,
    furnishing,
    comfort: simple(item.confort, COMFORT, "confort", unmapped),
    building_type: simple(item.building_type, BUILDING_TYPES, "building_type", unmapped),
    building_structure: simple(item.building_structure, BUILDING_STRUCTURES, "building_structure", unmapped),
    construction_stage: constructionStage,
    destination: simple(item.destination_id, DESTINATIONS, "destination_id", unmapped),
    orientation: simple(item.orientation_id, ORIENTATIONS, "orientation_id", unmapped),
    bedrooms: positiveInt(item.bedrooms),
    kitchens: positiveInt(item.kitchens),
    surface: positiveNumber(item.surface_size),
    balcony: balconies !== null && balconies > 0,
    bathroom_window: flag(item.bathroom_window),
    open_kitchen: flag(item.kitchen_open),
    key_in_agency: flag(item.key_in_agency),
    negotiable: flag(item.price_negociable),
    pet_friendly: flag(item.pet_friendly),
    is_exclusive: code(item.exclusivity) === 1,
    has_attic: flag(item.building_attic),
    parking_spaces: positiveInt(item.parking),
    garages: positiveInt(item.garages),
    terraces: positiveInt(item.terraces),
    terrace_surface: positiveNumber(item.terraces_size),
    balcony_surface: positiveNumber(item.balcony_size),
    garden_surface: positiveNumber(item.garden_size),
    renovation_year: positiveInt(item.renovation_year),
    vat_included: !plusVat,
    internal_notes: text(item.private_notes),
  };
}

function positiveInt(value: unknown): number | null {
  const n = positiveNumber(value);
  return n !== null && n > 0 ? Math.trunc(n) : null;
}
