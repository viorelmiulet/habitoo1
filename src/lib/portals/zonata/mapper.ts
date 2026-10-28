/**
 * Mapper pur Habitoo → corpul de anunț ZonaTa (pasul 2; trimiterea vine la pasul 3).
 * Fără rețea și fără bază de date: nomenclatorul și pozele se primesc ca parametri.
 *
 * Reguli:
 *  - tip + tranzacție → categorie/subcategorie din nomenclator; vânzare + închiriere → două corpuri,
 *    cu `external_id` diferit (`-v` / `-i`);
 *  - `fields` doar spre slug-urile și valorile din nomenclator; o valoare fără corespondent nu se trimite;
 *  - preț în moneda ofertei (EUR/RON), `price_type` = fixed;
 *  - pozele: primele 10, în ordinea Habitoo, doar JPEG/PNG/WebP.
 */
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { publicCoords } from "@/lib/geo";
import { cutAtWord, htmlToText, stripAdminPrefix } from "../imo24/mapper";
import { normalizeZt, type ZonataField, type ZonataSubcategory } from "./nomenclature";

export const ZONATA_TITLE_MIN = 16;
export const ZONATA_TITLE_MAX = 150;
export const ZONATA_DESCRIPTION_MIN = 40;
export const ZONATA_DESCRIPTION_MAX = 4000;
export const ZONATA_IMAGES_MAX = 10;

export type ZonataTransaction = "sale" | "rent";
export type ZonataFieldValue = string | string[];
export type ZonataListingBody = {
  external_id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  price_type: "fixed";
  price: number;
  currency: "EUR" | "RON";
  address: string;
  lat?: number;
  lng?: number;
  fields: Record<string, ZonataFieldValue>;
  images: string[];
};
export type ZonataImage = { url: string; path?: string | null; mime?: string | null };
export type ZonataMapResult =
  | { ok: true; bodies: ZonataListingBody[]; warnings: string[] }
  | { ok: false; reasons: string[]; warnings: string[] };

type Row = Partial<PropertyRow> & Pick<PropertyRow, "id"> & Record<string, any>;

const TX_LABEL: Record<ZonataTransaction, string> = { sale: "vânzare", rent: "închiriere" };
const TX_KEYWORDS: Record<ZonataTransaction, RegExp> = { sale: /vanzar|vand/, rent: /inchiri/ };
const TYPE_KEYWORDS: Record<string, RegExp[]> = {
  studio: [/garsonier/, /apartament/],
  apartment: [/apartament/],
  house: [/\bcas[ae]\b|vil[ae]/],
  villa: [/vil[ae]|\bcas[ae]\b/],
  land: [/teren/],
  commercial: [/spati\w* comercial|comercial/],
  office: [/birou/],
  industrial: [/industrial|\bhal[ae]\b/],
};
const TYPE_LABEL: Record<string, string> = {
  apartment: "Apartament", studio: "Garsonieră", house: "Casă", villa: "Vilă",
  land: "Teren", commercial: "Spațiu comercial", office: "Birou", industrial: "Spațiu industrial",
};

export function zonataTransactions(p: Row): ZonataTransaction[] {
  const out: ZonataTransaction[] = [];
  if (p.for_sale || p.transaction_kind === "sale") out.push("sale");
  if (p.for_rent || p.transaction_kind === "rent") out.push("rent");
  return out;
}

export function zonataSubcategoryFor(
  propertyType: string | null | undefined,
  tx: ZonataTransaction,
  nomenclature: ZonataSubcategory[],
): ZonataSubcategory | null {
  const patterns = TYPE_KEYWORDS[(propertyType ?? "").toLowerCase()];
  if (!patterns) return null;
  for (const re of patterns) {
    const hit = nomenclature.find((n) => {
      const text = normalizeZt(`${n.subcategory_slug} ${n.subcategory_label ?? ""}`);
      return re.test(text) && TX_KEYWORDS[tx].test(text);
    });
    if (hit) return hit;
  }
  return null;
}

export function zonataExternalId(p: Row, tx: ZonataTransaction): string {
  const base = ((p.reference ?? "").trim() || p.id).replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  const suffix = tx === "sale" ? "-v" : "-i";
  return `${base.slice(0, 64 - suffix.length)}${suffix}`;
}

export function zonataTitle(p: Row): string {
  const base = htmlToText(p.title).replace(/\s+/g, " ").trim();
  let title = cutAtWord(base, ZONATA_TITLE_MAX);
  if (title.length < ZONATA_TITLE_MIN) {
    const type = TYPE_LABEL[(p.property_type ?? "").toLowerCase()] ?? "";
    const rooms = typeof p.rooms === "number" && p.rooms > 0 ? Math.round(p.rooms) : null;
    const roomsText = rooms && p.property_type === "apartment" ? `${rooms} ${rooms === 1 ? "cameră" : "camere"}` : "";
    const zone = (p.district ?? "").trim() || stripAdminPrefix((p.city ?? "").trim());
    const norm = normalizeZt(title);
    const extra = [type, roomsText, zone].filter((x) => x && !norm.includes(normalizeZt(x)));
    title = cutAtWord([title, extra.join(" ")].filter(Boolean).join(title ? " – " : ""), ZONATA_TITLE_MAX);
  }
  return title;
}

