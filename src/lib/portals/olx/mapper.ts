/**
 * Mapper Habitoo → OLX.ro `POST /adverts` (Partner API 2.0). Pur, fără rețea.
 * Orice câmp lipsă sau invalid blochează trimiterea, cu motiv clar în română.
 */
import { olxCategoryId, type OlxCategory, type OlxTaxonomy, type OlxTransaction } from "./taxonomy";

export type OlxProperty = {
  reference: string | null;
  propertyType: string | null;
  title: string | null;
  description: string | null;
  forSale: boolean;
  forRent: boolean;
  salePrice: number | null;
  saleCurrency: string | null;
  rentPrice: number | null;
  rentCurrency: string | null;
  price: number | null;
  currency: string | null;
  negotiable: boolean | null;
  rooms: number | null;
  usableSurface: number | null;
  landSurface: number | null;
  lat: number | null;
  lng: number | null;
  photoUrls: string[];
  agentName: string | null;
  agentPhone: string | null;
};

export type OlxLocation = { city_id: number; district_id?: number | null };

export type OlxAdvertPayload = {
  title: string;
  description: string;
  category_id: number;
  advertiser_type: "business";
  external_id: string;
  contact: { name: string; phone: string };
  location: OlxLocation;
  images: { url: string }[];
  price: { value: number; currency: string; negotiable: boolean };
  attributes: ({ code: string; value: string } | { code: string; values: string[] })[];
};

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:ro|com|net|org|eu|info)\b(?:\/\S*)?/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

/** Text simplu: fără HTML, fără linkuri/email/telefon, fără 3 semne de punctuație la rând. */
export function olxPlainText(raw: string): string {
  return raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(EMAIL_RE, "")
    .replace(URL_RE, "")
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 9 ? "" : m))
    .replace(/([!?.,;:*\-_=~#])\1{2,}/g, "$1")
    .replace(/([!?.,;:*\-_=~#]\s*){3,}/g, (m) => m.trim()[0] ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function upperRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  return letters.filter((l) => l === l.toUpperCase() && l !== l.toLowerCase()).length / letters.length;
}

export function validateOlxText(field: "titlul" | "descrierea", text: string, min: number, max: number): string | null {
  if (text.length < min) return `${field} are ${text.length} caractere; OLX cere minimum ${min}`;
  if (text.length > max) return `${field} are ${text.length} caractere; OLX acceptă maximum ${max}`;
  if (upperRatio(text) > 0.5) return `${field} are prea multe majuscule (OLX acceptă maximum 50%)`;
  return null;
}

function roomsCode(rooms: number | null): string | null {
  if (!rooms || rooms < 1) return null;
  return (["one", "two", "three", "four"] as const)[Math.min(4, Math.floor(rooms)) - 1]!;
}

/** Valoarea Habitoo pentru un atribut OLX cunoscut; null dacă nu o avem. */
function attributeValue(code: string, p: OlxProperty, cat: OlxCategory): string | null {
  if (code === "rooms") return roomsCode(p.rooms);
  if (code === "m") {
    const v = cat.id === 709 ? (p.landSurface ?? p.usableSurface) : (p.usableSurface ?? p.landSurface);
    return v && v > 0 ? String(Math.round(v)) : null;
  }
  if (code === "suprafata_teren" || code === "landarea") return p.landSurface && p.landSurface > 0 ? String(Math.round(p.landSurface)) : null;
  if (code === "usablearea" || code === "area") return p.usableSurface && p.usableSurface > 0 ? String(Math.round(p.usableSurface)) : null;
  if (code === "alege") return p.forSale ? "vanzare" : "inchiriere";
  return null;
}

export function olxTransaction(p: OlxProperty): OlxTransaction | null {
  if (p.forSale) return "sale";
  if (p.forRent) return "rent";
  return null;
}

export type OlxMapResult =
  | { ok: true; payload: OlxAdvertPayload; category: OlxCategory }
  | { ok: false; reasons: string[] };

export function mapPropertyToOlx(
  p: OlxProperty,
  taxonomy: OlxTaxonomy,
  location: OlxLocation | null,
): OlxMapResult {
  const reasons: string[] = [];
  const transaction = olxTransaction(p);
  if (!transaction) reasons.push("oferta nu este nici de vânzare, nici de închiriat");
  const categoryId = transaction ? olxCategoryId(p.propertyType, transaction, p.rooms) : null;
  const category = categoryId ? taxonomy[String(categoryId)] : undefined;
  if (transaction && !categoryId) {
    reasons.push(`tipul de proprietate „${p.propertyType ?? "necunoscut"}” nu are categorie OLX${p.rooms ? "" : " (lipsește numărul de camere)"}`);
  } else if (categoryId && (!category || !category.is_leaf)) {
    reasons.push("categoria OLX nu este în taxonomia salvată; reîmprospătează taxonomia OLX");
  }

  const title = olxPlainText(p.title ?? "");
  const description = olxPlainText(p.description ?? "");
  const t = validateOlxText("titlul", title, 16, 150);
  if (t) reasons.push(t);
  const d = validateOlxText("descrierea", description, 80, 9000);
  if (d) reasons.push(d);

  const external = p.reference?.trim();
  if (!external) reasons.push("lipsește referința HB a ofertei");
  const name = p.agentName?.trim();
  const phone = p.agentPhone?.replace(/[^\d+]/g, "");
  if (!name) reasons.push("agentul responsabil nu are nume");
  if (!phone || phone.replace(/\D/g, "").length < 9) reasons.push("agentul responsabil nu are telefon valid");
  if (!location) reasons.push("localitatea nu a putut fi găsită pe OLX (verifică coordonatele sau localitatea)");

  const value = transaction === "rent" ? (p.rentPrice ?? p.price) : (p.salePrice ?? p.price);
  const currency = ((transaction === "rent" ? p.rentCurrency : p.saleCurrency) ?? p.currency ?? "").toUpperCase();
  if (!value || value <= 0) reasons.push("lipsește prețul");
  if (!["EUR", "RON"].includes(currency)) reasons.push("moneda prețului trebuie să fie EUR sau RON");

  const limit = category?.photos_limit ?? 8;
  const images = p.photoUrls.filter((u) => /^https:\/\//.test(u)).slice(0, limit).map((url) => ({ url }));
  if (images.length === 0) reasons.push("oferta nu are nicio fotografie publică");

  const attributes: OlxAdvertPayload["attributes"] = [];
  for (const attr of category?.attributes ?? []) {
    const v = attributeValue(attr.code, p, category!);
    if (v === null) {
      if (attr.required) reasons.push(`lipsește câmpul obligatoriu OLX „${attr.label}”`);
      continue;
    }
    if (!attr.numeric && attr.values.length && !attr.values.includes(v)) {
      if (attr.required) reasons.push(`valoarea pentru „${attr.label}” nu este acceptată de OLX`);
      continue;
    }
    attributes.push(attr.multiple ? { code: attr.code, values: [v] } : { code: attr.code, value: v });
  }

  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    category: category!,
    payload: {
      title,
      description,
      category_id: categoryId!,
      advertiser_type: "business",
      external_id: external!,
      contact: { name: name!, phone: phone! },
      location: location!,
      images,
      price: { value: value!, currency, negotiable: p.negotiable === true },
      attributes,
    },
  };
}
