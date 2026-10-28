/**
 * HomeDirect.ro: mapper pur Habitoo → `CreatePropertyRequest` (etapa 2).
 * Fără `agency` / `agent` / `externalIds` (vin la publicare). Nu face apeluri.
 * Reutilizează utilitarele imo24 (text, etaj, curs BNR, comision 0).
 */
import { publicCoords } from "@/lib/geo";
import type { PropertyRow } from "@/lib/site-feed/mapper";
import {
  cutAtWord,
  htmlToText,
  imo24ExternalId,
  imo24Floor,
  imo24Transactions,
  imo24ZeroCommission,
  normalizeLabel,
  stripAdminPrefix,
} from "@/lib/portals/imo24/mapper";
import type { HomedirectLocation } from "./locations.server";

export const HOMEDIRECT_TITLE_MAX = 150;

export type HomedirectTransaction = "buy" | "rent";
export type HomedirectPropertyKind = "apartment" | "studio" | "house" | "land" | "office";

export type HomedirectPostData = {
  title: string;
  price: number;
  sellerType: "business";
  priceIncludesTva?: boolean;
  hasCommission: boolean;
  city: string;
  county: string;
  district?: string;
  type: HomedirectTransaction;
  property: HomedirectPropertyKind;
  officeSubtype?: "office" | "commercial" | "industrial";
  landSubtype?: "construction" | "agricultural" | "forest" | "orchard";
  landClassification?: "urban" | "rural";
  bedroom?: number;
  bathroom?: number;
  floor?: string;
  totalFloors?: string;
  layout?: "separated" | "semiSeparated" | "circular" | "studio";
  constructionYear?: string;
  constructionMaterial?: "brick" | "concrete" | "reinforcedConcrete";
  windowType?: "pvc" | "aluminum" | "wood";
  hasElevator?: true;
  hasCentralHeating?: true;
  hasAirConditioning?: true;
  furnishingStatus?: "furnished" | "partiallyFurnished" | "unfurnished";
  hasParking?: true;
  parkingSpots?: number;
  latitude: string;
  longitude: string;
  images: string[];
  externalId: string;
};
export type HomedirectRequest = { postData: HomedirectPostData; postDetail: { desc: string; size: number } };
export type HomedirectBody = { transaction: HomedirectTransaction; externalPostId: string; request: HomedirectRequest };

export type HomedirectMapResult =
  | { ok: true; bodies: HomedirectBody[]; warnings: string[]; locationVerified: boolean }
  | { ok: false; reasons: string[]; warnings: string[] };

export type HomedirectMapContext = {
  location: HomedirectLocation;
  /** URL-urile publice ale pozelor (cu watermark, ca la imo24). */
  images: string[];
  /** undefined = nu e nevoie (fără lei); null = curs indisponibil. */
  eurRonRate?: number | null;
};

type Row = Partial<PropertyRow> & Pick<PropertyRow, "id">;

const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

const TYPE_LABEL: Record<string, string> = {
  apartment: "Apartament", studio: "Garsonieră", house: "Casă", villa: "Vilă", land: "Teren",
  office: "Birou", commercial: "Spațiu comercial", industrial: "Spațiu industrial",
};

export function homedirectPropertyKind(type: string | null | undefined):
  { property: HomedirectPropertyKind; officeSubtype?: "office" | "commercial" | "industrial" } | null {
  switch ((type ?? "").trim().toLowerCase()) {
    case "apartment": return { property: "apartment" };
    case "studio": return { property: "studio" };
    case "house": case "villa": return { property: "house" };
    case "land": return { property: "land" };
    case "office": return { property: "office", officeSubtype: "office" };
    case "commercial": return { property: "office", officeSubtype: "commercial" };
    case "industrial": return { property: "office", officeSubtype: "industrial" };
    default: return null;
  }
}

const landText = (p: Row) => normalizeLabel([p.category, p.destination].filter(Boolean).join(" "));

export function homedirectLandSubtype(p: Row): HomedirectPostData["landSubtype"] | null {
  const t = landText(p);
  if (/\bconstruc|\bconstruibil/.test(t)) return "construction";
  if (/\bagricol|\barabil/.test(t)) return "agricultural";
  if (/\bpadure|\bforestier/.test(t)) return "forest";
  if (/\blivad/.test(t)) return "orchard";
  return null;
}

export function homedirectLandClassification(p: Row): "urban" | "rural" | null {
  const t = landText(p);
  if (/\bintravilan\b/.test(t)) return "urban";
  if (/\bextravilan\b/.test(t)) return "rural";
  return null;
}

/** Etaj: demisol → basement, parter → ground, 1–40 → floorN, > 40 → floorAbove10, mansardă → attic. */
export function homedirectFloor(p: Row): { value: string; number: number | null } | null {
  const label = normalizeLabel(p.floor_label);
  if (label === "mansarda") return { value: "attic", number: null };
  const n = imo24Floor(p);
  if (n === null) return null;
  if (n < 0) return { value: "basement", number: n };
  if (n === 0) return { value: "ground", number: 0 };
  if (n <= 40) return { value: `floor${n}`, number: n };
  return { value: "floorAbove10", number: n };
}

