/**
 * Feed XML Kyero v3 pentru BazarulDeCase.ro (pluginul WordPress „Houzez Property Feed”).
 * Logică pură: aceleași date ca feedul JSON /sites/v1, alt format. Fără CDATA;
 * se escapează doar cele 5 caractere XML, iar în descriere rândurile noi devin `&#13;`.
 */
import { normalizeHouseraLocality } from "@/lib/portals/housera/mapper";

export const BAZARULDECASE_PORTAL = "bazaruldecase";
export const BAZARULDECASE_XML_PATH = "/api/public/portal/v1/bazaruldecase/feed.xml";
export const KYERO_MAX_IMAGES = 50;
export const KYERO_HEADERS: Record<string, string> = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "no-cache, must-revalidate",
};

/** Tipurile Habitoo → tipul Kyero (engleză). Fără corespondent = oferta se omite. */
export const KYERO_TYPES: Record<string, string> = {
  apartment: "Apartment",
  studio: "Studio",
  penthouse: "Penthouse",
  duplex: "Duplex",
  house: "House",
  villa: "Villa",
  land: "Land",
  commercial: "Commercial",
  office: "Office",
  industrial: "Industrial",
  garage: "Garage",
};

export function kyeroType(propertyType: string | null | undefined): string | null {
  return KYERO_TYPES[(propertyType ?? "").trim().toLowerCase()] ?? null;
}

// Caractere de control invalide în XML 1.0 (în afară de tab/LF/CR).
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Escapează exact `& < > " '`. */
export function xmlEscape(value: string): string {
  return value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Text fără HTML; rândurile noi devin `&#13;` (după escapare). */
export function kyeroDescription(raw: string | null | undefined): string {
  const text = (raw ?? "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return xmlEscape(text).replace(/\n/g, "&#13;");
}

/** `YYYY-MM-DD HH:MM:SS` în ora României. */
export function kyeroDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Nou / în construcție → 1. */
export function kyeroNewBuild(stage: string | null | undefined): 0 | 1 {
  const s = fold(stage ?? "");
  if (!s) return 0;
  return /constructie|construction|proiect|project|la rosu|\bnou\b|\bnoua\b|\bnew\b/.test(s) ? 1 : 0;
}

/** Clasa energetică A+…G → litera A…G (A+ → A); altfel null. */
export function kyeroEnergy(cls: string | null | undefined): string | null {
  const m = (cls ?? "").trim().toUpperCase().match(/^([A-G])(\+*)$/);
  return m ? m[1]! : null;
}

/** Telefon în format `0040…`; null dacă nu are cifre suficiente. */
export function kyeroPhone(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = `00${d.slice(1)}`;
  d = d.replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.startsWith("0040")) return d;
  if (d.startsWith("40") && d.length === 11) return `00${d}`;
  if (d.startsWith("0") && !d.startsWith("00")) return `0040${d.slice(1)}`;
  return d.startsWith("00") ? d : `0040${d}`;
}

/** Eticheta unei dotări: fără punctuație, maximum 35 de caractere. */
export function kyeroFeature(label: string): string | null {
  const s = label.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 35).trim();
  return s || null;
}

export type KyeroProperty = {
  id: string;
  updated_at: string | null;
  reference: string | null;
  property_type: string;
  transaction_kind: string | null;
  for_sale: boolean | null;
  for_rent: boolean | null;
  price: number | null;
  sale_price: number | null;
  rent_price: number | null;
  currency: string | null;
  sale_currency: string | null;
  rent_currency: string | null;
  construction_stage: string | null;
  city: string | null;
  county: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  bedrooms: number | null;
  rooms: number | null;
  bathrooms: number | null;
  usable_surface: number | null;
  surface: number | null;
  land_surface: number | null;
  energy_class: string | null;
  description: string | null;
  features: string[];
};

export type KyeroInput = {
  property: KyeroProperty;
  /** URL-uri publice HTTPS, coperta prima. */
  images: string[];
  agent: { email: string | null; phone: string | null } | null;
  /** Coordonatele publice (respectă precizia), dacă există. */
  coords: { lat: number; lng: number } | null;
};

export type KyeroResult = { xml: string[]; ids: string[]; warnings: string[] };

