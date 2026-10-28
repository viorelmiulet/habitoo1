/**
 * Mapper pur Habitoo → corpul `Anunt` imo24.ro (specificația v1.0.1).
 * Fără rețea și fără bază de date: dicționarele (`GET /enumerari`,
 * `GET /dotari`) și cursul BNR se primesc ca parametri.
 *
 * Reguli:
 *  - vânzare + închiriere → două corpuri (`vanzare` / `inchiriere`), fiecare cu prețul lui;
 *  - birou, hală și alte tipuri fără categorie imo24 → nepublicabil, cu motiv;
 *  - enumerările fără corespondent sigur se trimit `null`, nu se ghicesc;
 *  - dotările se trimit doar la potrivire exactă pe eticheta normalizată;
 *  - câmpurile fără sursă în Habitoo (`prima_inchiriere`, `cadastru`, `intabulare`)
 *    nu se trimit deloc; imaginile și agentul se adaugă la publicare.
 */
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { publicCoords } from "@/lib/geo";

export const IMO24_TITLE_MIN = 10;
export const IMO24_TITLE_MAX = 60;
export const IMO24_DESCRIPTION_MIN = 50;
export const IMO24_DESCRIPTION_MAX = 2000;
export const IMO24_MIN_PRICE = { vanzare: 10_000, inchiriere: 100 } as const;
export const IMO24_BOUNDS = { latMin: 43.5, latMax: 48.4, lngMin: 20.2, lngMax: 29.8 } as const;

export type Imo24Transaction = "vanzare" | "inchiriere";
export type Imo24Category = "apartament" | "casa" | "teren" | "spatiu_comercial";

export type Imo24EnumValue = { cod: string; valoare_db?: number; eticheta?: string };
export type Imo24Enumerations = Partial<Record<
  | "compartimentare"
  | "confort"
  | "tip_imobil"
  | "stare_proprietate"
  | "interval_constructie"
  | "tip_teren"
  | "clasificare_teren",
  Imo24EnumValue[]
>>;
export type Imo24FeatureGroup = { grup: string; dotari: { id: number; nume: string }[] };

export type Imo24Anunt = {
  external_id: string;
  tranzactie: Imo24Transaction;
  categorie: Imo24Category;
  titlu: string;
  descriere: string;
  pret: number;
  moneda: "EUR";
  negociabil: boolean;
  tva: boolean;
  comision_zero: boolean;
  camere?: number;
  etaj?: number;
  etaje_imobil?: number;
  bai?: number;
  balcoane?: number;
  locuri_parcare?: number;
  nr_camere_casa?: number;
  suprafata_utila?: number;
  suprafata_teren?: number;
  an_constructie?: number;
  interval_constructie?: string | null;
  compartimentare?: string | null;
  confort?: string | null;
  tip_imobil?: string | null;
  stare_proprietate?: string | null;
  tip_teren?: string | null;
  clasificare_teren?: string | null;
  locatie: { judet: string; localitate?: string; strada?: string; lat: number; lng: number };
  dotari?: number[];
};

export type Imo24MapOptions = {
  /** Lei pentru 1 EUR (cursul BNR al zilei). `undefined` = încă necunoscut (doar previzualizare). */
  eurRonRate?: number | null;
  enumerations?: Imo24Enumerations | null;
  /** Dicționarul `GET /dotari` pentru categoria proprietății. */
  features?: Imo24FeatureGroup[] | null;
  /** Anul curent (pentru limita `an_constructie`); implicit anul de azi. */
  currentYear?: number;
};

export type Imo24MapResult =
  | { ok: true; bodies: Imo24Anunt[]; warnings: string[] }
  | { ok: false; reasons: string[]; warnings: string[] };

type Row = Partial<PropertyRow> & Pick<PropertyRow, "id">;

// ---------------------------------------------------------------- utilitare

export function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ---------------------------------------------------------------- tranzacție / categorie

export function imo24Transactions(p: Row): Imo24Transaction[] {
  const out: Imo24Transaction[] = [];
  if (p.for_sale || p.transaction_kind === "sale") out.push("vanzare");
  if (p.for_rent || p.transaction_kind === "rent") out.push("inchiriere");
  return out;
}

