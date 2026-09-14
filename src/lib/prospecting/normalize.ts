/**
 * Parser determinist + normalizare (Stage 13).
 *
 * Reguli absolute: dacă o valoare nu există în sursă, NU este inventată.
 * Câmpul rămâne `null` și `fieldSources` marchează „missing”. AI-ul poate
 * completa ulterior doar câmpuri interpretative (tip vânzător, zonă), niciodată
 * preț, suprafață sau telefon.
 */
import type {
  NormalizedProspect,
  ProspectFieldSource,
  ProspectSellerType,
  ProspectTransaction,
  RawProspect,
} from "./types";

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|msclkid|ref|referrer|source|cmpid)/i;

/** URL canonic: fără parametri de urmărire, fără fragment, gazdă normalizată. */
export function canonicalizeUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.map(([key, value]) => `${key}=${value}`).join("&");
  let path = url.pathname.replace(/\/+$/, "");
  if (path === "") path = "/";
  return `https://${host}${path}${query === "" ? "" : `?${query}`}`;
}

/**
 * Telefon românesc normalizat la formatul internațional.
 * Orice valoare care nu poate fi validată devine `null` (nu ghicim).
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  let value = digits.startsWith("+") ? digits.slice(1) : digits;
  if (value.startsWith("00")) value = value.slice(2);
  if (value.startsWith("40")) value = value.slice(2);
  else if (value.startsWith("0")) value = value.slice(1);
  if (!/^7\d{8}$/.test(value) && !/^[23]\d{8}$/.test(value)) return null;
  return `+40${value}`;
}

/** Număr dintr-un text („85.000 EUR", „72,5 mp"). Fără valoare → `null`. */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/\s|\u00a0/g, "");
  const match = cleaned.match(/-?\d+(?:[.,]\d+)*/);
  if (!match) return null;
  let text = match[0];
  // 85.000 / 85,000 = mii; 72,5 / 72.5 = zecimale.
  if (/[.,]\d{3}(?:\D|$)/.test(`${text}|`) || /^\d{1,3}([.,]\d{3})+$/.test(text)) {
    text = text.replace(/[.,]/g, "");
  } else {
    text = text.replace(",", ".");
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const CURRENCIES: Record<string, string> = {
  "€": "EUR",
  eur: "EUR",
  euro: "EUR",
  lei: "RON",
  ron: "RON",
  "$": "USD",
  usd: "USD",
};

export function parsePrice(raw: unknown): { price: number | null; currency: string | null } {
  const price = parseNumber(raw);
  if (price === null || price <= 0) return { price: null, currency: null };
  const text = String(raw).toLowerCase();
  for (const [token, currency] of Object.entries(CURRENCIES)) {
    if (text.includes(token)) return { price, currency };
  }
  return { price, currency: null };
}

export function parseRooms(raw: unknown): number | null {
  const value = parseNumber(raw);
  if (value === null) return null;
  const rooms = Math.round(value);
  return rooms >= 1 && rooms <= 30 ? rooms : null;
}

export function parseSurface(raw: unknown): number | null {
  const value = parseNumber(raw);
  if (value === null) return null;
  return value > 0 && value <= 100_000 ? value : null;
}

export function parseFloor(raw: unknown): number | null {
  if (typeof raw === "string") {
    const lower = raw.toLowerCase();
    if (lower.includes("demisol") || lower.includes("subsol")) return -1;
    if (lower.includes("parter")) return 0;
    if (lower.includes("mansard")) return null;
  }
  const value = parseNumber(raw);
  if (value === null) return null;
  const floor = Math.round(value);
  return floor >= -3 && floor <= 60 ? floor : null;
}

export function parseYear(raw: unknown): number | null {
  const value = parseNumber(raw);
  if (value === null) return null;
  const year = Math.round(value);
  const current = new Date().getUTCFullYear() + 5;
  return year >= 1850 && year <= current ? year : null;
}

const AGENCY_HINTS = [
  "agentie",
  "agenție",
  "agency",
  "birou imobiliar",
  "colaborare cu agenti",
  "comision cumparator",
  "comision cumpărător",
  "portofoliul nostru",
  "reprezentam",
  "reprezentăm",
];
const PRIVATE_HINTS = [
  "proprietar",
  "particular",
  "fara comision",
  "fără comision",
  "comision 0",
  "vand personal",
  "vând personal",
  "direct de la proprietar",
];
const DEVELOPER_HINTS = [
  "dezvoltator",
  "ansamblu rezidential",
  "ansamblu rezidențial",
  "bloc nou",
  "developer",
  "de la constructor",
];

/** Diacritice eliminate, minuscule: baza tuturor comparațiilor textuale. */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clasificare deterministă a tipului de vânzător, pe baza indiciilor din text.
 * Fără indicii clare rămâne `unknown` — niciodată o presupunere.
 */
export function classifySellerType(text: string | null | undefined): {
  sellerType: ProspectSellerType;
  confidence: number;
  matched: string[];
} {
  const folded = foldText(text ?? "");
  if (folded === "") return { sellerType: "unknown", confidence: 0, matched: [] };
  const matched: string[] = [];
  const hit = (hints: string[]) => hints.filter((hint) => folded.includes(foldText(hint)));

  const developer = hit(DEVELOPER_HINTS);
  const agency = hit(AGENCY_HINTS);
  const priv = hit(PRIVATE_HINTS);

  if (developer.length > 0) {
    matched.push(...developer);
    return { sellerType: "developer", confidence: 0.7, matched };
  }
  if (agency.length > 0 && priv.length === 0) {
    matched.push(...agency);
    return { sellerType: "agency", confidence: 0.75, matched };
  }
  if (priv.length > 0 && agency.length === 0) {
    matched.push(...priv);
    return { sellerType: "private", confidence: 0.8, matched };
  }
  if (priv.length > 0 && agency.length > 0) {
    // Semnale contradictorii: nu decidem determinist.
    return { sellerType: "unknown", confidence: 0.2, matched: [...priv, ...agency] };
  }
  return { sellerType: "unknown", confidence: 0, matched: [] };
}

export function parseTransaction(raw: unknown): ProspectTransaction | null {
  const folded = foldText(String(raw ?? ""));
  if (folded === "") return null;
  if (/(inchiri|rent|lunar|\/luna)/.test(folded)) return "rent";
  if (/(vanzare|vand|sale|de vanzare)/.test(folded)) return "sale";
  return null;
}

/** Hash stabil (FNV-1a), identic pe server și în teste, fără dependențe. */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let second = 0x1000193;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    second ^= value.charCodeAt(index);
    second = Math.imul(second, 0x811c9dc5) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

function firstString(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function completeness(prospect: NormalizedProspect): number {
  const checks: (unknown | null)[] = [
    prospect.price,
    prospect.rooms,
    prospect.surfaceUseful,
    prospect.city,
    prospect.canonicalUrl,
    prospect.description,
    prospect.sellerPhone,
    prospect.propertyType,
  ];
  const filled = checks.filter((value) => value !== null && value !== undefined).length;
  return Math.round((filled / checks.length) * 100) / 100;
}

/**
 * Normalizare deterministă a unui anunț brut.
 * Ordinea: câmpuri explicite din sursă → text liber → nimic (null).
 */
export function normalizeProspect(raw: RawProspect): NormalizedProspect {
  const fields = raw.fields ?? {};
  const fieldSources: Record<string, ProspectFieldSource> = {};
  const mark = <T>(key: string, value: T | null): T | null => {
    fieldSources[key] = value === null || value === undefined ? "missing" : "parser";
    return value ?? null;
  };

  const description = raw.description?.trim() ?? null;
  const haystack = [raw.title, description, firstString(fields, ["sellerName", "seller", "agent"])]
    .filter(Boolean)
    .join(" \n ");

  const priceRaw = fields["price"] ?? firstString(fields, ["priceText", "pret"]) ?? null;
  const { price, currency } = parsePrice(priceRaw);
  const explicitCurrency = firstString(fields, ["currency", "moneda"]);

  const seller = classifySellerType(haystack);
  const sourceUrl = typeof raw.url === "string" && raw.url.trim() !== "" ? raw.url.trim() : null;

  const base: NormalizedProspect = {
    sourceKey: raw.sourceKey,
    externalId: raw.externalId?.trim() || null,
    sourceUrl,
    canonicalUrl: canonicalizeUrl(sourceUrl),
    title: raw.title.trim().slice(0, 240),
    description: description ? description.slice(0, 4000) : null,
    sellerName: mark("sellerName", firstString(fields, ["sellerName", "seller", "owner"])),
    sellerPhone: mark(
      "sellerPhone",
      normalizePhone(fields["sellerPhone"] ?? fields["phone"] ?? fields["telefon"]),
    ),
    sellerType: seller.sellerType,
    sellerConfidence: seller.sellerType === "unknown" && seller.confidence === 0 ? null : seller.confidence,
    transactionType: mark(
      "transactionType",
      parseTransaction(fields["transactionType"] ?? fields["transaction"] ?? raw.title),
    ),
    propertyType: mark("propertyType", firstString(fields, ["propertyType", "tip", "type"])),
    county: mark("county", firstString(fields, ["county", "judet", "județ"])),
    city: mark("city", firstString(fields, ["city", "oras", "oraș", "localitate"])),
    zone: mark("zone", firstString(fields, ["zone", "zona", "cartier", "district"])),
    address: mark("address", firstString(fields, ["address", "adresa", "adresă"])),
    price: mark("price", price),
    currency: mark("currency", currency ?? explicitCurrency),
    rooms: mark("rooms", parseRooms(fields["rooms"] ?? fields["camere"])),
    surfaceUseful: mark(
      "surfaceUseful",
      parseSurface(fields["surfaceUseful"] ?? fields["surface"] ?? fields["suprafata"]),
    ),
    surfaceBuilt: mark("surfaceBuilt", parseSurface(fields["surfaceBuilt"] ?? fields["suprafataConstruita"])),
    floor: mark("floor", parseFloor(fields["floor"] ?? fields["etaj"])),
    totalFloors: mark("totalFloors", parseFloor(fields["totalFloors"] ?? fields["etajeTotal"])),
    yearBuilt: mark("yearBuilt", parseYear(fields["yearBuilt"] ?? fields["anConstructie"])),
    features: typeof fields["features"] === "object" && fields["features"] !== null
      ? (fields["features"] as Record<string, unknown>)
      : {},
    images: Array.isArray(fields["images"])
      ? (fields["images"] as unknown[]).filter((item): item is string => typeof item === "string").slice(0, 20)
      : [],
    publishedAt: (() => {
      const value = firstString(fields, ["publishedAt", "published", "data"]);
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    })(),
    contentHash: "",
    normalizedHash: "",
    extractionConfidence: 0,
    fieldSources,
    fixture: raw.fixture === true,
  };

  const contentHash = stableHash(
    JSON.stringify({ title: base.title, description: base.description, fields }),
  );
  const normalizedHash = stableHash(
    JSON.stringify([
      base.canonicalUrl,
      base.sellerPhone,
      foldText(base.city ?? ""),
      base.rooms,
      base.surfaceUseful,
      base.price,
      foldText(base.title),
    ]),
  );

  const withHashes = { ...base, contentHash, normalizedHash };
  return { ...withHashes, extractionConfidence: completeness(withHashes) };
}
