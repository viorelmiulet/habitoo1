/**
 * Vumsi (pur, fără apeluri): corespondențe sugerate, mapper proprietate → `POST /listings/`,
 * payloadurile `POST /users/` și `POST /companies/`. Categoriile, atributele și valorile `type`
 * vin exclusiv din snapshotul nomenclatoarelor; niciun ID Vumsi nu este scris în cod.
 */
import { publicCoords } from "@/lib/geo";
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { cutAtWord, htmlToText, imo24Transactions } from "@/lib/portals/imo24/mapper";
import { fold, type VumsiAttribute, type VumsiCategory } from "./nomenclature";

export const VUMSI_TITLE_MAX = 255;
export const VUMSI_COMPANY_NAME_MAX = 64;
export const VUMSI_SETUP_MESSAGE = "Sincronizează nomenclatoarele Vumsi și setează corespondențele.";

export type VumsiTransaction = "sale" | "rent";
export const VUMSI_TRANSACTIONS: VumsiTransaction[] = ["sale", "rent"];
export const VUMSI_TX_LABEL: Record<VumsiTransaction, string> = { sale: "vânzare", rent: "închiriere" };

/** Tipurile Habitoo pentru care SuperAdminul setează corespondența. */
export const VUMSI_HABITOO_KINDS = [
  { kind: "apartment", label: "Apartament", words: ["apartament"] },
  { kind: "studio", label: "Garsonieră", words: ["garsonier"] },
  { kind: "house", label: "Casă / vilă", words: ["case", "casa", "vil"] },
  { kind: "land", label: "Teren", words: ["teren"] },
  { kind: "commercial", label: "Spațiu comercial", words: ["comercial"] },
  { kind: "office", label: "Birouri", words: ["birou"] },
  { kind: "industrial", label: "Spațiu industrial", words: ["industrial", "hala", "depozit"] },
] as const;
export type VumsiHabitooKind = (typeof VUMSI_HABITOO_KINDS)[number]["kind"];

export function vumsiKindOf(propertyType: string | null | undefined): VumsiHabitooKind | null {
  const t = (propertyType ?? "").trim().toLowerCase();
  if (t === "villa") return "house";
  return (VUMSI_HABITOO_KINDS.find((k) => k.kind === t)?.kind as VumsiHabitooKind | undefined) ?? null;
}

const TX_WORDS: Record<VumsiTransaction, RegExp> = { sale: /vanzar|vand/, rent: /inchiri/ };

/** Sugestie după nume: categoria frunză care conține cuvântul tipului (preferată cea cu tranzacția în nume). */
export function suggestVumsiCategory(kind: VumsiHabitooKind, tx: VumsiTransaction, categories: VumsiCategory[]): VumsiCategory | null {
  const words = VUMSI_HABITOO_KINDS.find((k) => k.kind === kind)!.words;
  const scored = categories
    .map((c) => {
      const name = fold(c.name);
      const hit = words.some((w) => name.includes(w));
      if (!hit) return null;
      const other = tx === "sale" ? TX_WORDS.rent : TX_WORDS.sale;
      const score = (TX_WORDS[tx].test(name) ? 2 : 0) - (other.test(name) ? 3 : 0);
      return { c, score };
    })
    .filter((x): x is { c: VumsiCategory; score: number } => !!x)
    .sort((a, b) => b.score - a.score || a.c.id - b.c.id);
  return scored[0]?.c ?? null;
}

export type VumsiListingType = { value: number; code: string | null; label: string | null };

/** `listing_types` din `/reference/` (snapshot). */
export function vumsiListingTypes(reference: unknown): VumsiListingType[] {
  const r = reference && typeof reference === "object" ? (reference as Record<string, unknown>) : {};
  const list = Array.isArray(r["listing_types"]) ? (r["listing_types"] as unknown[]) : [];
  return list.flatMap((x) => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
    const value = Number(o?.["value"]);
    if (!o || !Number.isInteger(value)) return [];
    return [{ value, code: typeof o["code"] === "string" ? o["code"] : null, label: typeof o["label"] === "string" ? o["label"] : null }];
  });
}

