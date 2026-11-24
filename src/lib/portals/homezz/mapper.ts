/**
 * HomeZZ.ro + Lajumate.ro: mapper pur Habitoo → parametrii unui anunț HomeZZ, pe categorii.
 * Fără rețea, fără DB. `token`, `internal_id`, `images`, `promotion_id` se adaugă la publicare.
 */
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { publicCoords } from "@/lib/geo";
import { htmlToText, normalizeLabel } from "@/lib/portals/imo24/mapper";
import type { HomezzLocationResult } from "./location";

type Row = Partial<PropertyRow> & { id: string };
export type HomezzParamValue = string | number | number[];
export type HomezzParams = Record<string, HomezzParamValue>;
export type HomezzTransaction = "sale" | "rent";
export type HomezzMapContext = {
  location: HomezzLocationResult;
  agent: { name: string | null; phone: string | null } | null;
};
export type HomezzMapResult =
  | { ok: true; ads: { transaction: HomezzTransaction; params: HomezzParams }[]; warnings: string[] }
  | { ok: false; reasons: string[]; warnings: string[] };

export const HOMEZZ_CATEGORY: Readonly<Record<string, number>> = {
  apartment: 1, studio: 2, house: 3, villa: 3, land: 4, office: 6, commercial: 7, industrial: 8, hotel: 9,
};

export const HOMEZZ_FORBIDDEN_TITLE_WORDS = [
  "vand", "vanzare", "vind", "vindem", "vinzare", "cumpar", "kumpar", "caut", "doresc", "vreau", "iau", "oferta",
  "ocazie", "okazie", "urgent", "credit", "imprumut", "euro", "lei", "ron", "€", "test", "cont", "cand", "olx",
  "pierdut", "recompensa", "licenta", "http://",
] as const;

// ---------------------------------------------------------------- tabele de corespondență (etichete normalizate)

const COMFORT: Record<string, number> = { "1": 1, "2": 2, "3": 3, lux: 100 };
const LAYOUT: Record<string, number> = { decomandat: 1, semidecomandat: 2, nedecomandat: 3, circular: 4 };
/** Starea finisajelor → `real_estate_state`; „Finisat”/„Semifinisat” nu au corespondent sigur. */
const FINISH_STATE: Record<string, number> = {
  noua: 1, nou: 1, buna: 2, rezonabila: 3, renovat: 4, renovata: 4, "necesita renovare": 5, "de renovat": 5,
};
const STAGE_UNDER_CONSTRUCTION = new Set(["in constructie"]);
const BUILDING_STATE_STAGE: Record<string, number> = { finalizata: 1, finalizat: 1, "in constructie": 3, proiect: 4 };
const BUILDING_STATE_RENOVATE = new Set(["necesita renovare", "de renovat"]);
const RES_TYPE: Record<string, number> = { bloc: 1, "bloc de apartamente": 1, casa: 2, vila: 2, "casa vila": 2 };
const OFFICE_TYPE: Record<string, number> = { ...RES_TYPE, "cladire de birouri": 3, "centru de afaceri": 3, "cladire mixta": 4 };
const COMMERCIAL_TYPE: Record<string, number> = {
  ...RES_TYPE, mall: 3, terasa: 4, "spatiu stradal": 5, stradal: 5, "centru comercial": 6, showroom: 7,
};
const INDUSTRIAL_TYPE: Record<string, number> = {
  productie: 1, servicii: 1, "productie servicii": 1, depozitare: 2, depozit: 2, logistica: 3,
};
const FURNITURE: Record<string, number> = { complet: 1, mobilat: 1, "complet mobilat": 1, partial: 2, nemobilat: 3, neutilat: 4 };
const TERRAIN_TYPE: Record<string, number> = {
  construibil: 1, constructii: 1, agricol: 2, padure: 3, livada: 4, pasune: 5, faneata: 6, helesteu: 7,
};
const TERRAIN_TYPE2: Record<string, number> = { intravilan: 1, extravilan: 2 };
const STRUCTURE: Record<string, number> = {
  beton: 1, "beton armat": 1, caramida: 2, zidarie: 2, "pereti sandwich": 3, sandwich: 3, metal: 4, metalica: 4,
  lemn: 5, prefabricate: 6, prefabricat: 6,
};
const UTILITY: Record<string, number> = {
  curent: 1, electricitate: 1, "curent electric": 1, apa: 2, canalizare: 3, gaz: 4, gaze: 4, incalzire: 5,
  clima: 6, "aer conditionat": 6, "sistem irigatie": 7, irigatie: 7,
};
const LAND_UTILITIES = new Set([1, 2, 3, 4, 7]);
const FEE_STANDARD: Record<string, number> = {
  "0": 101, "0.5": 103, "1": 1, "1.5": 104, "2": 2, "2.5": 105, "3": 3, "3.5": 106, "4": 4, "4.5": 107, "5": 5,
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const posInt = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n >= 1 ? Math.round(n) : null;
};
const lookup = (table: Record<string, number>, v: string | null | undefined): number | null =>
  table[normalizeLabel(v)] ?? null;