const CATEGORY: Record<string, Imo24Category> = {
  apartment: "apartament",
  studio: "apartament",
  house: "casa",
  villa: "casa",
  land: "teren",
  commercial: "spatiu_comercial",
};
const TYPE_LABEL: Record<string, string> = {
  apartment: "Apartament",
  studio: "Garsonieră",
  house: "Casă",
  villa: "Vilă",
  land: "Teren",
  commercial: "Spațiu comercial",
  office: "Birou",
  industrial: "Hală / spațiu industrial",
};

export function imo24Category(propertyType: string | null | undefined): Imo24Category | null {
  return CATEGORY[(propertyType ?? "").trim().toLowerCase()] ?? null;
}

// ---------------------------------------------------------------- enumerări

const LAYOUT: Record<string, string> = { decomandat: "decomandat", semidecomandat: "semidecomandat", circular: "circular" };
const COMFORT: Record<string, string> = {
  "1": "confort_1", "confort 1": "confort_1",
  "2": "confort_2", "confort 2": "confort_2",
  "3": "confort_3", "confort 3": "confort_3",
  lux: "lux",
};
const BUILDING: Record<string, string> = { bloc: "bloc", casa: "casa_vila", vila: "casa_vila" };
const FINISH: Record<string, string> = {
  finisat: "finisat",
  ultrafinisat: "finisat",
  nefinisat: "nefinisat",
  buna: "buna",
  "necesita renovare": "nerenovat",
  nerenovat: "nerenovat",
};

function fromDictionary(
  field: keyof Imo24Enumerations,
  code: string | null,
  enums: Imo24Enumerations | null | undefined,
): string | null {
  if (!code) return null;
  const list = enums?.[field];
  if (!list) return code; // fără dicționar (previzualizare): codul din specificație
  return list.some((v) => v.cod === code) ? code : null;
}

export function imo24ConstructionInterval(year: number | null): string | null {
  if (year === null) return null;
  if (year > 2000) return "dupa_2000";
  if (year >= 1990) return "1990_2000";
  if (year >= 1977) return "1977_1990";
  return "inainte_1977";
}

export function imo24LandType(p: Row): string | null {
  const text = normalizeLabel([p.category, p.destination].filter(Boolean).join(" "));
  if (/\bintravilan\b/.test(text)) return "intravilan";
  if (/\bextravilan\b/.test(text)) return "extravilan";
  return null;
}

export function imo24LandClassification(p: Row): string | null {
  const text = normalizeLabel([p.category, p.destination].filter(Boolean).join(" "));
  if (/\bconstruibil\b/.test(text)) return "construibil";
  if (/\bagricol[a]?\b/.test(text)) return "agricol";
  return null;
}

// ---------------------------------------------------------------- etaj

