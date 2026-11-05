/**
 * Mapper Habitoo → payload Housera (funcție pură, fără rețea sau DB).
 *
 * O proprietate de vânzare și de închiriere devine două anunțuri Housera, câte
 * unul pe tranzacție, cu `external_ref` = `<id>-sale` / `<id>-rent` (folosit doar
 * în adresa `PUT /listings/ref/{ref}`, nu în corp). Se trimit numai coduri din
 * vocabularul primit; ce nu are o potrivire sigură devine eroare blocantă
 * (identitate, câmpuri obligatorii) sau se omite (dotări, valori opționale).
 */
import { houseraFieldApplies, houseraFieldValues, type HouseraSchema } from "./schema";

export type HouseraMapperProperty = {
  id: string;
  property_type: string | null;
  category: string | null;
  destination?: string | null;
  for_sale: boolean;
  for_rent: boolean;
  title: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  county: string | null;
  district: string | null;
  street: string | null;
  street_number: string | null;
  postal_code: string | null;
  price: number | null;
  currency: string | null;
  sale_price: number | null;
  sale_currency: string | null;
  rent_price: number | null;
  rent_currency: string | null;
  negotiable: boolean;
  usable_surface: number | null;
  surface: number | null;
  built_surface: number | null;
  land_surface: number | null;
  balcony_surface: number | null;
  terrace_surface: number | null;
  garden_surface: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  building_floors: number | null;
  layout: string | null;
  build_year: number | null;
  has_attic: boolean;
  heating: string | null;
  heating_systems: string[];
  energy_class: string | null;
  finish_state: string | null;
  features: string[];
  building_amenities: string[];
  appliances: string[];
  misc_features: string[];
  utilities: string[];
  views: string[];
  cooling_systems: string[];
  additional_spaces: string[];
  parking: string | null;
  bathroom_window: boolean;
};

export type HouseraTransaction = "sale" | "rent";
export type HouseraPayload = Record<string, string | number | boolean | string[]>;
export type HouseraListingDraft = {
  transaction: HouseraTransaction;
  externalRef: string;
  payload: HouseraPayload;
  errors: string[];
  warnings: string[];
};
export type HouseraMapResult = { listings: HouseraListingDraft[]; errors: string[]; warnings: string[] };

const norm = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const txt = (v: string | null | undefined) => { const t = (v ?? "").trim(); return t ? t : null; };
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const area = (v: number | null | undefined) => { const n = num(v); return n !== null && n > 0 ? Math.round(n * 100) / 100 : null; };

/** Lungime 1–100, litere, cifre și `. _ : / -` (identifiers.md). */
export const HOUSERA_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,100}$/;
export function houseraExternalRef(propertyId: string, tx: HouseraTransaction): string {
  return `${propertyId}-${tx}`;
}

// ---------- Tip / subtip (mapare explicită, fără ghicit) ----------
const SUBTYPE_BY_CATEGORY: Record<string, Record<string, string>> = {
  apartment: { penthouse: "penthouse", duplex: "duplex", triplex: "triplex", garsoniera: "studio", studio: "studio", apartament: "standard", standard: "standard" },
  house: { vila: "villa", villa: "villa", duplex: "duplex", triplex: "triplex", individuala: "detached", "casa individuala": "detached", insiruita: "terraced", cuplata: "semi_detached", calcan: "semi_detached", conac: "mansion" },
  land: { constructii: "building", "teren constructii": "building", agricol: "agricultural", agricola: "agricultural", livada: "orchard", vie: "vineyard", pasune: "pasture", padure: "forest", industrial: "industrial", industriala: "industrial" },
  commercial: { birou: "offices", birouri: "offices", retail: "retail", horeca: "horeca", cabinet: "practice", "spatiu stradal": "street_retail", "hala comerciala": "retail_hall", mall: "shopping_center", "cladire mixta": "mixed_building" },
  warehouse: { depozit: "standard", "hala industriala": "industrial_hall", "hala productie": "production_hall", logistic: "logistics", logistica: "logistics", frigorifica: "cold_storage" },
};
const LAND_SUBTYPE_BY_DESTINATION: Record<string, string> = { agricola: "agricultural", rezidentiala: "building", industriala: "industrial" };