const capped = (n: number | null, max: number, over: number) => (n === null ? null : n > max ? over : n);

// ---------------------------------------------------------------- reguli exportate

/** Etajul HomeZZ: 1 demisol, 2 parter, 1–12 → 3–14, 13+ → 100, 101 mansardă; altfel null. */
export function homezzFloor(label: string | null | undefined, floor: number | null | undefined): number | null {
  const l = normalizeLabel(label);
  if (l === "demisol") return 1;
  if (l === "parter" || l === "parter inalt") return 2;
  if (l === "mansarda") return 101;
  const n = num(floor);
  const plus = /(\d+)\s*\+/.exec(label ?? "");
  if (plus) return n !== null && n >= Number(plus[1]) ? homezzFloor(null, n) : null;
  const m = /^etaj (\d+)$/.exec(l);
  const level = m ? Number(m[1]) : l === "" ? n : null;
  if (level === null || !Number.isInteger(level)) return null;
  if (level === 0) return 2;
  if (level < 0) return null;
  return level >= 13 ? 100 : level + 2;
}

/** Comision cumpărător/chiriaș → `fee`; null = se omite. */
export function homezzFee(commission: string | null | undefined, category: number): number | null {
  const m = /^\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%?\s*$/.exec(commission ?? "");
  if (!m) return null;
  const pct = Number(m[1]!.replace(",", "."));
  if (category === 7) {
    if (pct === 0) return 101;
    if (Number.isInteger(pct) && pct >= 1 && pct <= 10) return pct;
    return pct > 10 ? 102 : null;
  }
  if (category === 1 && pct === 50) return 108;
  if (category === 1 && pct === 100) return 109;
  const hit = FEE_STANDARD[String(pct)];
  if (hit !== undefined) return hit;
  return pct > 5 && !(category === 1 && (pct === 50 || pct === 100)) ? 102 : null;
}

/** Scurtează la ultimul cuvânt întreg care încape. */
export function homezzShorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > 0 ? cut.slice(0, at) : text.slice(0, max)).replace(/[\s,;:.-]+$/, "");
}

/** Cuvinte nepermise găsite (cuvânt întreg, fără diacritice, fără majuscule). */
export function homezzForbiddenTitleWords(title: string): string[] {
  const lower = title.toLowerCase();
  const words = new Set(normalizeLabel(title).split(" ").filter(Boolean));
  return HOMEZZ_FORBIDDEN_TITLE_WORDS.filter((w) => (/^[a-z]+$/.test(w) ? words.has(w) : lower.includes(w)));
}

function utilitiesFrom(list: string[] | null | undefined, allowed?: Set<number>): number[] | null {
  const out: number[] = [];
  for (const u of list ?? []) {
    const id = lookup(UTILITY, u);
    if (id !== null && (!allowed || allowed.has(id)) && !out.includes(id)) out.push(id);
  }
  return out.length ? out.sort((a, b) => a - b) : null;
}

function nrParking(n: number | null): number | null {
  if (n === null || n < 0 || !Number.isInteger(n)) return null;
  if (n <= 5) return n;
  if (n <= 10) return 6;
  if (n <= 20) return 7;
  return 8;
}

// ---------------------------------------------------------------- mapare