export function suggestVumsiType(tx: VumsiTransaction, types: VumsiListingType[]): VumsiListingType | null {
  const want = tx === "sale" ? { code: /^(sell|sale)$/, label: /vanzar/ } : { code: /^rent$/, label: /inchiri/ };
  return types.find((t) => want.code.test((t.code ?? "").toLowerCase())) ?? types.find((t) => want.label.test(fold(t.label ?? ""))) ?? null;
}

// ------------------------------------------------------------------ atribute

type Row = Partial<PropertyRow> & Pick<PropertyRow, "id">;
type Raw = string | number | boolean | null;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const TYPE_TEXT: Record<string, string> = { apartment: "Apartament", studio: "Garsonieră", house: "Casă", villa: "Vilă", land: "Teren", office: "Birou", commercial: "Spațiu comercial", industrial: "Spațiu industrial" };

function floorText(p: Row): Raw {
  const n = num(p.floor);
  if (n !== null) return n === 0 ? "parter" : n < 0 ? "demisol" : n > 10 ? "10+" : n;
  return p.floor_label ?? null;
}

function furnishingText(v: string | null | undefined): Raw {
  const t = fold(v ?? "");
  if (!t) return null;
  if (t.includes("nemobilat") || t === "nu") return "nu";
  if (t.includes("parti")) return "partial";
  if (t.includes("complet") || t.includes("mobilat") || t === "da") return "da";
  return v ?? null;
}

/** Câmpurile Habitoo cunoscute, recunoscute după cheia sau numele atributului Vumsi. */
const KNOWN: Array<{ keys: RegExp; value: (p: Row) => Raw }> = [
  { keys: /^(property_type|tip proprietate)$/, value: (p) => TYPE_TEXT[(p.property_type ?? "").toLowerCase()] ?? null },
  { keys: /^(rooms|room_count|nr_rooms|camere|numar camere|nr\. camere)$/, value: (p) => num(p.rooms) },
  { keys: /^(bedrooms|dormitoare|numar dormitoare)$/, value: (p) => num(p.bedrooms) },
  { keys: /^(bathrooms|bai|numar bai)$/, value: (p) => num(p.bathrooms) },
  { keys: /^(usable_area|usable_surface|suprafata utila.*)$/, value: (p) => num(p.usable_surface) ?? num(p.surface) },
  { keys: /^(built_area|built_surface|suprafata construita.*)$/, value: (p) => num(p.built_surface) },
  { keys: /^(land_area|land_surface|total_area|suprafata teren.*|suprafata totala.*)$/, value: (p) => num(p.land_surface) ?? ((p.property_type ?? "") === "land" ? num(p.surface) : null) },
  { keys: /^(floor|etaj)$/, value: floorText },
  { keys: /^(construction_year|year_built|build_year|an constructie|anul constructiei)$/, value: (p) => num(p.build_year) },
  { keys: /^(partitioning|layout|compartimentare)$/, value: (p) => p.layout ?? null },
  { keys: /^(furnished|furnishing|mobilat|mobilare)$/, value: (p) => furnishingText(p.furnishing) },
  { keys: /^(heating|incalzire)$/, value: (p) => p.heating ?? p.heating_systems?.[0] ?? null },
  { keys: /^(parking|parcare)$/, value: (p) => p.parking ?? (num(p.parking_spaces) ? true : null) },
];

function habitooValue(p: Row, f: VumsiAttribute): { known: boolean; value: Raw } {
  const names = [fold(f.name), fold(f.label ?? "").replace(/\s*\(.*\)$/, "")];
  const k = KNOWN.find((x) => names.some((n) => n && x.keys.test(n)));
  return k ? { known: true, value: k.value(p) } : { known: false, value: null };
}

