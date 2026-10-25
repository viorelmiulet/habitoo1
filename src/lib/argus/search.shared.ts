/**
 * Tipurile și funcțiile pure ale căutării Argus (pasul 2 — tabul din
 * „Anunțuri particulari”). Client-safe: fără rețea, fără secrete.
 *
 * Reguli fixe:
 *  - anunțurile Argus NU se salvează în baza de date — se normalizează și se
 *    întorc direct către browser;
 *  - telefoanele din răspunsurile de căutare/detaliu se ELIMINĂ la
 *    normalizare: telefonul se cere doar prin /properties/contact, la click;
 *  - aceeași căutare repetată în 5 minute se servește din cache (vezi
 *    ARGUS_CACHE_MS), fără o nouă cerere la Argus.
 */

/** `listed_by = 1` în API-ul Argus înseamnă „Proprietar”. */
export const ARGUS_LISTED_BY_OWNER = 1;

/** Cât stă o căutare în cache fără o nouă cerere la Argus (5 minute). */
export const ARGUS_CACHE_MS = 5 * 60_000;

/** Filtrele din interfață, înainte de traducerea în parametrii Argus. */
export type ArgusSearchInput = {
  page?: number;
  transaction?: "sale" | "rent";
  propertyType?: number;
  rooms?: number[];
  priceMin?: number;
  priceMax?: number;
  surfaceMin?: number;
  surfaceMax?: number;
  countyId?: number;
  cityId?: number;
  areaIds?: number[];
  /** Implicit „owner” (doar anunțuri de la proprietari); „all” = toți. */
  listedBy?: "owner" | "all";
};

/** Corpul cererii POST /properties/search, tradus din filtrele interfeței. */
export function buildArgusSearchBody(input: ArgusSearchInput): Record<string, unknown> {
  const body: Record<string, unknown> = { page: input.page ?? 1 };
  if (input.transaction) body["transaction_type"] = [input.transaction === "sale" ? 1 : 2];
  if (input.propertyType !== undefined) body["property_type"] = [input.propertyType];
  if (input.rooms?.length) body["rooms"] = [...input.rooms].sort((a, b) => a - b);
  if (input.priceMin !== undefined || input.priceMax !== undefined) {
    body["budget"] = [input.priceMin ?? 0, input.priceMax ?? 0];
  }
  if (input.surfaceMin !== undefined || input.surfaceMax !== undefined) {
    body["surface"] = [input.surfaceMin ?? 0, input.surfaceMax ?? 0];
  }
  if (input.listedBy !== "all") body["listed_by"] = [ARGUS_LISTED_BY_OWNER];
  if (input.countyId !== undefined) body["counties"] = [input.countyId];
  if (input.cityId !== undefined) body["cities"] = [input.cityId];
  if (input.areaIds?.length) body["areas"] = input.areaIds;
  return body;
}

/* ------------------------------------------------------------------ */
/* Normalizarea răspunsurilor Argus (phone_numbers nu se returnează).   */
/* ------------------------------------------------------------------ */

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const asNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** „2021-03-11 10:35:43” → „2021-03-11T10:35:43” (interpretabil de Date). */
export function parseArgusDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return raw.includes("T") ? raw : raw.replace(" ", "T");
}

export type ArgusPropertyCard = {
  id: string;
  title: string | null;
  price: number | null;
  currency: "EUR";
  rooms: number | null;
  surface: number | null;
  yearBuilt: number | null;
  floor: string | null;
  city: string | null;
  area: string | null;
  county: string | null;
  /** Sursa anunțului raportată de Argus (last_source_name). */
  sourceName: string | null;
  /** Linkul anunțului original (last_site_link), păstrat exact. */
  url: string | null;
  date: string | null;
  listedByLabel: string | null;
  transactionLabel: string | null;
  propertyTypeLabel: string | null;
  hasImage: boolean;
};

/** Cardul unui anunț din căutare. Telefoanele se elimină deliberate. */
export function normalizeArgusProperty(raw: unknown): ArgusPropertyCard | null {
  const p = asRaw(raw);
  const id = asString(p?.["property_id"]);
  if (!p || !id) return null;
  const details = asRaw(p["details"]);
  const location = asRaw(p["location"]);
  return {
    id,
    title: asString(p["title"]),
    price: asNumber(p["last_price"]),
    currency: "EUR",
    rooms: asNumber(details?.["rooms"]),
    surface: asNumber(details?.["living_area"]),
    yearBuilt: asNumber(details?.["year_built"]),
    floor: asString(details?.["floors_number_text"]),
    city: asString(location?.["city"]),
    area: asString(location?.["area"]),
    county: asString(location?.["county"]),
    sourceName: asString(p["last_source_name"]),
    url: asString(p["last_site_link"]),
    date: parseArgusDate(p["last_date"]),
    listedByLabel: asString(p["listed_by_label"]),
    transactionLabel: asString(p["transaction_label"]),
    propertyTypeLabel: asString(p["property_type_label"]),
    hasImage: p["has_image"] === true,
  };
}

