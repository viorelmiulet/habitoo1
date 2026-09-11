/**
 * Taxonomia OferteImobiliare.ro (portal „Powered by ImmoFlux").
 *
 * Codurile de utilități / finisaje / dotări sunt EXACT taxonomia numerică
 * IMMOFLUX documentată public la https://oferteimobiliare.ro/integrare.
 * Habitoo păstrează internă taxonomia în text (vezi `property-taxonomy.ts`),
 * deci aici se face o singură traducere: etichetă românească → cod numeric.
 *
 * Regulă strictă: dacă o etichetă nu are cod documentat, NU se trimite nimic
 * pentru ea (nu inventăm coduri și nu aproximăm).
 */

/** Normalizare pentru potrivirea etichetelor: fără diacritice, lowercase. */
export function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ș|ş/gi, "s")
    .replace(/ț|ţ/gi, "t")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type CodeMap = Record<string, number>;

function codeMap(entries: Record<string, number>): CodeMap {
  const out: CodeMap = {};
  for (const [label, code] of Object.entries(entries)) out[normalizeLabel(label)] = code;
  return out;
}

/** Traduce o listă de etichete în coduri, ignorând ce nu are cod documentat. */
export function codesFor(map: CodeMap, labels: readonly (string | null | undefined)[]): number[] {
  const out: number[] = [];
  for (const label of labels) {
    if (!label) continue;
    const code = map[normalizeLabel(String(label))];
    if (code !== undefined && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Etichetele care NU au corespondent numeric (pentru avertismente în UI). */
export function unmappedLabels(map: CodeMap, labels: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const label of labels) {
    if (!label) continue;
    const text = String(label).trim();
    if (!text) continue;
    if (map[normalizeLabel(text)] === undefined && !out.includes(text)) out.push(text);
  }
  return out;
}

// ————————————————————————————— utilities —————————————————————————————

export const OI_UTILITIES_GENERAL = codeMap({
  "Curent electric": 10001,
  Curent: 10001,
  "Apă": 10002,
  Canalizare: 10003,
  Gaz: 10004,
  "Puț": 10005,
  "Fosă septică": 10006,
  "Curent trifazic": 10007,
  CATV: 10009,
  Telefon: 10010,
  "Telefon internațional": 10011,
  "Acces internet": 10012,
  "Fibră optică": 10013,
  "Utilități în zonă": 10015,
  "Sistem irigație": 10016,
});

export const OI_HEATING = codeMap({
  Termoficare: 10101,
  "Centrală proprie": 10102,
  "Centrală imobil": 10103,
  Convectoare: 10104,
  "Sobă teracotă": 10105,
  "Centrală pe lemne": 10106,
  "Încălzire pardoseală": 10107,
  Calorifere: 10108,
  Semineu: 10109,
  "Șemineu": 10109,
});

export const OI_COOLING = codeMap({
  "Aer condiționat": 10201,
  Ventiloconvectoare: 10202,
  Aeroterme: 10203,
});

// ————————————————————————————— finishes ——————————————————————————————

export const OI_INSULATION = codeMap({
  Exterior: 20001,
  Interior: 20002,
  "Bloc izolat termic": 20003,
});

export const OI_WALLS = codeMap({
  "Vopsea lavabilă": 20101,
  Var: 20102,
  "Faianță": 20103,
  Lambriu: 20104,
  Tapet: 20105,
  "Marmură": 20106,
  Huma: 20107,
  Vinarom: 20108,
});

export const OI_FLOORS = codeMap({
  Parchet: 20201,
  Gresie: 20202,
  "Marmură": 20203,
  "Mochetă": 20204,
  "Dușumea": 20205,
  Linoleum: 20206,
});

export const OI_FINISH_STAGE = codeMap({
  Finisat: 20301,
  Gri: 20302,
  "La gri": 20302,
  "Roșu": 20303,
  "La roșu": 20303,
  "Bună": 20304,
  "Necesită renovare": 20305,
  Renovat: 20306,
});

export const OI_WINDOWS = codeMap({ PVC: 20401, Lemn: 20402, Aluminiu: 20403 });
export const OI_BLINDS = codeMap({ Verticale: 20501, Orizontale: 20502 });
export const OI_SHUTTERS = codeMap({ Aluminiu: 20601, Lemn: 20602, PVC: 20603 });
export const OI_ENTRY_DOOR = codeMap({ Metal: 20701, Lemn: 20702, PVC: 20703, Pal: 20704 });
export const OI_INTERIOR_DOORS = codeMap({
  Celulare: 20901,
  Lemn: 20902,
  Panel: 20903,
  PVC: 20904,
  "Sticlă": 20905,
  Metal: 20906,
});

// ————————————————————————————— equipment —————————————————————————————

export const OI_SPACES = codeMap({
  "Terasă": 30001,
  "WC serviciu": 30002,
  "Boxă la subsol": 30003,
  Debara: 30004,
  "Pivniță": 30011,
  "Cramă": 30012,
  "Spațiu depozitare": 30013,
  Dressing: 30014,
  Anexe: 30016,
  Dependințe: 30017,
});

export const OI_KITCHEN = codeMap({
  "Mobilată": 30101,
  "Parțial mobilată": 30102,
  "Utilată": 30103,
  "Parțial utilată": 30104,
  "Nemobilată": 30105,
  "Neutilată": 30106,
});

export const OI_METERING = codeMap({
  Apometre: 30201,
  "Contor căldură": 30202,
  "Contor gaz": 30203,
});

export const OI_FURNITURE_EQUIPMENT = codeMap({
  Nemobilat: 30301,
  "Parțial": 30302,
  Complet: 30303,
  Lux: 30304,
});

export const OI_BUILDING = codeMap({
  Interfon: 30401,
  Videointerfon: 30402,
  Lift: 30403,
  "Spații agrement": 30404,
  Sauna: 30405,
  SPA: 30406,
  "Acoperiș": 30407,
  Curte: 30408,
  "Curte comună": 30409,
  "Grădină": 30410,
  "Piscină interioară": 30411,
  "Piscină exterioară": 30412,
  "Uscătorie": 30413,
});

export const OI_APPLIANCES = codeMap({
  "Mașină de spălat rufe": 30506,
  Frigider: 30508,
  Aragaz: 30510,
  "Mașină de spălat vase": 30512,
  "Fier de călcat": 30501,
  TV: 30515,
  "Cafetieră": 30502,
  "Uscător păr": 30503,
  Toaster: 30504,
  DVD: 30505,
  "Sandwich-maker": 30507,
  "Cuptor microunde": 30509,
  "Hotă": 30511,
  "Robot bucătărie": 30513,
  Aspirator: 30514,
  "HI-FI": 30516,
});

export const OI_MISC = codeMap({
  Jacuzzi: 30601,
  "Scară interioară": 30602,
  "Șemineu": 30603,
  "Senzor de fum": 30604,
  "Sistem de alarmă": 30605,
  "Telecomandă poartă garaj": 30606,
  "Telecomandă poartă acces auto": 30607,
});

// ————————————————————— câmpuri cu valoare unică —————————————————————

export const OI_TRANSACTION = { sale: 1, rent: 2 } as const;

export type OiTransaction = keyof typeof OI_TRANSACTION;

/** category_id: 1 Apartament, 2 Casă/Vilă, 3 Teren, 4 Birou, 5 Comercial, 6 Industrial. */
const CATEGORY_BY_TYPE: Record<string, number> = {
  apartment: 1,
  apartament: 1,
  studio: 1,
  garsoniera: 1,
  penthouse: 1,
  duplex: 1,
  house: 2,
  casa: 2,
  villa: 2,
  vila: 2,
  land: 3,
  teren: 3,
  office: 4,
  birou: 4,
  birouri: 4,
  commercial: 5,
  retail: 5,
  "spatiu comercial": 5,
  warehouse: 6,
  hala: 6,
  depozit: 6,
  industrial: 6,
};

const SUBCATEGORY_BY_TYPE: Record<string, number> = {
  apartment: 101,
  apartament: 101,
  studio: 102,
  garsoniera: 102,
  penthouse: 103,
  duplex: 104,
  house: 201,
  casa: 201,
  villa: 201,
  vila: 201,
};

/** Subcategoriile de teren, după categoria textuală a ofertei. */
const LAND_SUBCATEGORY = codeMap({
  "Construcții": 301,
  Construcibil: 301,
  Agricol: 302,
  "Pădure": 303,
  "Livadă": 304,
  "Pășune": 305,
  "Fâneață": 306,
  "Heleșteu": 307,
});

export function oiCategoryId(propertyType: string | null): number | null {
  if (!propertyType) return null;
  return CATEGORY_BY_TYPE[normalizeLabel(propertyType)] ?? null;
}

export function oiSubcategoryId(propertyType: string | null, category: string | null): number | null {
  if (!propertyType) return null;
  const key = normalizeLabel(propertyType);
  if (CATEGORY_BY_TYPE[key] === 3) {
    return category ? (LAND_SUBCATEGORY[normalizeLabel(category)] ?? 301) : 301;
  }
  return SUBCATEGORY_BY_TYPE[key] ?? null;
}

export const OI_CURRENCY: Record<string, number> = { EUR: 1, RON: 2, USD: 3, CHF: 4 };

export const OI_COMFORT = codeMap({ "1": 1, "2": 2, "3": 3, Lux: 4 });

export const OI_PARTITIONING = codeMap({
  Decomandat: 1,
  Semidecomandat: 2,
  Nedecomandat: 3,
  Circular: 4,
  Vagon: 5,
  Comandat: 6,
  Duplex: 7,
});

export const OI_FURNITURE = codeMap({
  Complet: 1,
  Mobilat: 1,
  "Parțial": 2,
  Semimobilat: 2,
  Nemobilat: 3,
  Lux: 4,
});

export const OI_ORIENTATION = codeMap({
  Nord: 1,
  "Nord-Est": 2,
  Est: 3,
  "Sud-Est": 4,
  Sud: 5,
  "Sud-Vest": 6,
  Vest: 7,
  "Nord-Vest": 8,
  "Nord-Sud": 9,
});

export const OI_BUILDING_TYPE = codeMap({
  Bloc: 1,
  "Casă": 2,
  "Vilă": 2,
  "Casă/Vilă": 2,
  "Imobil de birouri": 8,
  "Clădire birouri": 8,
  "Hală": 4,
  "Centru comercial": 5,
  Depozit: 6,
  Stradal: 7,
  Hotel: 9,
});

export const OI_BUILDING_STRUCTURE = codeMap({
  "Cărămidă": 1,
  Beton: 6,
  BCA: 2,
  "Plăci": 3,
  Prefabricate: 3,
  Lemn: 4,
  Metal: 5,
  Altele: 7,
  "Mixtă": 7,
});

export const OI_LAND_CLASSIFICATION = codeMap({ Intravilan: 1, Extravilan: 2 });

/**
 * floor: 2 Demisol, 3 Parter, 10·n pentru Etaj n (n ≤ 24), 1000 Mansardă,
 * 1001 Ultimele 2 etaje. Eticheta textuală are prioritate față de numărul brut.
 */
export function oiFloor(input: { floorLabel: string | null; floor: number | null }): number | null {
  const label = input.floorLabel ? normalizeLabel(input.floorLabel) : "";
  if (label) {
    if (label === "demisol") return 2;
    if (label === "parter" || label === "parter inalt") return 3;
    if (label === "mansarda") return 1000;
    if (label === "penultimul etaj" || label === "ultimul etaj") return 1001;
    const match = /^etaj (\d+)/.exec(label);
    if (match) {
      const level = Number(match[1]);
      if (level >= 1 && level <= 24) return level * 10;
      if (level > 24) return 240;
    }
  }
  const numeric = input.floor;
  if (typeof numeric === "number" && Number.isFinite(numeric)) {
    if (numeric === 0) return 3;
    if (numeric < 0) return 2;
    if (numeric >= 1 && numeric <= 24) return numeric * 10;
    if (numeric > 24) return 240;
  }
  return null;
}
