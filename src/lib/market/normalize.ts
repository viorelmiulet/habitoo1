/**
 * Normalizarea deterministă a ofertelor de piață importate.
 *
 * Reguli:
 *  - nu inventăm valori: ce lipsește rămâne `null`;
 *  - valorile originale ale câmpurilor mapate se păstrează în `raw_data.original`;
 *  - textul se normalizează separat (fără diacritice, minuscule, spații
 *    comprimate, abrevieri evidente) pentru potrivire, dar valoarea afișată
 *    rămâne cea originală;
 *  - datele evident personale (telefon, email, nume de contact) nu se salvează.
 */
import { normalizeRoName, prettyUatName } from "@/lib/ro-normalize";

/** Câmpurile pe care le poate produce un import. */
export const MARKET_FIELDS = [
  "sourceListingId",
  "url",
  "title",
  "imageUrl",
  "propertyType",
  "transactionType",
  "city",
  "county",
  "district",
  "neighborhood",
  "address",
  "latitude",
  "longitude",
  "rooms",
  "bathrooms",
  "usableArea",
  "totalArea",
  "floor",
  "totalFloors",
  "constructionYear",
  "price",
  "currency",
  "condition",
  "furnished",
  "parking",
  "balcony",
  "features",
  "status",
] as const;

export type MarketField = (typeof MARKET_FIELDS)[number];

/** Maparea explicită dintre cheile sursei și câmpurile Habitoo. */
export type MarketFieldMapping = Partial<Record<MarketField, string | string[]>>;

export type NormalizedListing = {
  source: string;
  sourceListingId: string;
  url: string | null;
  title: string | null;
  imageUrl: string | null;
  propertyType: string | null;
  transactionType: string | null;
  city: string | null;
  county: string | null;
  district: string | null;
  neighborhood: string | null;
  address: string | null;
  normalizedCity: string | null;
  normalizedCounty: string | null;
  normalizedDistrict: string | null;
  normalizedNeighborhood: string | null;
  normalizedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  rooms: number | null;
  bathrooms: number | null;
  usableArea: number | null;
  totalArea: number | null;
  floor: number | null;
  totalFloors: number | null;
  constructionYear: number | null;
  price: number | null;
  currency: string | null;
  pricePerSqm: number | null;
  condition: string | null;
  furnished: boolean | null;
  parking: boolean | null;
  balcony: boolean | null;
  features: Record<string, boolean>;
  status: MarketListingStatus;
  rawData: { source: string; original: Record<string, string> };
};

export type MarketListingStatus = "active" | "inactive" | "archived";

export type NormalizeIssue = { field: string; message: string };

export type NormalizeResult =
  | { ok: true; listing: NormalizedListing; warnings: NormalizeIssue[] }
  | { ok: false; issues: NormalizeIssue[] };

/** Chei care nu se salvează niciodată în raw_data. */
const SENSITIVE_KEY = /(phone|tel|mobil|email|mail|contact|owner|proprietar|persoana|agent|cnp|iban)/i;

function readRaw(record: Record<string, unknown>, key: string): unknown {
  if (key in record) return record[key];
  // suport pentru chei imbricate simple: "location.city"
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

function pick(
  record: Record<string, unknown>,
  mapping: MarketFieldMapping,
  field: MarketField,
): { value: unknown; key: string | null } {
  const keys = mapping[field];
  if (!keys) return { value: undefined, key: null };
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const value = readRaw(record, key);
    if (value !== undefined && value !== null && value !== "") return { value, key };
  }
  return { value: undefined, key: Array.isArray(keys) ? (keys[0] ?? null) : keys };
}

export function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.replace(/\s+/g, " ").trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** Număr tolerant la formate locale: „120.000,5”, „1 200”, „85 mp”, „€140000”. */
export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = textValue(value);
  if (text === null) return null;
  let clean = text.replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (clean === "" || clean === "-") return null;
  const dots = (clean.match(/\./g) ?? []).length;
  const commas = (clean.match(/,/g) ?? []).length;
  if (dots > 0 && commas > 0) {
    // separatorul zecimal este ultimul dintre cele două
    if (clean.lastIndexOf(",") > clean.lastIndexOf(".")) {
      clean = clean.replace(/\./g, "").replace(",", ".");
    } else {
      clean = clean.replace(/,/g, "");
    }
  } else if (commas > 0) {
    clean = isThousandsGrouped(clean, ",") ? clean.replace(/,/g, "") : clean.replace(/,/g, ".");
  } else if (dots > 0) {
    if (isThousandsGrouped(clean, ".")) clean = clean.replace(/\./g, "");
  }
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