export function zonataDescription(p: Row): string {
  return cutAtWord(htmlToText(p.description), ZONATA_DESCRIPTION_MAX);
}

export function zonataAddress(p: Row): string {
  const street = (p.location_precise ? (p.street ?? p.address) : p.street)?.trim() ?? "";
  const parts = [street, (p.district ?? "").trim(), stripAdminPrefix((p.city ?? "").trim()), stripAdminPrefix((p.county ?? "").trim())];
  const out: string[] = [];
  for (const part of parts) {
    if (part && !out.some((x) => normalizeZt(x) === normalizeZt(part))) out.push(part);
  }
  return out.join(", ");
}

const IMAGE_EXT = /\.(jpe?g|png|webp)(\?|$)/i;
const IMAGE_MIME = /^image\/(jpeg|png|webp)$/i;
export function zonataImages(images: ZonataImage[]): { urls: string[]; skipped: number } {
  const ok = images.filter((i) => (i.mime ? IMAGE_MIME.test(i.mime) : IMAGE_EXT.test(i.path ?? i.url)));
  return { urls: ok.slice(0, ZONATA_IMAGES_MAX).map((i) => i.url), skipped: images.length - ok.length };
}

// ---------------------------------------------------------------- fields

function findField(fields: ZonataField[], keys: string[], exclude?: RegExp): ZonataField | null {
  const norm = (f: ZonataField) => [normalizeZt(f.slug.replace(/_num$/, "")), normalizeZt(f.label)];
  for (const k of keys) {
    const hit = fields.find((f) => norm(f).includes(k));
    if (hit) return hit;
  }
  for (const k of keys) {
    const hit = fields.find((f) => norm(f).some((x) => x.includes(k) && !(exclude && exclude.test(x))));
    if (hit) return hit;
  }
  return null;
}

/** Valoarea pentru un câmp select/radio: doar o opțiune existentă. */
export function matchOption(field: ZonataField, raw: string | number): string | null {
  const v = normalizeZt(String(raw));
  if (!v) return null;
  const exact = field.options.find((o) => normalizeZt(o.value) === v || normalizeZt(o.label) === v);
  if (exact) return exact.value;
  if (typeof raw === "number") {
    // „5+” / „peste 5” acceptă valorile mai mari.
    for (const o of field.options) {
      const m = /^(?:peste )?(\d+)\s*\+?$/.exec(normalizeZt(o.label)) ?? /^(\d+)\s*\+$/.exec(normalizeZt(o.value));
      if (m && /\+|peste/.test(`${o.label} ${o.value}`) && raw >= Number(m[1])) return o.value;
    }
  }
  return null;
}

function setValue(out: Record<string, ZonataFieldValue>, field: ZonataField | null, raw: string | number | null | undefined) {
  if (!field || raw === null || raw === undefined || raw === "" || out[field.slug] !== undefined) return;
  if (field.type === "select" || field.type === "radio") {
    const v = matchOption(field, raw);
    if (v !== null) out[field.slug] = v;
  } else if (field.type === "text") {
    out[field.slug] = String(raw);
  }
}