export type ArgusSearchResult = { items: ArgusPropertyCard[]; total: number };

export function normalizeArgusSearch(raw: unknown): ArgusSearchResult {
  const root = asRaw(raw);
  const list = Array.isArray(root?.["properties"]) ? root["properties"] : [];
  const items = list
    .map(normalizeArgusProperty)
    .filter((p): p is ArgusPropertyCard => p !== null);
  return { items, total: asNumber(root?.["total"]) ?? items.length };
}

export type ArgusImage = { full: string; thumb: string | null };

export function normalizeArgusImages(raw: unknown): ArgusImage[] {
  const root = asRaw(raw);
  const list = Array.isArray(root?.["images"])
    ? root["images"]
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];
  const out: ArgusImage[] = [];
  for (const entry of list) {
    const img = asRaw(entry);
    const full = asString(img?.["File"]);
    if (full) out.push({ full, thumb: asString(img?.["Thumb"]) });
  }
  return out;
}

export type ArgusPosition = { lat: number; lon: number };

export type ArgusPropertyDetailData = ArgusPropertyCard & {
  description: string | null;
  images: ArgusImage[];
  /** Detaliile brute (camere, suprafețe, an etc.), doar valori simple. */
  details: Record<string, string | number>;
  position: ArgusPosition | null;
};

const DETAIL_SKIP_KEYS = new Set(["phone", "phone_numbers", "phones"]);

/** Detaliul unui anunț. Telefoanele se elimină — se cer separat, la click. */
export function normalizeArgusDetail(raw: unknown, images?: ArgusImage[]): ArgusPropertyDetailData | null {
  const card = normalizeArgusProperty(raw);
  const p = asRaw(raw);
  if (!card || !p) return null;
  const detailsRaw = asRaw(p["details"]);
  const details: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(detailsRaw ?? {})) {
    if (DETAIL_SKIP_KEYS.has(key)) continue;
    const num = asNumber(value);
    const str = asString(value);
    if (num !== null) details[key] = num;
    else if (str) details[key] = str;
  }
  const positionRaw = asRaw(asRaw(p["location"])?.["position"]);
  const lat = asNumber(positionRaw?.["lat"]);
  const lon = asNumber(positionRaw?.["lon"]);
  return {
    ...card,
    description: asString(p["description"]),
    images: images ?? normalizeArgusImages(p),
    details,
    position: lat !== null && lon !== null ? { lat, lon } : null,
  };
}

/** Singurul loc de unde vin telefoanele: /properties/contact, la click. */
export function normalizeArgusContact(raw: unknown): { phones: string[] } {
  const root = asRaw(raw);
  const list = Array.isArray(root?.["phone_numbers"]) ? root["phone_numbers"] : [];
  return { phones: list.map(asString).filter((p): p is string => p !== null) };
}

/* ------------------------------------------------------------------ */
/* Localizare (județe / orașe / zone) și taxonomii.                     */
/* ------------------------------------------------------------------ */

export type ArgusPlace = { id: number; name: string };

export type ArgusPlacesPage = { options: ArgusPlace[]; nextPage: number | null };

/** O pagină din /tools/localisation/*: { result: [...], next_page }. */
export function normalizeArgusPlacesPage(raw: unknown): ArgusPlacesPage {
  const root = asRaw(raw);
  const list = Array.isArray(root?.["result"]) ? root["result"] : [];
  const options: ArgusPlace[] = [];
  for (const entry of list) {
    const place = asRaw(entry);
    const id = asNumber(place?.["id"]);
    const name = asString(place?.["name"]);
    if (id !== null && name) options.push({ id, name });
  }
  return { options, nextPage: asNumber(root?.["next_page"]) };
}

export type ArgusPropertyType = { id: number; label: string };

/** Tipuri de proprietate de nivel superior (property_sub_type = 0). */
export function normalizeArgusPropertyTypes(raw: unknown): ArgusPropertyType[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ArgusPropertyType[] = [];
  const seen = new Set<number>();
  for (const entry of list) {
    const t = asRaw(entry);
    const id = asNumber(t?.["property_type"]);
    const subType = asNumber(t?.["property_sub_type"]);
    const label = asString(t?.["label_utf"]) ?? asString(t?.["label"]);
    if (id !== null && subType === 0 && label && !seen.has(id)) {
      seen.add(id);
      out.push({ id, label });
    }
  }
  return out;
}