export function imo24Floor(p: Row): number | null {
  const numeric = intOrNull(p.floor);
  if (numeric !== null) return numeric;
  const label = normalizeLabel(p.floor_label);
  if (label === "demisol") return -1;
  if (label === "parter" || label === "parter inalt") return 0;
  const m = /^etaj (\d+)$/.exec(label);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------- locație

export function stripAdminPrefix(value: string): string {
  return value.replace(/^\s*(jude[tț]ul|jud\.?|municipiul|mun\.?|ora[sș]ul|ora[sș]|comuna)\s+/i, "").trim();
}

export function isBucharest(value: string | null | undefined): boolean {
  return /^bucuresti\b/.test(normalizeLabel(stripAdminPrefix(value ?? "")));
}

export function bucharestSector(...values: (string | null | undefined)[]): number | null {
  for (const v of values) {
    const m = /\bsector(?:ul)?\s*([1-6])\b/.exec(normalizeLabel(v));
    if (m) return Number(m[1]);
  }
  return null;
}

export function inRomania(lat: number, lng: number): boolean {
  return lat >= IMO24_BOUNDS.latMin && lat <= IMO24_BOUNDS.latMax && lng >= IMO24_BOUNDS.lngMin && lng <= IMO24_BOUNDS.lngMax;
}

// ---------------------------------------------------------------- text

export function htmlToText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Tăiere la cuvânt întreg, fără „...” și fără punctuație atârnată la final. */
export function cutAtWord(value: string, max: number): string {
  if (value.length <= max) return value;
  const slice = value.slice(0, max + 1);
  const space = slice.lastIndexOf(" ");
  const cut = space > 0 ? slice.slice(0, space) : value.slice(0, max);
  return cut.replace(/[\s,;:–—\-.…]+$/u, "").trim();
}

/** Tăiere la finalul ultimei propoziții încăpute; altfel la cuvânt. */
export function cutAtSentence(value: string, max: number): string {
  if (value.length <= max) return value;
  const slice = value.slice(0, max);
  const re = /[.!?](?=\s|$)/g;
  let end = -1;
  for (let m = re.exec(slice); m; m = re.exec(slice)) end = m.index + 1;
  if (end >= IMO24_DESCRIPTION_MIN) return slice.slice(0, end).trim();
  return cutAtWord(value, max);
}

export function imo24Title(p: Row): string {
  const base = htmlToText(p.title).replace(/\s+/g, " ").trim();
  let title = cutAtWord(base, IMO24_TITLE_MAX);
  if (title.length < IMO24_TITLE_MIN) {
    const type = TYPE_LABEL[(p.property_type ?? "").toLowerCase()] ?? "";
    const rooms = intOrNull(p.rooms);
    const roomsText =
      p.property_type === "apartment" && rooms && rooms > 0 ? `${rooms} ${rooms === 1 ? "cameră" : "camere"}` : "";
    const zone = (p.district ?? "").trim() || stripAdminPrefix((p.city ?? "").trim());
    const filler = [type, roomsText].filter(Boolean).join(" ");
    const parts = [title, filler, zone].filter(Boolean);
    // Fără repetiții: nu adăugăm tipul dacă titlul îl conține deja.
    const unique = parts.filter((part, i) => i === 0 || !normalizeLabel(title).includes(normalizeLabel(part)));
    title = cutAtWord(unique.join(unique.length > 1 && title ? " – " : " ").replace(/^ – /, ""), IMO24_TITLE_MAX);
  }
  return title;
}

export function imo24Description(p: Row): string {
  return cutAtSentence(htmlToText(p.description), IMO24_DESCRIPTION_MAX);
}

// ---------------------------------------------------------------- preț

export type Imo24Price =
  | { ok: true; pret: number; converted: boolean }
  | { ok: false; reason: string }
  | { ok: "pending"; warning: string };

const TX_LABEL: Record<Imo24Transaction, string> = { vanzare: "vânzare", inchiriere: "închiriere" };

export function imo24Price(p: Row, tx: Imo24Transaction, eurRonRate: number | null | undefined): Imo24Price {
  const raw = tx === "vanzare" ? (p.sale_price ?? p.price) : (p.rent_price ?? p.price);
  const currency = ((tx === "vanzare" ? p.sale_currency : p.rent_currency) ?? p.currency ?? "EUR").toUpperCase();
  const label = TX_LABEL[tx];
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return { ok: false, reason: `Lipsește prețul de ${label}.` };
  }
  let eur: number;
  let converted = false;
  if (currency === "EUR") {
    eur = Math.round(raw);
  } else if (currency === "RON") {
    if (eurRonRate === undefined) {
      return { ok: "pending", warning: `Prețul de ${label} este în lei: se convertește în EUR la cursul BNR din ziua publicării.` };
    }
    if (eurRonRate === null || !(eurRonRate > 0)) {
      return { ok: false, reason: `Prețul de ${label} este în lei și cursul BNR al zilei nu este disponibil.` };
    }
    eur = Math.round(raw / eurRonRate);
    converted = true;
  } else {
    return { ok: false, reason: `imo24.ro acceptă doar prețuri în EUR (sau în lei, convertite); prețul de ${label} este în ${currency}.` };
  }
  const min = IMO24_MIN_PRICE[tx];
  if (eur < min) {
    return {
      ok: false,
      reason: `Prețul de ${label} (${eur.toLocaleString("ro-RO")} €${converted ? ", convertit din lei" : ""}) este sub minimul imo24.ro de ${min.toLocaleString("ro-RO")} €.`,
    };
  }
  return { ok: true, pret: eur, converted };
}

/** `comision_zero` = comision 0 pentru cumpărător, doar dacă e notat explicit 0. */
export function imo24ZeroCommission(commission: string | null | undefined): boolean {
  const text = normalizeLabel(commission);
  if (!text) return false;
  return /^(comision )?0( (la suta|procent))?$/.test(text) || text === "fara comision" || text === "comision zero";
}

// ---------------------------------------------------------------- external_id

export function imo24ExternalId(p: Row, tx: Imo24Transaction): string {
  const base = ((p.reference ?? "").trim() || p.id).replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  const suffix = tx === "vanzare" ? "-v" : "-i";
  return `${base.slice(0, 64 - suffix.length)}${suffix}`;
}