/** Valoarea din lista permisă, potrivită după text fără diacritice (valoare sau etichetă). */
export function matchVumsiChoice(raw: Raw, choices: VumsiAttribute["choices"]): string | null {
  if (raw === null || raw === "" || typeof raw === "boolean") {
    if (raw === true) return choices.find((c) => /^(yes|da|true)$/.test(fold(c.value)) || fold(c.label) === "da")?.value ?? null;
    if (raw === false) return choices.find((c) => /^(no|nu|false)$/.test(fold(c.value)) || fold(c.label) === "nu")?.value ?? null;
    return null;
  }
  const t = fold(String(raw)).trim();
  const exact = choices.find((c) => fold(c.value) === t || fold(c.label) === t);
  if (exact) return exact.value;
  const part = choices.filter((c) => { const l = fold(c.label); return l.length > 1 && (t.includes(l) || l.includes(t)); });
  return part.length === 1 ? part[0]!.value : null;
}

function convert(f: VumsiAttribute, raw: Raw): string | number | boolean | null {
  if (raw === null || raw === "") return null;
  const type = fold(f.type ?? "");
  if (f.choices.length || type.includes("choice")) return matchVumsiChoice(raw, f.choices);
  if (type === "number" || type === "integer" || type === "int") { const n = Number(raw); return Number.isFinite(n) ? Math.round(n) : null; }
  if (type === "decimal" || type === "float") { const n = Number(raw); return Number.isFinite(n) ? n : null; }
  if (type === "boolean" || type === "bool") return raw === true || /^(da|yes|true|1)$/.test(fold(String(raw)));
  return String(raw);
}

export function buildVumsiAttrs(p: Row, fields: VumsiAttribute[], categoryName: string) {
  const attrs: Record<string, string | number | boolean> = {};
  const reasons: string[] = [];
  const warnings: string[] = [];
  for (const f of fields) {
    const { known, value } = habitooValue(p, f);
    const v = known ? convert(f, value) : null;
    if (v !== null) { attrs[f.name] = v; continue; }
    const label = f.label ?? f.name;
    if (f.required) {
      reasons.push(known && value !== null
        ? `Valoarea „${String(value)}” pentru „${label}” nu este acceptată de Vumsi la ${categoryName}; alege una dintre: ${f.choices.map((c) => c.label).join(", ")}.`
        : `Completează „${label}”: Vumsi cere câmpul la ${categoryName}.`);
    } else if (known && value !== null) {
      warnings.push(`„${label}”: valoarea „${String(value)}” nu are corespondent la Vumsi și se omite.`);
    }
  }
  return { attrs, reasons, warnings };
}

// ------------------------------------------------------------------ anunț

export type VumsiMappings = {
  categories: Array<{ habitoo_kind: string; transaction: VumsiTransaction; category_id: number; category_name?: string | null }>;
  types: Array<{ transaction: VumsiTransaction; type_value: number }>;
};

export type VumsiListingBody = {
  title: string;
  description: string;
  type: number;
  category: number;
  external_id: string;
  external_user_id: string | null;
  price: { amount: number; currency: "EUR" | "RON" };
  location: { city_id: number };
  attrs: Record<string, string | number | boolean>;
};

export type VumsiListingPlan = {
  transaction: VumsiTransaction;
  externalId: string;
  category: { id: number; name: string } | null;
  type: number | null;
  attrs: Record<string, string | number | boolean>;
  body: VumsiListingBody | null;
  reasons: string[];
};

export type VumsiMapContext = {
  attributes: Record<string, { fields: VumsiAttribute[] }>;
  mappings: VumsiMappings;
  cityId: number | null;
};

export function vumsiExternalId(propertyId: string, tx: VumsiTransaction): string {
  return `HBT-${propertyId}-${tx === "sale" ? "V" : "I"}`;
}

export function vumsiTitle(p: Row): string {
  const base = htmlToText(p.title).replace(/\s+/g, " ").trim();
  if (base) return cutAtWord(base, VUMSI_TITLE_MAX);
  const rooms = num(p.rooms);
  const parts = [TYPE_TEXT[(p.property_type ?? "").toLowerCase()] ?? "Proprietate", rooms && rooms > 1 && p.property_type !== "studio" ? `${rooms} camere` : "", (p.district ?? "").trim() || (p.city ?? "").trim()];
  return cutAtWord(parts.filter(Boolean).join(" "), VUMSI_TITLE_MAX);
}