export function homedirectConstructionYear(year: number | null): string | null {
  if (year === null) return null;
  if (year > 2010) return "after-2010";
  if (year >= 2000) return "2000-2010";
  if (year >= 1990) return "1990-2000";
  if (year >= 1977) return "1977-1990";
  if (year >= 1941) return "1941-1977";
  return "before-1941";
}

const LAYOUT: Record<string, HomedirectPostData["layout"]> = {
  decomandat: "separated", semidecomandat: "semiSeparated", circular: "circular",
};

export function homedirectMaterial(v: string | null | undefined): HomedirectPostData["constructionMaterial"] | null {
  const t = normalizeLabel(v);
  if (t === "beton armat") return "reinforcedConcrete";
  if (t === "beton") return "concrete";
  if (t === "caramida") return "brick";
  return null;
}

export function homedirectWindow(values: string[] | null | undefined): HomedirectPostData["windowType"] | null {
  const found = new Set<string>();
  for (const v of values ?? []) {
    const t = normalizeLabel(v);
    if (/\bpvc\b/.test(t)) found.add("pvc");
    else if (/\balumin/.test(t)) found.add("aluminum");
    else if (/\blemn\b/.test(t)) found.add("wood");
  }
  return found.size === 1 ? ([...found][0] as HomedirectPostData["windowType"]) : null;
}

export function homedirectFurnishing(v: string | null | undefined): HomedirectPostData["furnishingStatus"] | null {
  const t = normalizeLabel(v);
  if (t === "complet" || t === "mobilat" || t === "mobilat complet") return "furnished";
  if (t === "partial" || t === "semimobilat" || t === "partial mobilat") return "partiallyFurnished";
  if (t === "nemobilat") return "unfurnished";
  return null;
}

function hasAny(values: (string[] | null | undefined)[], re: RegExp): boolean {
  return values.some((arr) => (arr ?? []).some((v) => re.test(normalizeLabel(v))));
}

export function homedirectTitle(p: Row): string {
  const base = htmlToText(p.title).replace(/\s+/g, " ").trim();
  if (base) return cutAtWord(base, HOMEDIRECT_TITLE_MAX);
  const type = TYPE_LABEL[(p.property_type ?? "").toLowerCase()] ?? "Proprietate";
  const rooms = intOrNull(p.rooms);
  const roomsText = rooms && rooms > 1 && p.property_type !== "studio" ? `${rooms} camere` : "";
  const zone = (p.district ?? "").trim() || stripAdminPrefix((p.city ?? "").trim());
  return cutAtWord([type, roomsText, zone].filter(Boolean).join(" "), HOMEDIRECT_TITLE_MAX);
}

export function homedirectExternalPostId(p: Row, tx: HomedirectTransaction): string {
  return imo24ExternalId(p, tx === "buy" ? "vanzare" : "inchiriere");
}

type PriceResult = { ok: true; eur: number } | { ok: false; reason: string } | { ok: "pending"; warning: string };

export function homedirectPrice(p: Row, tx: HomedirectTransaction, rate: number | null | undefined): PriceResult {
  const raw = tx === "buy" ? (p.sale_price ?? p.price) : (p.rent_price ?? p.price);
  const currency = ((tx === "buy" ? p.sale_currency : p.rent_currency) ?? p.currency ?? "EUR").toUpperCase();
  const label = tx === "buy" ? "vânzare" : "închiriere";
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return { ok: false, reason: `Lipsește prețul de ${label}.` };
  if (currency === "EUR") return { ok: true, eur: Math.round(raw) };
  if (currency === "RON") {
    if (rate === undefined) return { ok: "pending", warning: `Prețul de ${label} este în lei: se convertește în EUR la cursul BNR al zilei.` };
    if (rate === null || !(rate > 0)) return { ok: false, reason: `Prețul de ${label} este în lei și cursul BNR al zilei nu este disponibil.` };
    return { ok: true, eur: Math.round(raw / rate) };
  }
  return { ok: false, reason: `HomeDirect acceptă doar prețuri în EUR (sau în lei, convertite); prețul de ${label} este în ${currency}.` };
}