function featureLabels(p: Row): string[] {
  const lists = [
    p.features, p.building_amenities, p.additional_spaces, p.misc_features, p.utilities,
    p.cooling_systems, p.heating_systems, p.appliances, p.kitchen_features, p.metering,
    p.windows, p.insulation, p.floor_finishes, p.wall_finishes, p.views, p.street_arrangement,
  ] as Array<unknown[] | null | undefined>;
  const out: string[] = [];
  for (const list of lists) for (const item of list ?? []) if (item) out.push(String(item));
  if (p.heating) out.push(String(p.heating));
  if (p.parking) out.push(String(p.parking));
  return out;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function zonataFields(p: Row, sub: ZonataSubcategory): Record<string, ZonataFieldValue> {
  const f = sub.fields;
  const out: Record<string, ZonataFieldValue> = {};
  const rooms = num(p.rooms) !== null ? Math.round(p.rooms as number) : null;
  setValue(out, findField(f, ["numar camere", "nr camere", "camere"]), rooms);
  setValue(out, findField(f, ["suprafata utila"]), num(p.usable_surface ?? p.surface));
  setValue(out, findField(f, ["suprafata construita"]), num(p.built_surface));
  setValue(out, findField(f, ["suprafata teren"]), num(p.land_surface));
  if ((p.property_type ?? "") === "land") setValue(out, findField(f, ["suprafata"]), num(p.land_surface ?? p.surface));
  const floor = num(p.floor);
  const floorField = findField(f, ["etaj"], /etaje|numar etaje/);
  if (floorField && floorField.type !== "text" && floor === 0) setValue(out, floorField, "parter");
  setValue(out, floorField, floor !== null ? Math.round(floor) : (p.floor_label ?? null));
  setValue(out, findField(f, ["numar bai", "bai"]), num(p.bathrooms) !== null ? Math.round(p.bathrooms as number) : null);
  setValue(out, findField(f, ["an constructie", "anul constructiei", "an"]), num(p.build_year) !== null ? Math.round(p.build_year as number) : null);
  setValue(out, findField(f, ["compartimentare"]), p.layout ?? null);
  const comfort = p.comfort ? (/^\d$/.test(String(p.comfort).trim()) ? `confort ${String(p.comfort).trim()}` : String(p.comfort)) : null;
  const comfortField = findField(f, ["confort"]);
  setValue(out, comfortField, comfort);
  if (comfortField && out[comfortField.slug] === undefined) setValue(out, comfortField, p.comfort ?? null);
  setValue(out, findField(f, ["stare"]), p.finish_state ?? p.condition ?? null);

  // Dotări: fiecare câmp checkbox primește opțiunile cu etichetă identică (normalizată).
  const labels = new Set(featureLabels(p).map(normalizeZt));
  for (const field of f.filter((x) => x.type === "checkbox")) {
    const picked = field.options.filter((o) => labels.has(normalizeZt(o.label)) || labels.has(normalizeZt(o.value))).map((o) => o.value);
    if (picked.length) out[field.slug] = picked;
  }
  return out;
}

// ---------------------------------------------------------------- corp complet

export function mapPropertyToZonata(
  p: Row,
  ctx: { nomenclature: ZonataSubcategory[]; images: ZonataImage[] },
): ZonataMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const txs = zonataTransactions(p);
  if (txs.length === 0) reasons.push("Proprietatea nu are tranzacție (vânzare sau închiriere).");

  const title = zonataTitle(p);
  if (title.length < ZONATA_TITLE_MIN) reasons.push(`Titlul are sub ${ZONATA_TITLE_MIN} caractere, chiar și completat din tip, camere și zonă.`);
  const description = zonataDescription(p);
  if (description.length < ZONATA_DESCRIPTION_MIN) reasons.push(`Descrierea trebuie să aibă cel puțin ${ZONATA_DESCRIPTION_MIN} de caractere (text simplu).`);
  const address = zonataAddress(p);
  if (!stripAdminPrefix((p.city ?? "").trim()) && !address) reasons.push("Lipsește adresa: completează cel puțin localitatea.");
  else if (!address) reasons.push("Lipsește adresa.");
  const { urls, skipped } = zonataImages(ctx.images);
  if (urls.length === 0) reasons.push("ZonaTa cere cel puțin o poză JPEG, PNG sau WebP inclusă la publicare.");
  if (skipped > 0) warnings.push(`${skipped} poze nu sunt JPEG/PNG/WebP și nu se trimit.`);
  if (ctx.images.length - skipped > ZONATA_IMAGES_MAX) warnings.push(`ZonaTa acceptă maximum ${ZONATA_IMAGES_MAX} poze; se trimit primele ${ZONATA_IMAGES_MAX}.`);
  if (ctx.nomenclature.length === 0) reasons.push("Nomenclatorul ZonaTa nu a fost sincronizat încă (SuperAdmin → Portaluri → ZonaTa).");

  const coords = publicCoords({ id: p.id, lat: p.lat ?? null, lng: p.lng ?? null, location_precise: p.location_precise });
  const bodies: ZonataListingBody[] = [];
  for (const tx of txs) {
    const label = TX_LABEL[tx];
    const sub = ctx.nomenclature.length ? zonataSubcategoryFor(p.property_type, tx, ctx.nomenclature) : null;
    if (ctx.nomenclature.length && !sub) {
      reasons.push(`Tipul „${TYPE_LABEL[(p.property_type ?? "").toLowerCase()] ?? (p.property_type || "necunoscut")}” la ${label} nu are categorie ZonaTa.`);
    }
    const raw = tx === "sale" ? (p.sale_price ?? p.price) : (p.rent_price ?? p.price);
    const currency = String((tx === "sale" ? p.sale_currency : p.rent_currency) ?? p.currency ?? "EUR").toUpperCase();
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) reasons.push(`Lipsește prețul de ${label}.`);
    else if (currency !== "EUR" && currency !== "RON") reasons.push(`ZonaTa acceptă doar EUR sau RON (prețul de ${label} este în ${currency}).`);
    if (!sub) continue;
    const fields = zonataFields(p, sub);
    for (const req of sub.fields.filter((x) => x.required && fields[x.slug] === undefined)) {
      reasons.push(`Câmpul obligatoriu ZonaTa „${req.label}” (${sub.subcategory_label ?? sub.subcategory_slug}) lipsește sau nu are o valoare acceptată.`);
    }
    bodies.push({
      external_id: zonataExternalId(p, tx),
      title,
      description,
      category: sub.category_slug,
      subcategory: sub.subcategory_slug,
      price_type: "fixed",
      price: typeof raw === "number" ? raw : 0,
      currency: currency === "RON" ? "RON" : "EUR",
      address,
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      fields,
      images: urls,
    });
  }
  const unique = [...new Set(reasons)];
  return unique.length ? { ok: false, reasons: unique, warnings } : { ok: true, bodies, warnings };
}