/** „120.000” / „1,200,000” = grupare de mii; „85.5” = zecimală. */
function isThousandsGrouped(clean: string, separator: string): boolean {
  const parts = clean.replace(/^-/, "").split(separator);
  if (parts.length < 2) return false;
  const [first, ...rest] = parts;
  if (!first || first.length === 0 || first.length > 3) return false;
  return rest.every((part) => part.length === 3);
}

export function parseIntegerValue(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return Math.round(parsed);
}

const TRUE_WORDS = new Set(["1", "true", "da", "yes", "y", "exista", "inclus", "cu"]);
const FALSE_WORDS = new Set(["0", "false", "nu", "no", "n", "fara", "lipsa", "inexistent"]);

export function parseBooleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const text = textValue(value);
  if (text === null) return null;
  const norm = normalizeRoName(text);
  if (TRUE_WORDS.has(norm)) return true;
  if (FALSE_WORDS.has(norm)) return false;
  return null;
}

const PROPERTY_TYPES: { canonical: string; patterns: RegExp }[] = [
  { canonical: "apartament", patterns: /(apartament|apt|garsoniera|flat)/ },
  { canonical: "casa", patterns: /(casa|vila|duplex|house)/ },
  { canonical: "teren", patterns: /(teren|lot|land)/ },
  { canonical: "spatiu comercial", patterns: /(spatiu comercial|comercial|retail|magazin)/ },
  { canonical: "birou", patterns: /(birou|office)/ },
  { canonical: "hala", patterns: /(hala|depozit|industrial|warehouse)/ },
];

export function normalizePropertyType(value: unknown): string | null {
  const text = textValue(value);
  if (text === null) return null;
  const norm = normalizeRoName(text);
  for (const entry of PROPERTY_TYPES) {
    if (entry.patterns.test(norm)) return entry.canonical;
  }
  return norm || null;
}

export function normalizeTransactionType(value: unknown): string | null {
  const text = textValue(value);
  if (text === null) return null;
  const norm = normalizeRoName(text);
  if (/(vanzare|vand|sale|sell|de vanzare)/.test(norm)) return "sale";
  if (/(inchiriere|chirie|rent|let|de inchiriat)/.test(norm)) return "rent";
  if (norm === "sale" || norm === "rent") return norm;
  return null;
}

const CONDITIONS: { canonical: string; patterns: RegExp }[] = [
  { canonical: "nou", patterns: /(nou|new|la cheie|finisat modern)/ },
  { canonical: "renovat", patterns: /(renovat|modernizat|reamenajat|renovated)/ },
  { canonical: "foarte buna", patterns: /(foarte buna|excelenta|very good)/ },
  { canonical: "buna", patterns: /(buna|good|intretinut)/ },
  { canonical: "medie", patterns: /(medie|average|acceptabil)/ },
  { canonical: "necesita renovare", patterns: /(necesita renovare|nefinisat|needs renovation|de renovat|semifinisat)/ },
];

export function normalizeCondition(value: unknown): string | null {
  const text = textValue(value);
  if (text === null) return null;
  const norm = normalizeRoName(text);
  for (const entry of CONDITIONS) {
    if (entry.patterns.test(norm)) return entry.canonical;
  }
  return null;
}

export function normalizeCurrency(value: unknown): string | null {
  const text = textValue(value);
  if (text === null) return null;
  const norm = normalizeRoName(text);
  if (/(eur|euro|€)/.test(norm) || text.includes("€")) return "EUR";
  if (/(ron|lei|leu)/.test(norm)) return "RON";
  if (/(usd|dolar|\$)/.test(norm) || text.includes("$")) return "USD";
  return null;
}