const CURRENCIES = new Set(["EUR", "RON", "USD"]);
const el = (tag: string, value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? "" : `<${tag}>${typeof value === "number" ? value : xmlEscape(value)}</${tag}>`;
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

/** O ofertă → zero, unul sau două `<property>` (vânzare + închiriere). */
export function kyeroProperties(input: KyeroInput): KyeroResult {
  const p = input.property;
  const label = p.reference ?? p.id;
  const type = kyeroType(p.property_type);
  if (!type) return { xml: [], ids: [], warnings: [`${label}: tipul „${p.property_type}” nu are corespondent Kyero; oferta nu apare în feedul XML.`] };

  const isRent = p.transaction_kind === "rent";
  const forSale = p.for_sale ?? !isRent;
  const forRent = p.for_rent ?? isRent;
  const legs: Array<{ kind: "sale" | "rent"; price: number | null; currency: string | null }> = [];
  if (forSale) legs.push({ kind: "sale", price: num(p.sale_price ?? p.price), currency: p.sale_currency ?? p.currency });
  if (forRent) legs.push({ kind: "rent", price: num(p.rent_price ?? p.price), currency: p.rent_currency ?? p.currency });

  const loc = normalizeHouseraLocality(p.city, p.county, p.district);
  const desc = kyeroDescription(p.description);
  const features = [...new Set(p.features.map(kyeroFeature).filter((f): f is string => !!f))];
  const pool = p.features.some((f) => /piscin|pool/i.test(fold(f))) ? 1 : 0;
  const energy = kyeroEnergy(p.energy_class);
  const images = input.images.slice(0, KYERO_MAX_IMAGES);
  const phone = kyeroPhone(input.agent?.phone);

  const out: KyeroResult = { xml: [], ids: [], warnings: [] };
  for (const leg of legs) {
    const id = `${p.id}-${leg.kind}`;
    const currency = (leg.currency ?? "").toUpperCase();
    if (!leg.price) { out.warnings.push(`${label} (${leg.kind === "sale" ? "vânzare" : "închiriere"}): lipsește prețul; tranzacția nu apare în feedul XML.`); continue; }
    if (!CURRENCIES.has(currency)) { out.warnings.push(`${label}: moneda „${leg.currency ?? ""}” nu este acceptată (EUR/RON/USD).`); continue; }
    const parts = [
      el("id", id),
      el("date", kyeroDate(p.updated_at)),
      el("ref", p.reference ?? p.id),
      el("price", leg.price),
      el("currency", currency),
      el("price_freq", leg.kind === "sale" ? "sale" : "month"),
      el("new_build", kyeroNewBuild(p.construction_stage)),
      el("type", type),
      el("town", loc.city),
      el("province", loc.county),
      el("country", "Romania"),
      input.coords ? `<location>${el("latitude", input.coords.lat)}${el("longitude", input.coords.lng)}</location>` : "",
      el("location_detail", loc.area),
      el("beds", num(p.bedrooms ?? p.rooms)),
      el("baths", num(p.bathrooms)),
      el("pool", pool),
      (() => {
        const built = num(p.usable_surface ?? p.surface);
        const plot = num(p.land_surface);
        return built || plot ? `<surface_area>${el("built", built)}${el("plot", plot)}</surface_area>` : "";
      })(),
      energy ? `<energy_rating>${el("consumption", energy)}${el("emissions", "X")}</energy_rating>` : "",
      desc ? `<desc><en>${desc}</en><ro>${desc}</ro></desc>` : "",
      features.length ? `<features>${features.map((f) => el("feature", f)).join("")}</features>` : "",
      el("notes", `Habitoo ${p.reference ?? p.id}`),
      el("email", input.agent?.email ?? null),
      el("contact_number", phone),
      images.length ? `<images>${images.map((u, i) => `<image id="${i + 1}">${el("url", u)}</image>`).join("")}</images>` : "",
    ];
    out.xml.push(`<property>${parts.join("")}</property>`);
    out.ids.push(id);
  }
  return out;
}

/** Documentul complet; fără proprietăți = Houzez retrage ofertele. */
export function kyeroDocument(properties: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root><kyero><feed_version>3</feed_version></kyero>${properties.join("")}</root>\n`;
}