export function mapPropertyToHomedirect(p: Row, ctx: HomedirectMapContext): HomedirectMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const txs: HomedirectTransaction[] = imo24Transactions(p).map((t) => (t === "vanzare" ? "buy" : "rent"));
  if (txs.length === 0) reasons.push("Alege tranzacția (vânzare sau închiriere).");

  const kind = homedirectPropertyKind(p.property_type);
  if (!kind) reasons.push(`Tipul de proprietate „${p.property_type ?? "necompletat"}” nu are corespondent la HomeDirect.`);

  let landSubtype: HomedirectPostData["landSubtype"] | null = null;
  if (kind?.property === "land") {
    landSubtype = homedirectLandSubtype(p);
    if (!landSubtype) reasons.push("Completează tipul terenului (construcții, agricol, pădure sau livadă).");
  }

  const title = homedirectTitle(p);
  const desc = htmlToText(p.description);
  if (!desc) reasons.push("Completează descrierea proprietății.");

  const size = intOrNull(kind?.property === "land" ? (p.land_surface ?? p.surface) : (p.usable_surface ?? p.surface));
  if (size === null || size < 1) {
    reasons.push(kind?.property === "land" ? "Completează suprafața terenului." : "Completează suprafața utilă.");
  }

  const coords = publicCoords({ id: p.id, lat: p.lat ?? null, lng: p.lng ?? null, location_precise: p.location_precise });
  if (!coords || (Math.abs(coords.lat) < 0.0001 && Math.abs(coords.lng) < 0.0001)) {
    reasons.push("Setează poziția pe hartă: HomeDirect cere coordonatele proprietății.");
  }

  if (ctx.images.length === 0) reasons.push("Adaugă cel puțin o poză publicabilă.");

  const loc = ctx.location;
  let locFields: { city: string; county: string; district?: string } | null = null;
  if (loc.status === "invalid") reasons.push(...loc.reasons);
  else if (loc.status === "unverified") {
    warnings.push(loc.reason);
    locFields = { county: loc.input.county, city: loc.input.city, ...(loc.input.district ? { district: loc.input.district } : {}) };
  } else {
    warnings.push(...loc.warnings);
    locFields = {
      county: String(loc.county.id),
      city: String(loc.city.id),
      ...(loc.district ? { district: String(loc.district.id) } : {}),
    };
  }

  const prices = new Map<HomedirectTransaction, number>();
  for (const tx of txs) {
    const r = homedirectPrice(p, tx, ctx.eurRonRate);
    if (r.ok === true) prices.set(tx, r.eur);
    else if (r.ok === "pending") { warnings.push(r.warning); prices.set(tx, 0); }
    else reasons.push(r.reason);
  }

  if (reasons.length || !kind || !coords || !locFields || size === null) return { ok: false, reasons, warnings };
  if (txs.length === 2) warnings.push("Ambele tranzacții sunt active: se trimit două anunțuri (vânzare și închiriere).");

  const shared: Omit<HomedirectPostData, "price" | "type" | "externalId"> = {
    title,
    sellerType: "business",
    ...(typeof p.vat_included === "boolean" ? { priceIncludesTva: p.vat_included } : {}),
    hasCommission: !imo24ZeroCommission(p.commission),
    ...locFields,
    property: kind.property,
    ...(kind.officeSubtype ? { officeSubtype: kind.officeSubtype } : {}),
    ...(landSubtype ? { landSubtype } : {}),
    latitude: String(coords.lat),
    longitude: String(coords.lng),
    images: ctx.images,
  };
  const landClass = kind.property === "land" ? homedirectLandClassification(p) : null;
  if (landClass) shared.landClassification = landClass;

  if (kind.property !== "land") {
    const rooms = kind.property === "studio" ? 1 : intOrNull(p.rooms);
    if (rooms !== null && rooms > 0) shared.bedroom = rooms;
    const baths = intOrNull(p.bathrooms);
    if (baths !== null && baths > 0) shared.bathroom = baths;

    const floor = homedirectFloor(p);
    if (floor) shared.floor = floor.value;
    const total = intOrNull(p.building_floors);
    if (total !== null && total >= 0 && (floor?.number == null || total >= floor.number)) shared.totalFloors = String(total);

    const layout = kind.property === "studio" ? "studio" : LAYOUT[normalizeLabel(p.layout)];
    if (layout) shared.layout = layout;

    const yearRaw = intOrNull(p.build_year);
    const year = homedirectConstructionYear(yearRaw !== null && yearRaw >= 1800 && yearRaw <= 2100 ? yearRaw : null);
    if (year) shared.constructionYear = year;
    const material = homedirectMaterial(p.building_structure);
    if (material) shared.constructionMaterial = material;
    const win = homedirectWindow(p.windows);
    if (win) shared.windowType = win;

    if (hasAny([p.building_amenities, p.features], /^(lift|ascensor)\b/)) shared.hasElevator = true;
    if (hasAny([p.heating_systems, p.features], /\bcentrala\b/) || /\bcentrala\b/.test(normalizeLabel(p.heating))) {
      shared.hasCentralHeating = true;
    }
    if (hasAny([p.cooling_systems, p.features, p.misc_features], /\baer conditionat\b/)) shared.hasAirConditioning = true;

    const furn = homedirectFurnishing(p.furnishing);
    if (furn) shared.furnishingStatus = furn;
  }

  const spots = intOrNull(p.parking_spaces);
  if (spots !== null && spots > 0) { shared.hasParking = true; shared.parkingSpots = spots; }

  const bodies: HomedirectBody[] = txs.map((tx) => {
    const externalPostId = homedirectExternalPostId(p, tx);
    return {
      transaction: tx,
      externalPostId,
      request: {
        postData: { ...shared, type: tx, price: prices.get(tx) ?? 0, externalId: externalPostId },
        postDetail: { desc, size },
      },
    };
  });
  return { ok: true, bodies, warnings, locationVerified: loc.status === "verified" };
}