function categoryTokens(p: HouseraMapperProperty): string[] {
  return (p.category ?? "").split(/[,;/|]/).map(norm).filter(Boolean);
}

export function houseraTypeFor(p: HouseraMapperProperty): { type: string; subtype: string | null; error?: string } | { type: null; subtype: null; error: string } {
  const pt = norm(p.property_type);
  const cats = categoryTokens(p);
  const fromCat = (type: string) => cats.map((c) => SUBTYPE_BY_CATEGORY[type]?.[c]).find(Boolean) ?? null;
  switch (pt) {
    case "studio": return { type: "apartment", subtype: "studio" };
    case "apartment": return { type: "apartment", subtype: fromCat("apartment") ?? "standard" };
    case "penthouse": case "duplex": return { type: "apartment", subtype: pt };
    case "villa": return { type: "house", subtype: "villa" };
    case "house": {
      const s = fromCat("house");
      return s ? { type: "house", subtype: s } : { type: "house", subtype: null, error: "Subtipul casei lipsește (individuală, vilă, duplex, înșiruită, cuplată…): completează categoria." };
    }
    case "land": {
      const s = fromCat("land") ?? LAND_SUBTYPE_BY_DESTINATION[norm(p.destination)] ?? null;
      return s ? { type: "land", subtype: s } : { type: "land", subtype: null, error: "Subtipul terenului lipsește (construcții, agricol, livadă…): completează categoria sau destinația." };
    }
    case "office": return { type: "commercial", subtype: "offices" };
    case "commercial": {
      const s = fromCat("commercial");
      return s ? { type: "commercial", subtype: s } : { type: "commercial", subtype: null, error: "Subtipul spațiului comercial lipsește (birouri, retail, HoReCa, cabinet…): completează categoria." };
    }
    case "industrial": {
      const s = fromCat("warehouse");
      return s ? { type: "warehouse", subtype: s } : { type: "warehouse", subtype: null, error: "Subtipul halei lipsește (depozit, hală industrială, producție, logistică, frigorifică): completează categoria." };
    }
    default:
      return { type: null, subtype: null, error: `Tipul proprietății „${p.property_type ?? "lipsă"}” nu are corespondent sigur în Housera.` };
  }
}

function landClassification(p: HouseraMapperProperty): string | null {
  const cats = categoryTokens(p);
  if (cats.includes("intravilan")) return "inside_built_up_area";
  if (cats.includes("extravilan")) return "outside_built_up_area";
  return null;
}

// ---------- Text ----------
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const DOMAIN = /\b[A-Za-z0-9-]+\.(?:ro|com|net|org|eu|info|biz|io)\b(?:\/\S*)?/gi;
const PHONE_CANDIDATE = /(?:\+|\b)\d[\d\s.\-()/]{7,18}\d\b/g;

function isPhone(s: string): boolean {
  const d = s.replace(/\D/g, "");
  if (d.length < 9 || d.length > 13) return false;
  return /^(?:0040|40|0)[237]/.test(d) || s.trim().startsWith("+");
}

/** Scoate telefoanele, emailurile și adresele web; `removed` spune ce s-a scos. */
export function stripHouseraContacts(input: string): { text: string; removed: Array<"telefon" | "email" | "link"> } {
  const removed = new Set<"telefon" | "email" | "link">();
  let out = input.replace(EMAIL, () => { removed.add("email"); return ""; });
  out = out.replace(URL_RE, () => { removed.add("link"); return ""; });
  out = out.replace(DOMAIN, () => { removed.add("link"); return ""; });
  out = out.replace(PHONE_CANDIDATE, (m) => { if (!isPhone(m)) return m; removed.add("telefon"); return ""; });
  out = out.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:!?])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
  return { text: out, removed: [...removed] };
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim();
}

