/**
 * Fapte explicite citite determinist din textele agentului (română) și
 * deducții logice sigure. Pur, fără AI: completează doar ce e scris clar.
 */
import { FLOOR_LABEL_NUMBER, syncFloor } from "@/lib/property-floor";
import { isAutofillFieldEmpty } from "./empty";

export function plainRo(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

const WORD_NUMBERS: Record<string, number> = {
  un: 1, unu: 1, una: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10,
  unsprezece: 11, doisprezece: 12, douasprezece: 12, treisprezece: 13, paisprezece: 14, cincisprezece: 15,
  saisprezece: 16, saptesprezece: 17, optsprezece: 18, nouasprezece: 19, douazeci: 20,
};

/** Text normalizat: fără diacritice, numere lipite („75.000” → „75000”), numerale în cifre. */
export function normalizeFactsText(text: string): string {
  return plainRo(text)
    .replace(/(\d)[.\s](?=\d{3}\b)/g, "$1")
    .replace(/\b([a-z]+)\b/g, (w) => (w in WORD_NUMBERS ? String(WORD_NUMBERS[w]) : w));
}

export type StatedFacts = Partial<{
  floor: number;
  floor_label: string;
  building_floors: number;
  usable_surface: number;
  built_surface: number;
  land_surface: number;
  garden_surface: number;
  balcony_surface: number;
  terrace_surface: number;
  build_year: number;
  renovation_year: number;
  rooms: number;
  bedrooms: number;
  property_type: string;
}>;

function floorLabelFor(floor: number): string | null {
  if (floor >= 10) return "Etaj 10+";
  return syncFloor(null, floor).floor_label;
}

const num = (s: string) => Number(s.replace(",", "."));

/** Extrage faptele explicite (etaj, suprafețe, an) dintr-un text. */
export function extractStatedFacts(text: string): StatedFacts {
  const t = normalizeFactsText(text);
  const f: StatedFacts = {};
  if (!t) return f;

  // Etaj
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(?:p|parter)\s*\/\s*(\d{1,2})\b/))) { f.floor = 0; f.building_floors = Number(m[1]); }
  else if ((m = t.match(/\b(?:d|demisol)\s*\/\s*(\d{1,2})\b/))) { f.floor = -1; f.building_floors = Number(m[1]); }
  else if ((m = t.match(/\b(?:etajul|etaj|et\.?)\s*(\d{1,2})\s*(?:\/|din)\s*(\d{1,2})\b/))) { f.floor = Number(m[1]); f.building_floors = Number(m[2]); }
  else if ((m = t.match(/\b(?:etajul|etaj|et\.?)\s*(\d{1,2})\b(?!\s*etaje)/))) f.floor = Number(m[1]);
  else if ((m = t.match(/(?:^|[^\d/.])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/.])/)) && Number(m[1]) <= Number(m[2]) && Number(m[2]) <= 60) {
    f.floor = Number(m[1]); f.building_floors = Number(m[2]);
  }
  if (f.building_floors === undefined) {
    if ((m = t.match(/\bp\s*\+\s*(\d{1,2})\b/))) f.building_floors = Number(m[1]);
    else if ((m = t.match(/\b(?:din|cu|are)\s*(\d{1,2})\s*etaje\b/))) f.building_floors = Number(m[1]);
  }
  if (f.floor === undefined) {
    if (/\bparter inalt\b/.test(t)) { f.floor = 0; f.floor_label = "Parter înalt"; }
    else if (/\bparter\b/.test(t)) f.floor = 0;
    else if (/\bdemisol\b/.test(t)) f.floor = -1;
    else if (/\bmansarda\b/.test(t)) f.floor_label = "Mansardă";
    else if (/\bultimul etaj\b/.test(t) && f.building_floors !== undefined) { f.floor = f.building_floors; f.floor_label = "Ultimul etaj"; }
  }
  if (f.floor !== undefined && f.floor_label === undefined) {
    const label = floorLabelFor(f.floor);
    if (label) f.floor_label = label;
  }

  // Suprafețe
  for (const sm of t.matchAll(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:mp|m2|m²|metri patrati)(?![a-z0-9])/g)) {
    const at = sm.index ?? 0;
    const before = t.slice(Math.max(0, at - 25), at);
    const after = t.slice(at + sm[0].length, at + sm[0].length + 15);
    const v = num(sm[1]!);
    const near = (word: string) => new RegExp(`${word}\\w*\\s*(?:de\\s*|:\\s*)?$`).test(before) || new RegExp(`^\\s*(?:de\\s*)?${word}`).test(after);
    const key = /^\s*util/.test(after) ? "usable_surface"
      : near("teren") ? "land_surface"
      : near("gradin") ? "garden_surface"
      : near("balcon") ? "balcony_surface"
      : near("teras") ? "terrace_surface"
      : near("constru") ? "built_surface" : "usable_surface";
    if (f[key] === undefined) f[key] = v;
  }

  // An
  for (const ym of t.matchAll(/\b(bloc|constructie|construit|construita|finalizat|finalizata|renovat|renovata|renovare|an|anul|din)\b[^\d]{0,15}((?:18|19|20)\d{2})\b/g)) {
    const year = Number(ym[2]);
    if (year > new Date().getFullYear() + 5) continue;
    if (/^renov/.test(ym[1]!)) { if (f.renovation_year === undefined) f.renovation_year = year; }
    else if (f.build_year === undefined) f.build_year = year;
  }

  // Camere
  if ((m = t.match(/\b(\d{1,2})\s*(?:camere|camera|cam)\b\.?/))) f.rooms = Number(m[1]);
  else if (/\b(?:garsonier\w*|studio)\b/.test(t)) f.rooms = 1;
  if ((m = t.match(/\b(\d{1,2})\s*(?:dormitoare|dormitor|dorm)\b\.?/))) f.bedrooms = Number(m[1]);
  const types = [...new Set(TYPE_WORDS.filter(([re]) => re.test(t)).map(([, key]) => key))];
  if (types.includes("studio")) f.property_type = "studio";
  else if (types.length === 1) f.property_type = types[0];
  return f;
}

