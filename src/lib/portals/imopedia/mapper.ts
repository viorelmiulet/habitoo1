/**
 * Imopedia.ro: mapper pur Habitoo → `SavePropertyType` (WSDL). Fără rețea, fără DB.
 * Publicarea, AGENT_ID, ID_LOCAL și media vin în etapele următoare.
 */
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { publicCoords } from "@/lib/geo";
import { htmlToText, imo24Floor, imo24Title, normalizeLabel } from "@/lib/portals/imo24/mapper";
import type { SoapField, SoapScalarType } from "./soap";
import type { ImopediaLocationResult } from "./location";
import dotari from "./nomenclatures/dotari.json";
import finisaje from "./nomenclatures/finisaje.json";
import detalii from "./nomenclatures/detalii.json";
import vecinatati from "./nomenclatures/vecinatati.json";

type Row = Partial<PropertyRow> & { id: string };

const INT = [
  "AGENTIA", "AGENT_ID", "ANSAMBLU_ID", "A_IMPARTIRE", "COLLAB_AGENT_ACTIVE", "C_DEMISOL", "C_MANSARDA",
  "C_PIVNITA", "C_SUBSOL", "ETAJ", "EXCLUSIVITATE", "GEO_ACCURACY", "GEO_ZOOM", "GOLD", "ID_LOCAL", "IMOPEDIA",
  "MOBILAT", "NRCAM", "NRDORMITOARE", "NRETAJE", "NR_BAI", "NR_BALCOANE", "NR_GR_SANITARE", "NR_TERASE",
  "PARCARE_NR_LOCURI", "PLATA_TVA", "REGION_ID", "SITE", "SITE_ORD", "SPECIAL_SUBTYPE", "STARE_IMOBIL",
  "TIP_IMOBIL_REAL", "T_D_APA", "T_D_CANALIZARE", "T_D_CURENT", "T_D_GAZE", "T_EXTRAVILAN", "T_H_TRANZ",
  "T_INTRAVILAN", "T_I_TRANZ", "T_V_TRANZ", "ZONA_ID",
] as const;
const FLOAT = [
  "DESCHIDERE", "ROOM_HEIGHT", "SUPR_CONSTR", "SUPR_TEREN", "SUPR_TEREN_LIBER", "SUPR_UTILA", "T_CUT", "T_H_PRET",
  "T_H_PRETMP", "T_H_PRET_DISCOUNT", "T_I_PRET", "T_I_PRETMP", "T_I_PRET_DISCOUNT", "T_POT", "T_RI", "T_RI_HEIGHT",
  "T_V_PRET", "T_V_PRETMP", "VITRINA_HEIGHT", "VITRINA_WIDTH",
] as const;
const STRING = [
  "TITLU", "OBSERVATII", "COMISION", "COMISION_I", "COMISION_TEXT", "GEO_LAT", "GEO_LONG", "AN_CONSTRUCTIE", "ZONA",
  "ADDRESS", "DOTARI", "FINISAJE", "DETALII", "VECINATATI", "AMPLASAMENT", "T_V_MONEDA", "T_I_MONEDA", "T_H_MONEDA",
  "COLLAB_COMMISSION_SHARE", "COLLAB_DETAILS", "DATA_APARITIE", "DATA_MODIFICARE",
] as const;

/** Tipurile exacte din `SavePropertyType`; un câmp absent de aici nu se trimite niciodată. */
export const IMOPEDIA_FIELD_TYPES: Readonly<Record<string, SoapScalarType>> = Object.freeze({
  ...Object.fromEntries(INT.map((n) => [n, "xsd:int" as const])),
  ...Object.fromEntries(FLOAT.map((n) => [n, "xsd:float" as const])),
  ...Object.fromEntries(STRING.map((n) => [n, "xsd:string" as const])),
});

/** Câmpuri legacy/deprecated: nu se trimit niciodată. */
export const IMOPEDIA_FORBIDDEN_FIELDS = ["ORAS", "JUDET", "SITE", "SITE_ORD", "COMMENT28", "MLS_UNIQUE_ID"] as const;

export type ImopediaMapContext = {
  agencyId: number;
  location: ImopediaLocationResult;
  collaboration: { active: boolean; commissionPercent: number | null };
  /** Bifa „Promovat” → GOLD=1; altfel GOLD=0, trimis explicit la fiecare salvare. */
  gold?: boolean;
  currentYear?: number;
};

export type ImopediaMapResult =
  | { ok: true; fields: SoapField[]; warnings: string[] }
  /** `fields` = ce s-ar trimite, doar pentru previzualizare; oferta nu se publică. */
  | { ok: false; reasons: string[]; warnings: string[]; fields: SoapField[] };