// ---------- Specificații ----------
const PARTITIONING: Record<string, string> = { decomandat: "detached", semidecomandat: "semi_detached", nedecomandat: "undetached", circular: "circular", vagon: "railroad" };
const HEATING: Record<string, string> = {
  termoficare: "district", "centrala proprie": "gas", "pompa de caldura": "heat_pump",
  "soba teracota": "solid_fuel", "centrala pe lemne": "solid_fuel",
};
const ENERGY: Record<string, string> = { "a+": "a_plus", a0: "a0", a: "a", b: "b", c: "c", d: "d", e: "e", f: "f", g: "g" };
const CONDITION: Record<string, string> = { renovat: "renovated", buna: "good", "necesita renovare": "needs_renovation" };

/** Etichete Habitoo (orice listă de dotări) → coduri din catalogul Housera. */
const FEATURES: Record<string, string> = {
  interfon: "intercom", videointerfon: "video_intercom", "supraveghere video": "cctv", lift: "elevator",
  sauna: "sauna", curte: "yard", "curte comuna": "shared_yard", gradina: "garden",
  "piscina interioara": "indoor_pool", "piscina exterioara": "outdoor_pool", uscatorie: "shared_laundry",
  "masina de spalat rufe": "washing_machine", "masina de spalat vase": "dishwasher",
  jacuzzi: "jacuzzi", semineu: "fireplace", "senzor de fum": "smoke_detectors", "sistem de alarma": "alarm",
  "telecomanda poarta garaj": "garage_door_remote", "telecomanda poarta acces auto": "automatic_gate",
  "aer conditionat": "ac", "curent electric": "utility_electricity", apa: "utility_water_mains",
  canalizare: "utility_sewage", gaz: "utility_gas", put: "well", "fosa septica": "septic_tank",
  "curent trifazic": "utility_three_phase", "fibra optica": "fiber_internet", "sistem irigatie": "irrigation_system",
  panoramica: "panoramic_view", "spre lac": "lake_view", "spre mare": "sea_view", "spre munte": "mountain_view",
  "spre padure": "forest_view", terasa: "terrace", "wc serviciu": "extra_toilet", "boxa la subsol": "storage_unit",
  pivnita: "basement", dressing: "walk_in_closet", "incalzire pardoseala": "underfloor_heating", balcon: "balcony",
  garaj: "garage", "parcare subterana": "underground_parking", "parcare supraterana": "parking_open", "loc de parcare": "parking_open",
};