/** Etaj tolerant: „parter”, „demisol”, „etaj 3”, „3/8”, „mansarda”. */
export function normalizeFloor(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const text = textValue(value);
  if (text === null) return null;
  const norm = normalizeRoName(text);
  if (/parter|ground/.test(norm)) return 0;
  if (/demisol|subsol|basement/.test(norm)) return -1;
  const match = norm.match(/-?\d+/);
  if (!match) return null;
  return Number(match[0]);
}

/** Abrevieri evidente extinse înainte de normalizarea textului de adresă. */
const ADDRESS_ABBREVIATIONS: [RegExp, string][] = [
  [/\bstr\b\.?/g, "strada"],
  [/\bbd\b\.?|\bbdul\b\.?|\bb dul\b/g, "bulevardul"],
  [/\bblv\b\.?/g, "bulevardul"],
  [/\bcal\b\.?/g, "calea"],
  [/\bsos\b\.?/g, "soseaua"],
  [/\bald\b\.?|\bal\b\.?/g, "aleea"],
  [/\bintr\b\.?/g, "intrarea"],
  [/\bpta\b\.?|\bp ta\b/g, "piata"],
  [/\bnr\b\.?/g, "numarul"],
  [/\bbl\b\.?/g, "blocul"],
  [/\bsc\b\.?/g, "scara"],
  [/\bap\b\.?/g, "apartamentul"],
  [/\bet\b\.?/g, "etajul"],
  [/\bsect\b\.?|\bsec\b\.?/g, "sectorul"],
];

/** Text normalizat pentru potrivire: fără diacritice, minuscule, abrevieri extinse. */
export function normalizeMatchText(value: string | null | undefined): string | null {
  if (!value) return null;
  let norm = normalizeRoName(value);
  if (!norm) return null;
  for (const [pattern, replacement] of ADDRESS_ABBREVIATIONS) {
    norm = norm.replace(pattern, replacement);
  }
  norm = norm.replace(/\s+/g, " ").trim();
  return norm || null;
}

/** Localitate/județ normalizate, fără prefixe administrative. */
export function normalizePlace(value: string | null | undefined): string | null {
  if (!value) return null;
  const norm = normalizeRoName(prettyUatName(value));
  return norm || null;
}

export function computePricePerSqm(
  price: number | null,
  usableArea: number | null,
  totalArea: number | null,
): number | null {
  const area = usableArea && usableArea > 0 ? usableArea : totalArea;
  if (!price || price <= 0 || !area || area <= 0) return null;
  return Math.round((price / area) * 100) / 100;
}

function normalizeStatus(value: unknown): MarketListingStatus {
  const text = textValue(value);
  if (text === null) return "active";
  const norm = normalizeRoName(text);
  if (/(inactiv|inactive|expirat|expired|retras|withdrawn|suspendat|pending)/.test(norm)) {
    return "inactive";
  }
  if (/(arhivat|archived|vandut|sold|inchiriat|rented|closed)/.test(norm)) return "archived";
  return "active";
}

function parseFeatures(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (Array.isArray(value)) {
    for (const item of value) {
      const key = normalizeMatchText(textValue(item));
      if (key) out[key] = true;
    }
    return out;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = normalizeMatchText(k);
      const flag = parseBooleanValue(v);
      if (key && flag !== null) out[key] = flag;
    }
    return out;
  }
  const text = textValue(value);
  if (text === null) return out;
  for (const part of text.split(/[,;|]/)) {
    const key = normalizeMatchText(part);
    if (key) out[key] = true;
  }
  return out;
}

/**
 * Normalizează o înregistrare brută dintr-o sursă autorizată.
 * `source` și `sourceListingId` sunt obligatorii pentru identificare.
 */