export const IMOPEDIA_PROPERTY_TYPE: Record<string, number> = {
  apartment: 1, studio: 1, office: 2, house: 3, villa: 4, commercial: 5, industrial: 6, land: 7,
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const posInt = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? Math.round(n) : null;
};
const posNum = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};

// ---------------------------------------------------------------- comision

/** „2”, „2%”, „2,5 %” → "2.5"; altfel null. */
export function imopediaCommissionPercent(value: string | null | undefined): string | null {
  const m = /^\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%?\s*$/.exec(value ?? "");
  if (!m) return null;
  return String(Number(m[1].replace(",", ".")));
}

// ---------------------------------------------------------------- text curat

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;]*[^\s,;.!?]|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ro|com|net|org|eu|info|biz|io)(?:\/[^\s,;]*[^\s,;.!?])?/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?40|\b0)[\s.\-/()]*7(?:[\s.\-/()]*\d){8}\b|(?:\+?40|\b0)[\s.\-/()]*[23](?:[\s.\-/()]*\d){8}\b/g;
const SOCIAL_RE = /(?:\b(?:facebook|fb|instagram|insta|tiktok|whatsapp|telegram|youtube|linkedin)\b\s*[:\-]?\s*)?@[a-z0-9._]{2,}|\b(?:facebook|instagram|tiktok|whatsapp|telegram)\s*[:\-]\s*\S+/gi;
const CONTACT_WORD = /\b(suna|sunati|apel|apelati|contact|contactati|tel|telefon|mobil|email|e mail|mail|scrieti|whatsapp|detalii la|informatii la|vizionari la|site|pagina|urmariti|facebook|instagram)\b/;

const containsContact = (text: string) =>
  new RegExp(URL_RE.source, "i").test(text) || new RegExp(EMAIL_RE.source, "i").test(text) || new RegExp(PHONE_RE.source).test(text);