/** Toate codurile pe care le poate produce maparea (pentru semnalarea celor retrase/scoase). */
export function houseraMappingCodes(): Array<{ kind: string; code: string }> {
  const out: Array<{ kind: string; code: string }> = [];
  for (const t of Object.values(SUBTYPE_BY_CATEGORY)) for (const c of Object.values(t)) out.push({ kind: "subtype", code: c });
  for (const c of Object.values(FEATURES)) out.push({ kind: "feature", code: c });
  for (const c of Object.values(PARTITIONING)) out.push({ kind: "value:partitioning", code: c });
  for (const c of Object.values(HEATING)) out.push({ kind: "value:heating_types", code: c });
  for (const c of Object.values(ENERGY)) out.push({ kind: "value:energy_certificate", code: c });
  for (const c of Object.values(CONDITION)) out.push({ kind: "value:condition", code: c });
  for (const c of ["inside_built_up_area", "outside_built_up_area"]) out.push({ kind: "value:land_classification", code: c });
  for (const c of ["attic", "none"]) out.push({ kind: "value:attic", code: c });
  for (const f of MAPPED_FIELDS) out.push({ kind: "field", code: f });
  const seen = new Set<string>();
  return out.filter((x) => { const k = `${x.kind}:${x.code}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const MAPPED_FIELDS = [
  "type", "subtype", "transaction", "title", "description", "content_locale", "latitude", "longitude", "city", "street",
  "street_number", "county", "area", "postal_code", "country", "price", "price_currency", "negotiable", "usable_area_sqm",
  "built_area_sqm", "land_area_sqm", "surface_balconies", "surface_terrace", "surface_yard", "rooms", "bedrooms",
  "bathrooms", "floor", "total_floors", "partitioning", "year_built", "attic", "heating_types", "energy_certificate",
  "condition", "flood_risk", "land_classification", "features", "agent",
];

/** Codurile din maparea noastră care apar în `retired` / `withdrawn`. */
export function houseraAffectedCodes(schema: HouseraSchema) {
  const mine = houseraMappingCodes();
  const has = (kind: string, code: string) => mine.some((m) => m.code === code && m.kind === kind);
  return {
    retired: (schema.retired ?? []).filter((r) => has(r.kind, r.code)),
    withdrawn: (schema.withdrawn ?? []).filter((w) => has(w.kind, w.code)),
  };
}

// ---------- Mapare ----------
export function mapPropertyToHousera(
  p: HouseraMapperProperty,
  schema: HouseraSchema,
  ctx: { agentEmail: string | null },
): HouseraMapResult {
  const transactions: HouseraTransaction[] = [];
  if (p.for_sale) transactions.push("sale");
  if (p.for_rent) transactions.push("rent");
  if (transactions.length === 0) {
    const e = ["Proprietatea nu este marcată nici de vânzare, nici de închiriere."];
    return { listings: [], errors: e, warnings: [] };
  }
  const listings = transactions.map((tx) => mapOne(p, schema, ctx, tx));
  return {
    listings,
    errors: listings.flatMap((l) => l.errors.map((e) => (listings.length > 1 ? `${txLabel(l.transaction)}: ${e}` : e))),
    warnings: listings.flatMap((l) => l.warnings.map((w) => (listings.length > 1 ? `${txLabel(l.transaction)}: ${w}` : w))),
  };
}

const txLabel = (tx: HouseraTransaction) => (tx === "sale" ? "Vânzare" : "Închiriere");

function mapOne(p: HouseraMapperProperty, schema: HouseraSchema, ctx: { agentEmail: string | null }, tx: HouseraTransaction): HouseraListingDraft {
  const errors: string[] = [];
  const warnings: string[] = [];
  const payload: HouseraPayload = {};
  const externalRef = houseraExternalRef(p.id, tx);
  if (!HOUSERA_REF_PATTERN.test(externalRef)) errors.push("Identificatorul extern nu respectă formatul Housera.");

  const t = houseraTypeFor(p);
  if (t.error) errors.push(t.error);
  const typeDef = t.type ? schema.types.find((x) => x.code === t.type) : undefined;
  if (t.type && !typeDef) errors.push(`Tipul „${t.type}” nu există în nomenclatorul Housera.`);
  if (typeDef && !typeDef.transactions.includes(tx)) errors.push(`Housera nu acceptă ${tx === "sale" ? "vânzarea" : "închirierea"} pentru acest tip.`);
  if (typeDef && t.subtype && !(typeDef.subtypes ?? []).some((s) => s.code === t.subtype)) errors.push(`Subtipul „${t.subtype}” nu există în nomenclatorul Housera.`);
  if (!typeDef) return { transaction: tx, externalRef, payload, errors, warnings };
  const type = typeDef.code;
  payload["type"] = type;
  if (t.subtype) payload["subtype"] = t.subtype;
  payload["transaction"] = tx;

  const applies = (f: string) => houseraFieldApplies(schema, f, type, tx);
  const put = (f: string, v: string | number | boolean | string[] | null | undefined) => {
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) return;
    if (applies(f)) payload[f] = v;
  };
  const code = (f: string, v: string | null) => {
    if (!v) return null;
    const allowed = houseraFieldValues(schema, f, type);
    return allowed && allowed.includes(v) ? v : null;
  };

  // Text
  const rawTitle = txt(p.title);
  if (rawTitle) {
    const s = stripHouseraContacts(rawTitle);
    if (s.removed.length) warnings.push(`Din titlu s-au scos: ${s.removed.join(", ")}.`);
    let title = s.text;
    if (title.length > 90) { title = clip(title, 90); warnings.push("Titlul a fost scurtat la 90 de caractere."); }
    if (title.length < 10) errors.push("Titlul trebuie să aibă cel puțin 10 caractere.");
    else payload["title"] = title;
  } else errors.push("Titlul lipsește.");
  const rawDesc = txt(p.description);
  if (rawDesc) {
    const s = stripHouseraContacts(rawDesc);
    if (s.removed.length) warnings.push(`Din descriere s-au scos date de contact (${s.removed.join(", ")}); moderarea Housera le respinge.`);
    let d = s.text;
    if (d.length > 5000) { d = clip(d, 5000); warnings.push("Descrierea a fost scurtată la 5.000 de caractere."); }
    if (d.length < 30) errors.push("Descrierea trebuie să aibă cel puțin 30 de caractere (fără date de contact).");
    else payload["description"] = d;
  } else errors.push("Descrierea lipsește.");
  payload["content_locale"] = "ro";

  // Locație
  const lat = num(p.lat), lng = num(p.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) errors.push("Coordonatele (latitudine/longitudine) lipsesc.");
  else { payload["latitude"] = lat; payload["longitude"] = lng; }
  const city = txt(p.city);
  if (!city) errors.push("Orașul lipsește."); else payload["city"] = city;
  const landClass = type === "land" ? landClassification(p) : null;
  const street = txt(p.street);
  if (street) payload["street"] = street.slice(0, 100);
  else if (!(type === "land" && landClass === "outside_built_up_area")) errors.push("Strada lipsește.");
  const sn = txt(p.street_number);
  if (sn) { if (/^[A-Za-z0-9](?:[A-Za-z0-9 ./,-]*[A-Za-z0-9])?$/.test(sn) && sn.length <= 16) payload["street_number"] = sn; else warnings.push("Numărul străzii nu respectă formatul Housera și a fost omis."); }
  put("county", txt(p.county));
  put("area", txt(p.district));
  const pc = txt(p.postal_code);
  if (pc) { if (/^\d{6}$/.test(pc)) put("postal_code", pc); else warnings.push("Codul poștal nu are 6 cifre și a fost omis."); }
  put("country", "RO");

  // Preț
  const rawPrice = tx === "sale" ? (num(p.sale_price) ?? num(p.price)) : (num(p.rent_price) ?? num(p.price));
  if (rawPrice === null || rawPrice <= 0) errors.push(`Prețul de ${tx === "sale" ? "vânzare" : "închiriere"} lipsește.`);
  else payload["price"] = Math.round(rawPrice);
  const cur = (txt(tx === "sale" ? p.sale_currency : p.rent_currency) ?? txt(p.currency) ?? "EUR").toUpperCase();
  if (!schema.currencies.includes(cur)) errors.push(`Moneda „${cur}” nu este acceptată de Housera.`);
  else payload["price_currency"] = cur;
  payload["negotiable"] = p.negotiable === true;

  // Suprafețe
  const usable = area(p.usable_surface) ?? area(p.surface);
  const built = area(p.built_surface);
  const land = area(p.land_surface);
  put("usable_area_sqm", usable);
  put("built_area_sqm", built);
  put("land_area_sqm", land);
  if (!usable && !["land", "house", "complex"].includes(type)) errors.push("Suprafața utilă lipsește.");
  if (!built && type === "house") errors.push("Suprafața construită lipsește.");
  if (!land && (type === "house" || type === "land")) errors.push("Suprafața terenului lipsește.");
  put("surface_balconies", area(p.balcony_surface));
  put("surface_terrace", area(p.terrace_surface));
  put("surface_yard", area(p.garden_surface));

  // Specificații
  const rooms = num(p.rooms), bedrooms = num(p.bedrooms), bathrooms = num(p.bathrooms);
  put("rooms", rooms === null ? null : Math.round(rooms));
  put("bedrooms", bedrooms === null ? null : Math.round(bedrooms));
  put("bathrooms", bathrooms === null ? null : Math.round(bathrooms));
  if (type === "apartment" || type === "house") {
    if (rooms === null) errors.push("Numărul de camere lipsește.");
    if (bedrooms === null) errors.push("Numărul de dormitoare lipsește.");
    if (bathrooms === null) errors.push("Numărul de băi lipsește.");
  }
  const floor = num(p.floor);
  put("floor", floor === null ? null : Math.round(floor));
  if (floor === null && (type === "apartment" || type === "room")) errors.push("Etajul lipsește.");
  const totalFloors = num(p.building_floors);
  put("total_floors", totalFloors === null ? null : Math.round(totalFloors));
  if (totalFloors === null && (type === "apartment" || type === "house")) errors.push("Numărul de etaje ale clădirii lipsește.");
  const part = code("partitioning", PARTITIONING[norm(p.layout)] ?? null);
  put("partitioning", part);
  if (!part && type === "apartment" && t.subtype !== "studio" && !(rooms !== null && rooms <= 1)) errors.push("Compartimentarea lipsește sau nu are corespondent în Housera.");
  put("year_built", num(p.build_year));
  if (type === "house" || applies("attic")) put("attic", code("attic", p.has_attic ? "attic" : "none"));
  const heat = new Set<string>();
  for (const h of [p.heating, ...(p.heating_systems ?? [])]) { const c = code("heating_types", HEATING[norm(h)] ?? null); if (c) heat.add(c); }
  put("heating_types", [...heat]);
  put("energy_certificate", code("energy_certificate", ENERGY[norm(p.energy_class)] ?? null));
  put("condition", code("condition", CONDITION[norm(p.finish_state)] ?? null));

  // Obligatorii pe care Habitoo nu le are: nu inventăm.
  if (houseraFieldApplies(schema, "flood_risk", type, tx) && ["land", "house", "warehouse"].includes(type)) {
    errors.push("Declarația de risc de inundație lipsește (Habitoo nu are acest câmp).");
  }
  if (type === "land") {
    if (landClass) put("land_classification", code("land_classification", landClass));
    else errors.push("Încadrarea terenului (intravilan/extravilan) lipsește: completează categoria.");
  }

  // Dotări
  const feats = new Set<string>();
  const catalog = new Map(schema.features.map((f) => [f.code, f]));
  const withdrawn = new Set((schema.withdrawn ?? []).filter((w) => w.kind === "feature").map((w) => w.code));
  const sources = [p.features, p.building_amenities, p.appliances, p.misc_features, p.utilities, p.views, p.cooling_systems, p.additional_spaces, p.heating_systems, [p.parking ?? ""]];
  for (const list of sources) for (const raw of list ?? []) {
    const c = FEATURES[norm(raw)] ?? (catalog.has(raw) ? raw : null);
    if (c) feats.add(c);
  }
  if (p.bathroom_window) feats.add("bathroom_window");
  const okFeats = [...feats].filter((c) => {
    if (withdrawn.has(c)) return false;
    const f = catalog.get(c);
    if (!f) return false;
    if (Array.isArray(f.types) && !f.types.includes(type)) return false;
    if (Array.isArray(f.transactions) && !f.transactions.includes(tx)) return false;
    return true;
  });
  put("features", okFeats.sort());

  // Agent
  const email = txt(ctx.agentEmail);
  if (email) payload["agent"] = email;
  else warnings.push("Agentul responsabil nu are email; anunțul va rămâne pe contul agenției.");

  return { transaction: tx, externalRef, payload, errors, warnings };
}