export function normalizeRecord(
  source: string,
  record: unknown,
  mapping: MarketFieldMapping,
): NormalizeResult {
  const issues: NormalizeIssue[] = [];
  const warnings: NormalizeIssue[] = [];

  if (!source || typeof source !== "string") {
    return { ok: false, issues: [{ field: "source", message: "Sursa lipsește." }] };
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      ok: false,
      issues: [{ field: "record", message: "Înregistrarea nu este un obiect valid." }],
    };
  }

  const raw = record as Record<string, unknown>;
  const original: Record<string, string> = {};
  const get = (field: MarketField) => {
    const { value, key } = pick(raw, mapping, field);
    if (value !== undefined && key && !SENSITIVE_KEY.test(key)) {
      const text = textValue(value);
      if (text !== null && text.length <= 500) original[key] = text;
    }
    return value;
  };

  const sourceListingId = textValue(get("sourceListingId"));
  const url = textValue(get("url"));
  if (!sourceListingId) {
    issues.push({
      field: "sourceListingId",
      message: "Identificatorul ofertei la sursă este obligatoriu.",
    });
  }
  if (url && !/^https?:\/\//i.test(url)) {
    warnings.push({ field: "url", message: "URL ignorat: nu începe cu http(s)." });
  }

  const price = parseNumber(get("price"));
  if (price !== null && price <= 0) {
    issues.push({ field: "price", message: "Prețul trebuie să fie pozitiv." });
  }
  const usableArea = parseNumber(get("usableArea"));
  const totalArea = parseNumber(get("totalArea"));
  if (usableArea !== null && usableArea <= 0) {
    warnings.push({ field: "usableArea", message: "Suprafață utilă invalidă, ignorată." });
  }

  const city = textValue(get("city"));
  const county = textValue(get("county"));
  const district = textValue(get("district"));
  const neighborhood = textValue(get("neighborhood"));
  const address = textValue(get("address"));
  if (!city && !address) {
    warnings.push({
      field: "city",
      message: "Fără oraș și fără adresă: oferta va fi greu de potrivit.",
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  const latitude = parseNumber(get("latitude"));
  const longitude = parseNumber(get("longitude"));
  const validGeo =
    latitude !== null &&
    longitude !== null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  const cleanUsable = usableArea !== null && usableArea > 0 ? usableArea : null;
  const cleanTotal = totalArea !== null && totalArea > 0 ? totalArea : null;
  const constructionYear = parseIntegerValue(get("constructionYear"));
  const currentYear = new Date().getUTCFullYear();
  const validYear =
    constructionYear !== null && constructionYear >= 1800 && constructionYear <= currentYear + 5
      ? constructionYear
      : null;
  if (constructionYear !== null && validYear === null) {
    warnings.push({ field: "constructionYear", message: "An de construcție implauzibil, ignorat." });
  }

  const listing: NormalizedListing = {
    source,
    sourceListingId: sourceListingId!,
    url: url && /^https?:\/\//i.test(url) ? url : null,
    title: textValue(get("title")),
    imageUrl: (() => {
      const value = textValue(get("imageUrl"));
      return value && /^https?:\/\//i.test(value) ? value : null;
    })(),
    propertyType: normalizePropertyType(get("propertyType")),
    transactionType: normalizeTransactionType(get("transactionType")),
    city,
    county,
    district,
    neighborhood,
    address,
    normalizedCity: normalizePlace(city),
    normalizedCounty: normalizePlace(county),
    normalizedDistrict: normalizeMatchText(district),
    normalizedNeighborhood: normalizeMatchText(neighborhood),
    normalizedAddress: normalizeMatchText(address),
    latitude: validGeo ? latitude : null,
    longitude: validGeo ? longitude : null,
    rooms: parseNumber(get("rooms")),
    bathrooms: parseNumber(get("bathrooms")),
    usableArea: cleanUsable,
    totalArea: cleanTotal,
    floor: normalizeFloor(get("floor")),
    totalFloors: parseIntegerValue(get("totalFloors")),
    constructionYear: validYear,
    price,
    currency: normalizeCurrency(get("currency")),
    pricePerSqm: computePricePerSqm(price, cleanUsable, cleanTotal),
    condition: normalizeCondition(get("condition")),
    furnished: parseBooleanValue(get("furnished")),
    parking: parseBooleanValue(get("parking")),
    balcony: parseBooleanValue(get("balcony")),
    features: parseFeatures(get("features")),
    status: normalizeStatus(get("status")),
    rawData: { source, original },
  };

  return { ok: true, listing, warnings };
}
