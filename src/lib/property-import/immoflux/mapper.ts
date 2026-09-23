/**
 * Mapper IMMOFLUX → rând `properties` Habitoo. Funcție pură: fără rețea, fără DB.
 * `reference` NU se setează aici (se generează la inserare).
 */

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
  images?: { ordering?: number | null; src?: string | null }[] | null;
};

export type ImmofluxMapperContext = { organizationId: string; assignedTo: string | null };

export type ImmofluxPropertyRow = {
  organization_id: string;
  assigned_to: string | null;
  source: "immoflux";
  external_id: string;
  status: "active";
  property_type: "apartment" | "studio";
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
};

export type ImmofluxImage = { source_url: string; ordering: number };

export type ImmofluxMapResult =
  | { ok: true; row: ImmofluxPropertyRow; images: ImmofluxImage[]; warnings: string[] }
  | { ok: false; skipped: true; reasons: string[] };

const ENERGY_CLASSES = new Set(["A++", "A+", "A", "B", "C", "D", "E", "F", "G"]);

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

  let propertyType: "apartment" | "studio" | null = null;
  if (item.subcategory_id === 101) propertyType = "apartment";
  else if (item.subcategory_id === 102) propertyType = "studio";
  else reasons.push(`Subcategorie neacceptată (${String(item.subcategory_id)}).`);

  if (item.price_currency !== 1) {
    reasons.push(`Monedă necunoscută (${String(item.price_currency)}).`);
  }

  if (reasons.length > 0 || !kind || !propertyType) {
    return { ok: false, skipped: true, reasons };
  }

  const price = positiveNumber(item.price);
  const currency = "EUR";
  const isSale = kind === "sale";

  const floor = mapFloor(item.floor);
  if (!floor && item.floor !== null && item.floor !== undefined) {
    warnings.push(`Etaj necunoscut (cod ${String(item.floor)}): lăsat necompletat.`);
  }

  let layout: string | null = null;
  if (item.partitioning === 1) layout = "Decomandat";
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

  const row: ImmofluxPropertyRow = {
    organization_id: context.organizationId,
    assigned_to: context.assignedTo,
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
  };

  return { ok: true, row, images, warnings };
}