export function mapPropertyToHomezz(p: Row, ctx: HomezzMapContext): HomezzMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const common: HomezzParams = {};
  const put = (target: HomezzParams, name: string, value: HomezzParamValue | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    target[name] = value;
  };
  const need = (name: string, value: HomezzParamValue | null | undefined, reason: string) => {
    if (value === null || value === undefined || value === "") reasons.push(reason);
    else common[name] = value;
  };

  const typeKey = (p.property_type ?? "").trim().toLowerCase();
  const category = HOMEZZ_CATEGORY[typeKey] ?? null;
  if (category === null) {
    return { ok: false, reasons: [`Tipul de proprietate „${p.property_type ?? "necompletat"}” nu are corespondent la HomeZZ.`], warnings };
  }
  common.category = category;

  // Text.
  const rawTitle = htmlToText(p.title).replace(/\s+/g, " ").trim();
  let title = rawTitle;
  if (title.length > 60) {
    title = homezzShorten(title, 60);
    warnings.push("Titlul are peste 60 de caractere și a fost scurtat pentru HomeZZ.");
  }
  if (title.length < 5) reasons.push("Titlul trebuie să aibă cel puțin 5 caractere pentru HomeZZ.");
  else common.title = title;
  const bad = homezzForbiddenTitleWords(title);
  if (bad.length) warnings.push(`Titlul conține cuvinte nepermise de HomeZZ: ${bad.join(", ")}.`);

  let description = htmlToText(p.description).trim();
  if (description.length < 30) reasons.push("Descrierea trebuie să aibă cel puțin 30 de caractere pentru HomeZZ.");
  else {
    if (description.length > 5000) {
      description = homezzShorten(description, 5000);
      warnings.push("Descrierea are peste 5000 de caractere și a fost scurtată pentru HomeZZ.");
    }
    common.description = description;
  }

  // Locație și hartă.
  if (!ctx.location.ok) reasons.push(ctx.location.reason);
  else {
    common.city_id = ctx.location.cityId;
    common.area = ctx.location.areaId;
  }
  const coords = publicCoords({ id: p.id, lat: p.lat ?? null, lng: p.lng ?? null, location_precise: p.location_precise ?? false });
  if (coords) {
    common.map_lat = String(coords.lat);
    common.map_lng = String(coords.lng);
    if (p.location_precise === true) common.map_marker = 1;
    else {
      common.map_marker = 2;
      common.map_radius = 1000;
    }
  }

  common.negotiable = p.negotiable === true ? 1 : 0;
  if (p.vat_included === true) common.tva = 0;
  common.terms = 1;

  const agentName = ctx.agent?.name?.trim();
  if (agentName) common.owner_name = agentName;
  const phone = (ctx.agent?.phone ?? "").replace(/\D/g, "");
  if (phone.length >= 10 && phone.length <= 15) common.owner_phone = phone;

  put(common, "fee", homezzFee(p.commission, category));

  // Valori comune pe categorii.
  const dims = posInt(p.usable_surface ?? p.surface);
  const yearRaw = num(p.build_year);
  const year = yearRaw === null ? null : Math.round(yearRaw);
  const yearValue = year !== null && year >= 1700 && year <= 2030 ? year : null;
  const requireYear = () => {
    if (year === null) reasons.push("Completează anul construcției pentru HomeZZ.");
    else if (yearValue === null) reasons.push(`Anul construcției ${year} este în afara intervalului acceptat de HomeZZ (1700–2030).`);
    else common.real_estate_year = yearValue;
  };
  const stage = normalizeLabel(p.construction_stage);
  const finish = normalizeLabel(p.finish_state);
  const realEstateState = STAGE_UNDER_CONSTRUCTION.has(stage) ? 6 : (FINISH_STATE[finish] ?? null);
  const buildingState = BUILDING_STATE_RENOVATE.has(finish) ? 2 : (BUILDING_STATE_STAGE[stage] ?? null);
  const parkingSpaces = num(p.parking_spaces);
  const parkingPlace = parkingSpaces !== null && parkingSpaces > 0 ? 1 : p.parking && p.parking.trim() ? 1 : null;
  const optParking = () => {
    put(common, "parking_place", parkingPlace);
    put(common, "nr_parking_place", nrParking(parkingSpaces));
  };
  const grouped = () => {
    if (p.development_id) common.real_estate_grouped = 1;
  };
  const sizeLabel = "suprafața utilă";

  if (category === 1 || category === 2) {
    need("real_estate_dimensions", dims, `Completează ${sizeLabel} pentru HomeZZ.`);
    need("comfort", lookup(COMFORT, p.comfort), "Completează confortul (1, 2, 3 sau Lux) pentru HomeZZ.");
    need("real_estate_floor", homezzFloor(p.floor_label, p.floor), "Completează etajul pentru HomeZZ.");
    requireYear();
    need("type", lookup(RES_TYPE, p.building_type), "Completează tipul clădirii (bloc sau casă/vilă) pentru HomeZZ.");
    need("real_estate_state", realEstateState, "Starea imobilului nu are corespondent la HomeZZ (Nouă, Bună, Rezonabilă, Renovată, De renovat, În construcție).");
    if (category === 1) {
      need("rooms", capped(posInt(p.rooms), 5, 100), "Completează numărul de camere pentru HomeZZ.");
      need("real_estate_subdivision", lookup(LAYOUT, p.layout), "Completează compartimentarea pentru HomeZZ.");
      put(common, "bathrooms", capped(posInt(p.bathrooms), 3, 100));
    }
    put(common, "real_estate_level", capped(posInt(p.building_floors), 10, 100));
    put(common, "real_estate_furniture", lookup(FURNITURE, p.furnishing));
    optParking();
    const f = num(p.floor), bf = num(p.building_floors);
    if (f !== null && bf !== null && f >= 0 && bf >= 1) common.last_floor = f === bf ? 1 : 0;
    grouped();
  } else if (category === 3) {
    need("rooms", posInt(p.rooms), "Completează numărul de camere pentru HomeZZ.");
    need("real_estate_dimensions", dims, `Completează ${sizeLabel} pentru HomeZZ.`);
    need("terrain_size", posInt(p.land_surface), "Completează suprafața terenului pentru HomeZZ.");
    requireYear();
    need("real_estate_state", realEstateState, "Starea imobilului nu are corespondent la HomeZZ (Nouă, Bună, Rezonabilă, Renovată, De renovat, În construcție).");
    put(common, "real_estate_level", capped(posInt(p.building_floors), 10, 100));
    put(common, "bathrooms", capped(posInt(p.bathrooms), 3, 100));
    put(common, "real_estate_furniture", lookup(FURNITURE, p.furnishing));
    optParking();
    if (typeof p.has_basement === "boolean") common.basement = p.has_basement ? 1 : 0;
    if (typeof p.has_semi_basement === "boolean") common.semi_basement = p.has_semi_basement ? 1 : 0;
    put(common, "utilities", utilitiesFrom(p.utilities));
    grouped();
  } else if (category === 4) {
    need("terrain_size", posInt(p.land_surface ?? p.surface), "Completează suprafața terenului pentru HomeZZ.");
    need("terrain_type", lookup(TERRAIN_TYPE, p.destination) ?? lookup(TERRAIN_TYPE, p.category), "Completează tipul terenului (construibil, agricol etc.) pentru HomeZZ.");
    need("terrain_type2", lookup(TERRAIN_TYPE2, p.land_classification), "Completează clasificarea terenului (intravilan/extravilan) pentru HomeZZ.");
    put(common, "utilities", utilitiesFrom(p.utilities, LAND_UTILITIES));
  } else {
    need("real_estate_dimensions", dims, `Completează ${sizeLabel} pentru HomeZZ.`);
    const total = posInt(p.total_usable_surface ?? p.built_surface);
    if (category === 6 || category === 8) need("total_terrain_size", total, "Completează suprafața totală pentru HomeZZ.");
    else if (category === 7) put(common, "total_terrain_size", total);
    if (category === 8) need("office_size", null, "Completează suprafața de birouri pentru HomeZZ.");
    requireYear();
    if (category === 6) need("type", lookup(OFFICE_TYPE, p.building_type), "Completează tipul clădirii pentru HomeZZ.");
    if (category === 7) need("type", lookup(COMMERCIAL_TYPE, p.building_type), "Completează tipul spațiului comercial pentru HomeZZ.");
    if (category === 8) need("type", lookup(INDUSTRIAL_TYPE, p.destination) ?? lookup(INDUSTRIAL_TYPE, p.building_type), "Completează destinația spațiului industrial pentru HomeZZ.");
    need("building_state", buildingState, "Completează stadiul clădirii (finalizat, de renovat, în construcție, proiect) pentru HomeZZ.");
    if (category === 9) put(common, "nr_rooms", posInt(p.rooms));
    else {
      put(common, "nr_rooms", posInt(p.rooms));
      put(common, "public_bathrooms", posInt(p.bathrooms));
    }
    if (category === 8) put(common, "resistance_structure", lookup(STRUCTURE, p.building_structure));
    optParking();
  }

  // Tranzacții: un anunț per tranzacție, fiecare cu prețul și moneda ei.
  const sale = !!(p.for_sale || p.transaction_kind === "sale");
  const rent = !!(p.for_rent || p.transaction_kind === "rent");
  if (!sale && !rent) reasons.push("Bifează vânzare sau închiriere.");
  const ads: { transaction: HomezzTransaction; params: HomezzParams }[] = [];
  const tx = (kind: HomezzTransaction, raw: unknown, cur: string | null | undefined, label: string) => {
    const price = num(raw);
    const currency = (cur ?? p.currency ?? "EUR").toUpperCase();
    if (price === null || price <= 0) return void reasons.push(`Lipsește prețul de ${label}.`);
    if (currency !== "EUR" && currency !== "RON") return void reasons.push(`HomeZZ acceptă doar EUR sau RON; prețul de ${label} este în ${currency}.`);
    const params: HomezzParams = { ...common, transaction_type: kind === "sale" ? 1 : 2, price: Math.round(price) };
    if (currency === "RON") params.currency = "ron";
    ads.push({ transaction: kind, params });
  };
  if (sale) tx("sale", p.sale_price ?? p.price, p.sale_currency, "vânzare");
  if (rent) tx("rent", p.rent_price ?? p.price, p.rent_currency, "închiriere");

  if (reasons.length) return { ok: false, reasons, warnings };
  return { ok: true, ads, warnings };
}