function vumsiPrice(p: Row, tx: VumsiTransaction): { ok: true; price: VumsiListingBody["price"] } | { ok: false; reason: string } {
  const raw = tx === "sale" ? (p.sale_price ?? p.price) : (p.rent_price ?? p.price);
  const currency = ((tx === "sale" ? p.sale_currency : p.rent_currency) ?? p.currency ?? "EUR").toUpperCase();
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return { ok: false, reason: `Lipsește prețul de ${VUMSI_TX_LABEL[tx]}.` };
  if (currency !== "EUR" && currency !== "RON") return { ok: false, reason: `Vumsi primește prețul de ${VUMSI_TX_LABEL[tx]} în EUR sau RON; acum este în ${currency}.` };
  return { ok: true, price: { amount: Math.round(raw), currency } };
}

export function vumsiTransactions(p: Row): VumsiTransaction[] {
  return imo24Transactions(p).map((t) => (t === "vanzare" ? "sale" : "rent"));
}

/** Un plan (și, dacă nu e blocat, un corp `POST /listings/`) pentru fiecare tranzacție. */
export function mapPropertyToVumsi(p: Row, ctx: VumsiMapContext): { plans: VumsiListingPlan[]; reasons: string[]; warnings: string[] } {
  const common: string[] = [];
  const warnings: string[] = [];
  const txs = vumsiTransactions(p);
  if (!txs.length) common.push("Alege tranzacția (vânzare sau închiriere).");
  const kind = vumsiKindOf(p.property_type);
  if (!kind) common.push(`Tipul de proprietate „${p.property_type ?? "necompletat"}” nu are corespondent la Vumsi.`);
  const description = htmlToText(p.description).trim();
  if (!description) common.push("Completează descrierea proprietății.");
  if (ctx.cityId === null) common.push("Localitatea nu a putut fi găsită la Vumsi: verifică localitatea sau poziția pe hartă.");
  const title = vumsiTitle(p);

  const plans = txs.map((tx): VumsiListingPlan => {
    const reasons: string[] = [];
    const externalId = vumsiExternalId(p.id, tx);
    const map = kind ? ctx.mappings.categories.find((m) => m.habitoo_kind === kind && m.transaction === tx) : null;
    const type = ctx.mappings.types.find((t) => t.transaction === tx)?.type_value ?? null;
    if (kind && !map) reasons.push(`Lipsește corespondența categoriei Vumsi pentru ${VUMSI_HABITOO_KINDS.find((k) => k.kind === kind)!.label.toLowerCase()} la ${VUMSI_TX_LABEL[tx]}. ${VUMSI_SETUP_MESSAGE}`);
    if (type === null) reasons.push(`Lipsește tipul anunțului Vumsi pentru ${VUMSI_TX_LABEL[tx]}. ${VUMSI_SETUP_MESSAGE}`);
    const price = vumsiPrice(p, tx);
    if (!price.ok) reasons.push(price.reason);
    let attrs: VumsiListingPlan["attrs"] = {};
    const category = map ? { id: map.category_id, name: map.category_name ?? `#${map.category_id}` } : null;
    if (category) {
      const def = ctx.attributes[String(category.id)];
      if (!def) reasons.push(`Categoria Vumsi „${category.name}” nu mai este în snapshot. ${VUMSI_SETUP_MESSAGE}`);
      else {
        const a = buildVumsiAttrs(p, def.fields, category.name);
        attrs = a.attrs;
        reasons.push(...a.reasons);
        for (const w of a.warnings) if (!warnings.includes(w)) warnings.push(w);
      }
    }
    const all = [...common, ...reasons];
    const body: VumsiListingBody | null = all.length || !category || type === null || !price.ok || ctx.cityId === null
      ? null
      : { title, description, type, category: category.id, external_id: externalId, external_user_id: p.assigned_to ?? null, price: price.price, location: { city_id: ctx.cityId }, attrs };
    return { transaction: tx, externalId, category, type, attrs, body, reasons };
  });
  return { plans, reasons: [...common, ...plans.flatMap((x) => x.reasons)], warnings };
}