/** Numărul apare explicit în text (cifre, „75 mii” sau cu litere). */
export function numberStatedIn(text: string, value: number): boolean {
  const normalized = normalizeFactsText(text);
  const variants = new Set([String(value), String(value).replace(".", ",")]);
  if (value >= 1000 && value % 1000 === 0) variants.add(`${value / 1000} mii`);
  return [...variants].some((v) => new RegExp(`(^|[^\\d])${v.replace(".", "\\.")}([^\\d]|$)`).test(normalized));
}

const TYPE_WORDS: [RegExp, string][] = [
  [/\b(?:garsonier\w*|studio)\b/, "studio"],
  [/\b(?:apartament\w*|ap)\b/, "apartment"],
  [/\b(casa|vila|case|vile)\b/, "house"],
  [/\bteren\b/, "land"],
  [/\bspatiu comercial\b/, "commercial"],
  [/\bbirou\b/, "office"],
];

/**
 * Deducții sigure pe câmpuri goale. `known` = valorile deja în formular plus cele propuse.
 * Întoarce doar câmpurile noi.
 */
export function deriveAutofillValues(known: Record<string, unknown>, text: string): Record<string, string | number | boolean> {
  const t = normalizeFactsText(text);
  const empty = (k: string) => isAutofillFieldEmpty(known, k);
  const out: Record<string, string | number | boolean> = {};
  const put = (k: string, v: string | number | boolean) => { if (empty(k) && !(k in out)) out[k] = v; };

  const label = typeof known["floor_label"] === "string" ? (known["floor_label"] as string) : null;
  const floor = typeof known["floor"] === "number" ? (known["floor"] as number) : null;
  if (label && floor === null) {
    const fixed = (FLOOR_LABEL_NUMBER as Record<string, number | null | undefined>)[label];
    if (typeof fixed === "number") put("floor", fixed);
    else if (label === "Ultimul etaj" && typeof known["building_floors"] === "number") put("floor", known["building_floors"] as number);
  }
  if (floor !== null && !label) { const l = floorLabelFor(floor); if (l) put("floor_label", l); }

  const types = [...new Set(TYPE_WORDS.filter(([re]) => re.test(t)).map(([, k]) => k))];
  const type = types.includes("studio") ? "studio" : types.length === 1 ? types[0] : null;
  const effectiveType = types.includes("house") ? "house" : known["property_type"] || type;
  const stated = extractStatedFacts(text);
  if (stated.rooms !== undefined) put("rooms", stated.rooms);
  if (stated.bedrooms !== undefined) put("bedrooms", stated.bedrooms);
  if (effectiveType === "studio") {
    put("rooms", 1);
    put("bedrooms", 1);
  } else if (effectiveType === "apartment") {
    const rooms = empty("rooms") ? out["rooms"] : known["rooms"];
    const bedrooms = empty("bedrooms") ? out["bedrooms"] : known["bedrooms"];
    if (typeof rooms === "number" && rooms >= 2) put("bedrooms", rooms - 1);
    if (typeof bedrooms === "number" && bedrooms >= 1) put("rooms", bedrooms + 1);
  }
  if (typeof known["balconies"] === "number" && (known["balconies"] as number) > 0 && known["balcony"] !== true) out["balcony"] = true;

  if (typeof known["price"] === "number") {
    const eur = /\b(euro|eur)\b|€/.test(t);
    const ron = /\b(lei|ron)\b/.test(t);
    if (eur !== ron) put("currency", eur ? "EUR" : "RON");
  }
  if (typeof known["usable_surface"] === "number" && typeof known["balcony_surface"] === "number") {
    put("total_usable_surface", Math.round(((known["usable_surface"] as number) + (known["balcony_surface"] as number)) * 100) / 100);
  }
  const sale = /\b(vanzare|vand|vinde)\b/.test(t);
  const rent = /\b(inchiriere|chirie|inchiriat|inchiriez)\b/.test(t);
  if (sale !== rent) put("transaction", sale ? "sale" : "rent");

  if (type) put("property_type", type);
  return out;
}