/** Elimină telefoane, emailuri, URL-uri și conturi sociale fără placeholdere; frazele rămase fără sens dispar. */
export function cleanImopediaText(input: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const MARK = "\u0001";
  // Întâi pe tot textul (emailurile și URL-urile conțin puncte), apoi pe fraze.
  let marked = input;
  for (const [label, re] of [["email", EMAIL_RE], ["URL", URL_RE], ["telefon", PHONE_RE], ["cont social media", SOCIAL_RE]] as const) {
    marked = marked.replace(new RegExp(re.source, re.flags), () => {
      if (!removed.includes(label)) removed.push(label);
      return MARK;
    });
  }
  const paragraphs = marked.split(/\n/).map((para) => {
    const sentences = para.match(/[^.!?]+[.!?]*\s*/g) ?? [para];
    return sentences
      .map((s) => {
        if (!s.includes(MARK)) return s;
        const out = s
          .split(MARK).join(" ")
          .replace(/\s+([.,;:!?])/g, "$1")
          .replace(/([,;:])(?=[,;:.!?]|\s*$)/g, "")
          .replace(/\b(pe|la|sau|si|și|ori)\s*([,.;:!?]|$)/gi, "$2")
          .replace(/[ \t]{2,}/g, " ")
          .replace(/\s+([.,;:!?])/g, "$1")
          .trim();
        const norm = normalizeLabel(out);
        const words = norm ? norm.split(" ").length : 0;
        // Fraza de contact (sau un rest de sub 4 cuvinte) nu mai are sens fără date.
        if (words < 4 || CONTACT_WORD.test(norm)) return "";
        return out + " ";
      })
      .join("")
      .trim();
  });
  return { text: paragraphs.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}

// ---------------------------------------------------------------- nomenclatoare

type ListName = "DOTARI" | "FINISAJE" | "DETALII" | "VECINATATI";

function buildNomenclature(): Record<ListName, Map<number, Map<string, string>>> {
  const add = (target: Map<number, Map<string, string>>, type: number, value: string) => {
    const key = normalizeLabel(value);
    if (!key) return;
    if (!target.has(type)) target.set(type, new Map());
    if (!target.get(type)!.has(key)) target.get(type)!.set(key, value);
  };
  const d = new Map(), f = new Map(), x = new Map(), v = new Map();
  for (const i of (dotari as any).items) add(d, i.property_type, i.value);
  for (const [t, list] of Object.entries((finisaje as any).by_property_type as Record<string, string[]>)) for (const s of list) add(f, Number(t), s);
  for (const i of (detalii as any).items) add(x, i.property_type, i.value);
  for (const i of (vecinatati as any).items) for (const t of i.property_types) add(v, t, i.name);
  return { DOTARI: d, FINISAJE: f, DETALII: x, VECINATATI: v };
}
let NOMENCLATURE: ReturnType<typeof buildNomenclature> | null = null;

function habitooFeatureLabels(p: Row): string[] {
  const lists: (string[] | null | undefined)[] = [
    p.features, p.building_amenities, p.additional_spaces, p.misc_features, p.utilities,
    p.cooling_systems, p.heating_systems, p.appliances, p.kitchen_features, p.metering,
    p.windows, p.insulation, p.floor_finishes, p.wall_finishes, p.views, p.street_arrangement,
  ];
  const out: string[] = [];
  for (const list of lists) for (const item of list ?? []) if (item) out.push(String(item));
  if (p.heating) out.push(p.heating);
  if (p.parking) out.push(p.parking);
  return out;
}

/** Valorile Habitoo cu potrivire exactă pe eticheta normalizată, în lista tipului; null = tip fără listă. */
export function imopediaListValue(list: ListName, typeId: number, labels: string[]): string | null {
  NOMENCLATURE ??= buildNomenclature();
  const dict = NOMENCLATURE[list].get(typeId);
  if (!dict) return null;
  const out: string[] = [];
  for (const l of labels) {
    const hit = dict.get(normalizeLabel(l));
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out.length ? out.join("; ") : null;
}

// ---------------------------------------------------------------- enumerări

const LAYOUT: Record<string, number> = { decomandat: 1, semidecomandat: 2, nedecomandat: 3, comandat: 3 };
const FURNISHING: Record<string, number> = {
  complet: 1, mobilat: 1, "complet mobilat": 1, partial: 2, semimobilat: 2, "semi mobilat": 2, nemobilat: 3,
};
const PLACEMENT: Record<string, string> = { bloc: "1", vila: "2", casa: "2", "centru de afaceri": "3" };

const isoDate = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

// ---------------------------------------------------------------- mapare

export function mapPropertyToImopedia(p: Row, ctx: ImopediaMapContext): ImopediaMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const values = new Map<string, string | number>();
  const put = (name: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    values.set(name, value);
  };
  const year = ctx.currentYear ?? new Date().getFullYear();

  put("AGENTIA", ctx.agencyId);
  put("IMOPEDIA", 1);
  put("GOLD", ctx.gold === true ? 1 : 0);

  const typeKey = (p.property_type ?? "").trim().toLowerCase();
  const typeId = IMOPEDIA_PROPERTY_TYPE[typeKey] ?? null;
  if (typeId === null) reasons.push(`Tipul de proprietate „${p.property_type ?? "necompletat"}” nu are corespondent la Imopedia.`);
  put("TIP_IMOBIL_REAL", typeId);

  // Tranzacții: o singură ofertă, ambele tranzacții când sunt bifate.
  const sale = !!(p.for_sale || p.transaction_kind === "sale");
  const rent = !!(p.for_rent || p.transaction_kind === "rent");
  if (!sale && !rent) reasons.push("Bifează vânzare sau închiriere.");
  const tx = (active: boolean, prefix: "T_V" | "T_I", raw: unknown, cur: string | null | undefined, label: string) => {
    put(`${prefix}_TRANZ`, active ? 1 : 0);
    if (!active) return;
    const price = posNum(raw);
    if (price === null) reasons.push(`Lipsește prețul de ${label}.`);
    const currency = (cur ?? p.currency ?? "EUR").toUpperCase();
    if (!["EUR", "USD", "RON"].includes(currency)) reasons.push(`Imopedia acceptă doar EUR, USD sau RON; prețul de ${label} este în ${currency}.`);
    put(`${prefix}_PRET`, price);
    put(`${prefix}_MONEDA`, currency);
  };
  tx(sale, "T_V", p.sale_price ?? p.price, p.sale_currency, "vânzare");
  tx(rent, "T_I", p.rent_price ?? p.price, p.rent_currency, "închiriere");

  // Comision (obligatoriu).
  const commission = (p.commission ?? "").trim();
  if (!commission) {
    reasons.push("Completează comisionul: Imopedia cere procentul sau o descriere a comisionului.");
  } else {
    const pct = imopediaCommissionPercent(commission);
    if (pct !== null) {
      if (sale) put("COMISION", pct);
      if (rent) put("COMISION_I", pct);
    } else put("COMISION_TEXT", commission);
  }

  // Localizare.
  if (ctx.location.status === "missing" || ctx.location.regionId === null) reasons.push(ctx.location.reason);
  else {
    put("REGION_ID", ctx.location.regionId);
    if (ctx.location.status === "exact") put("ZONA_ID", ctx.location.zonaId);
    else warnings.push(`Zona Imopedia nu a fost găsită exact (${ctx.location.reason}); se trimite doar regiunea și zona ca text.`);
  }
  put("ZONA", ctx.location.zonaText);

  const coords = publicCoords({ id: p.id, lat: p.lat ?? null, lng: p.lng ?? null, location_precise: p.location_precise });
  if (coords) {
    put("GEO_LAT", String(coords.lat));
    put("GEO_LONG", String(coords.lng));
    put("GEO_ACCURACY", p.location_precise ? 1 : 0);
  } else warnings.push("Proprietatea nu are coordonate; harta Imopedia nu va avea pin.");
  if (p.location_precise === true) {
    put("ADDRESS", [p.street, p.street_number].filter(Boolean).join(" ").trim() || p.address || null);
  }

  // Text.
  const rawTitle = htmlToText(p.title).replace(/\s+/g, " ").trim();
  if (!rawTitle || containsContact(rawTitle)) {
    if (rawTitle) warnings.push("Titlul conținea date de contact și a fost regenerat.");
    put("TITLU", imo24Title({ ...p, title: "" } as never));
  } else put("TITLU", rawTitle);
  const cleaned = cleanImopediaText(htmlToText(p.description));
  for (const r of cleaned.removed) warnings.push(`Din descriere a fost eliminat: ${r}.`);
  if (!cleaned.text) reasons.push("Descrierea este goală (după eliminarea datelor de contact).");
  put("OBSERVATII", cleaned.text);

  // Suprafețe.
  put("SUPR_UTILA", posNum(p.usable_surface ?? p.surface));
  put("SUPR_CONSTR", posNum(p.built_surface));
  if (typeKey === "land") put("SUPR_TEREN", posNum(p.land_surface ?? p.surface));
  if (typeKey === "house" || typeKey === "villa") put("SUPR_TEREN_LIBER", posNum(p.land_surface));

  // Clădire și compartimentare.
  put("NRCAM", typeKey === "studio" ? 1 : posInt(p.rooms));
  put("NRDORMITOARE", posInt(p.bedrooms));
  put("NR_BAI", posInt(p.bathrooms));
  put("NR_BALCOANE", posInt(p.balconies));
  put("PARCARE_NR_LOCURI", posInt(p.parking_spaces));
  if (typeKey !== "land") put("ETAJ", imo24Floor(p as never));
  // `building_floors` („Etaje”) = etaje deasupra parterului (P+N; S/D/P/M sunt bifate separat).
  put("NRETAJE", posInt(p.building_floors));
  const by = num(p.build_year);
  if (by !== null && by >= 1800 && by <= year + 3) put("AN_CONSTRUCTIE", String(Math.round(by)));

  put("A_IMPARTIRE", LAYOUT[normalizeLabel(p.layout)] ?? null);
  put("MOBILAT", FURNISHING[normalizeLabel(p.furnishing)] ?? null);
  put("AMPLASAMENT", PLACEMENT[normalizeLabel(p.building_type)] ?? null);
  if (p.is_exclusive === true) put("EXCLUSIVITATE", 1);

  // Nomenclatoare.
  if (typeId !== null) {
    const labels = habitooFeatureLabels(p);
    for (const list of ["DOTARI", "FINISAJE", "DETALII", "VECINATATI"] as const) put(list, imopediaListValue(list, typeId, labels));
  }

  // Colaborare.
  if (ctx.collaboration.active) {
    put("COLLAB_AGENT_ACTIVE", 1);
    const pct = ctx.collaboration.commissionPercent;
    if (pct !== null && pct > 0) {
      const text = `${String(Number(pct.toFixed(2)))}%`;
      put("COLLAB_COMMISSION_SHARE", text);
      put("COLLAB_DETAILS", `Se oferă agentului colaborator ${text} din comisionul încasat de agenția ofertantă.`);
    }
  } else put("COLLAB_AGENT_ACTIVE", 0);

  put("DATA_APARITIE", isoDate(p.created_at));
  put("DATA_MODIFICARE", isoDate(p.updated_at));

  const fields: SoapField[] = [];
  for (const [name, value] of values) {
    const type = IMOPEDIA_FIELD_TYPES[name];
    if (!type || (IMOPEDIA_FORBIDDEN_FIELDS as readonly string[]).includes(name)) continue;
    fields.push({ name, type, value });
  }
  if (reasons.length) return { ok: false, reasons, warnings, fields };
  return { ok: true, fields, warnings };
}