/** Coordonatele publice (sau `null`) pentru `/locations/cities/nearest/`. */
export function vumsiPublicCoords(p: Row): { lat: number; lng: number } | null {
  const c = publicCoords({ id: p.id, lat: p.lat ?? null, lng: p.lng ?? null, location_precise: p.location_precise });
  return c && !(Math.abs(c.lat) < 0.0001 && Math.abs(c.lng) < 0.0001) ? c : null;
}

export function vumsiLocalityKey(p: Row): string | null {
  const city = fold((p.city ?? "").trim());
  if (!city) return null;
  return `${fold((p.county ?? "").trim())}|${city}`;
}

/** Alege orașul din rezultatele `/locations/cities/?q=`: același nume, apoi același județ. */
export function pickVumsiCity(results: unknown, city: string, county: string | null): { id: number; name: string } | null {
  const list = (Array.isArray(results) ? results : []) as Array<Record<string, unknown>>;
  const c = fold(city).replace(/^(municipiul|orasul|comuna|sat)\s+/, "").trim();
  const same = list.filter((r) => fold(String(r["name"] ?? "")) === c && Number.isInteger(Number(r["id"])));
  const k = fold(county ?? "").replace(/^judetul\s+/, "").trim();
  const best = (k ? same.find((r) => fold(String(r["region"] ?? "")).includes(k)) : null) ?? (same.length === 1 ? same[0] : null);
  return best ? { id: Number(best["id"]), name: String(best["name"]) } : null;
}

// ------------------------------------------------------------------ agent și agenție

export type VumsiUserPayload = { email: string | null; first_name: string; last_name: string; phone: string | null; external_user_id: string; account_type: "business" };
export type VumsiCompanyPayload = { external_company_id: string; owner: { user_uuid: string | null; external_user_id: string | null }; name: string; company_number: string | null; city: string | null; country: "RO"; line1: string | null };

export function vumsiUserPayload(profile: { id: string; full_name: string | null; email: string | null; phone: string | null }): VumsiUserPayload {
  const parts = (profile.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    email: profile.email?.trim() || null,
    first_name: parts[0] ?? "",
    last_name: parts.slice(1).join(" "),
    phone: profile.phone?.trim() || null,
    external_user_id: profile.id,
    account_type: "business",
  };
}

export function vumsiCompanyPayload(
  org: { id: string; name: string | null; legal_name?: string | null; cui?: string | null; city?: string | null; registered_address?: string | null; material_address?: string | null },
  owner: { userUuid: string | null; externalUserId: string | null },
): VumsiCompanyPayload {
  return {
    external_company_id: org.id,
    owner: { user_uuid: owner.userUuid, external_user_id: owner.externalUserId },
    name: ((org.legal_name || org.name || "").trim()).slice(0, VUMSI_COMPANY_NAME_MAX),
    company_number: org.cui?.trim() || null,
    city: org.city?.trim() || null,
    country: "RO",
    line1: (org.registered_address || org.material_address || "").trim() || null,
  };
}

export function vumsiAccountReasons(user: VumsiUserPayload | null, company: VumsiCompanyPayload | null): string[] {
  const r: string[] = [];
  if (!user) r.push("Proprietatea nu are agent responsabil.");
  else {
    if (!user.email) r.push("Agentul responsabil nu are email.");
    if (!user.first_name) r.push("Agentul responsabil nu are nume.");
  }
  if (company) {
    if (!company.name) r.push("Agenția nu are nume.");
    if (!company.company_number) r.push("Completează CUI-ul agenției.");
    if (!company.city) r.push("Completează orașul agenției.");
    if (!company.line1) r.push("Completează adresa agenției.");
  }
  return r;
}