// ---------------------------------------------------------------- dotări

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

export function imo24FeatureIds(p: Row, groups: Imo24FeatureGroup[] | null | undefined): number[] {
  if (!groups?.length) return [];
  const byLabel = new Map<string, number>();
  for (const g of groups) for (const d of g.dotari ?? []) {
    const key = normalizeLabel(d.nume);
    if (!key) continue;
    // Etichete duplicate în grupuri diferite = ambiguu → nu se trimite.
    byLabel.set(key, byLabel.has(key) && byLabel.get(key) !== d.id ? -1 : d.id);
  }
  const ids = new Set<number>();
  for (const label of habitooFeatureLabels(p)) {
    const id = byLabel.get(normalizeLabel(label));
    if (id && id > 0) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- mapare

export function mapPropertyToImo24(p: Row, options: Imo24MapOptions = {}): Imo24MapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const currentYear = options.currentYear ?? new Date().getFullYear();

  const transactions = imo24Transactions(p);
  if (transactions.length === 0) reasons.push("Bifează vânzare sau închiriere.");

  const category = imo24Category(p.property_type);
  if (!category) {
    const label = TYPE_LABEL[(p.property_type ?? "").toLowerCase()] ?? (p.property_type || "necunoscut");
    reasons.push(`imo24.ro nu are categorie pentru tipul „${label}”: se pot publica doar apartamente, garsoniere, case/vile, terenuri și spații comerciale.`);
  }
  const isApartment = category === "apartament";
  const isStudio = (p.property_type ?? "").toLowerCase() === "studio";

  // Apartament: camere + etaj.
  let camere: number | null = null;
  let etaj: number | null = null;
  if (isApartment) {
    const rooms = intOrNull(p.rooms);
    camere = isStudio ? 1 : rooms !== null && rooms >= 1 ? Math.min(rooms, 4) : null;
    if (camere === null) reasons.push("Completează numărul de camere (imo24.ro îl cere la apartamente).");
    etaj = imo24Floor(p);
    if (etaj === null) reasons.push("Completează etajul (imo24.ro îl cere la apartamente: demisol, parter sau 1–15).");
    else if (etaj > 15) reasons.push(`Etajul ${etaj} depășește maximul imo24.ro (etajul 15).`);
    else if (etaj < -1) reasons.push(`Etajul ${etaj} nu este acceptat de imo24.ro (minim demisol).`);
  }

  // Text.
  const titlu = imo24Title(p);
  if (titlu.length < IMO24_TITLE_MIN) reasons.push(`Titlul trebuie să aibă cel puțin ${IMO24_TITLE_MIN} caractere.`);
  const descriere = imo24Description(p);
  if (descriere.length < IMO24_DESCRIPTION_MIN) {
    reasons.push(`Descrierea trebuie să aibă cel puțin ${IMO24_DESCRIPTION_MIN} caractere (are ${descriere.length}).`);
  }

  // Locație.
  const countyRaw = stripAdminPrefix((p.county ?? "").trim());
  const cityRaw = (p.city ?? "").trim();
  const bucharest = isBucharest(countyRaw) || isBucharest(cityRaw);
  const judet = bucharest ? "București" : countyRaw;
  if (!judet) reasons.push("Completează județul.");
  let localitate: string | undefined;
  if (bucharest) {
    const sector = bucharestSector(cityRaw, p.district, p.address);
    if (sector) localitate = `Sector ${sector}`;
  } else {
    localitate = stripAdminPrefix(cityRaw) || undefined;
    if (!localitate) reasons.push("Completează localitatea.");
  }
  const coords = publicCoords({ id: p.id, lat: p.lat ?? null, lng: p.lng ?? null, location_precise: p.location_precise });
  if (!coords || (Math.abs(coords.lat) < 0.0001 && Math.abs(coords.lng) < 0.0001)) {
    reasons.push("Setează poziția pe hartă: imo24.ro cere coordonatele proprietății.");
  } else if (!inRomania(coords.lat, coords.lng)) {
    reasons.push("Poziția de pe hartă este în afara României: corecteaz-o înainte de publicare.");
  }
  const strada = (p.location_precise ? (p.street ?? p.address) : p.street)?.trim() || undefined;

  // Preț pe fiecare tranzacție.
  const prices = new Map<Imo24Transaction, number | null>();
  for (const tx of transactions) {
    const price = imo24Price(p, tx, options.eurRonRate);
    if (price.ok === true) prices.set(tx, price.pret);
    else if (price.ok === "pending") { prices.set(tx, null); warnings.push(price.warning); }
    else reasons.push(price.reason);
  }

  if (reasons.length > 0 || !category || !coords) return { ok: false, reasons, warnings };
  if (transactions.length === 2) warnings.push("Ambele tranzacții sunt active: se trimit două anunțuri (vânzare și închiriere).");

  // Câmpuri comune pe categorie.
  const enums = options.enumerations;
  const yearRaw = intOrNull(p.build_year);
  const year = yearRaw !== null && yearRaw >= 1800 && yearRaw <= currentYear + 3 ? yearRaw : null;
  const features = imo24FeatureIds(p, options.features);
  const surfaceUseful = intOrNull(p.usable_surface ?? p.surface ?? null);
  const surfaceLand = intOrNull(p.land_surface);

  const shared: Omit<Imo24Anunt, "external_id" | "tranzactie" | "pret"> = {
    categorie: category,
    titlu,
    descriere,
    moneda: "EUR",
    negociabil: p.negotiable === true,
    tva: p.vat_included === true,
    comision_zero: imo24ZeroCommission(p.commission),
    locatie: {
      judet,
      ...(localitate ? { localitate } : {}),
      ...(strada ? { strada } : {}),
      lat: coords.lat,
      lng: coords.lng,
    },
  };

  if (category === "apartament" || category === "casa" || category === "spatiu_comercial") {
    if (surfaceUseful && surfaceUseful >= 1 && surfaceUseful <= 100_000) shared.suprafata_utila = surfaceUseful;
  }
  if (category === "casa" || category === "teren") {
    if (surfaceLand && surfaceLand >= 1 && surfaceLand <= 10_000_000) shared.suprafata_teren = surfaceLand;
  }
  if (category === "apartament" || category === "casa") {
    const floors = intOrNull(p.building_floors);
    if (floors !== null && floors >= 1 && floors <= 15) shared.etaje_imobil = floors;
    if (year !== null) shared.an_constructie = year;
    shared.interval_constructie = fromDictionary("interval_constructie", imo24ConstructionInterval(year), enums);
    const balconies = intOrNull(p.balconies) ?? (p.balcony ? 1 : null);
    if (balconies !== null && balconies >= 0) shared.balcoane = Math.min(balconies, 5);
  }
  if (category === "apartament") {
    shared.camere = camere as number;
    shared.etaj = etaj as number;
    if (camere !== 1) {
      const baths = intOrNull(p.bathrooms);
      if (baths !== null && baths >= 0) shared.bai = Math.min(baths, 5);
    }
    const parking = intOrNull(p.parking_spaces);
    if (parking !== null && parking >= 0) shared.locuri_parcare = clamp(parking, 0, 5);
    shared.compartimentare = fromDictionary("compartimentare", LAYOUT[normalizeLabel(p.layout)] ?? null, enums);
    shared.confort = fromDictionary("confort", COMFORT[normalizeLabel(p.comfort)] ?? null, enums);
    shared.tip_imobil = fromDictionary("tip_imobil", BUILDING[normalizeLabel(p.building_type)] ?? null, enums);
    shared.stare_proprietate = fromDictionary("stare_proprietate", FINISH[normalizeLabel(p.finish_state)] ?? null, enums);
  }
  if (category === "casa") {
    const rooms = intOrNull(p.rooms);
    if (rooms !== null && rooms >= 1 && rooms <= 50) shared.nr_camere_casa = rooms;
  }
  if (category === "teren") {
    shared.tip_teren = fromDictionary("tip_teren", imo24LandType(p), enums);
    shared.clasificare_teren = fromDictionary("clasificare_teren", imo24LandClassification(p), enums);
  }
  if (options.features) shared.dotari = features;

  const bodies: Imo24Anunt[] = transactions.map((tx) => ({
    external_id: imo24ExternalId(p, tx),
    tranzactie: tx,
    pret: prices.get(tx) ?? 0,
    ...shared,
  }));
  return { ok: true, bodies, warnings };
}

/** Motivele blocante, pentru cardul imo24 din Publicare (fără curs/dicționare). */
export function imo24BlockingReasons(p: Row): string[] {
  const result = mapPropertyToImo24(p);
  return result.ok ? [] : result.reasons;
}
