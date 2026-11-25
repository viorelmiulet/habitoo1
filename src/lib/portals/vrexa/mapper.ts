/**
 * Vrexa.ro: mapper pur Habitoo → corpul JSON al unui anunț Vrexa (Partner API v1).
 * Schema Vrexa are `additionalProperties: false`: se trimit doar câmpurile din listele de mai jos.
 * `images` nu face parte din mapper (se adaugă la publicare). Fără rețea, fără DB.
 */
import { publicCoords } from "@/lib/geo";
import { htmlToText, normalizeLabel } from "@/lib/portals/imo24/mapper";

type Row = Record<string, unknown> & { id: string };
export type VrexaType = "apartment" | "house" | "plot" | "commercial";
export type VrexaTransaction = "sale" | "rent";
export type VrexaBody = Record<string, unknown>;
export type VrexaMapContext = {
  agent: { name: string | null; email: string | null; phone: string | null } | null;
  /** Lei pentru 1 EUR (cursul BNR). `undefined` = încă necunoscut (previzualizare). */
  eurRonRate?: number | null;
};
export type VrexaMapResult =
  | { ok: true; listings: { transaction: VrexaTransaction; body: VrexaBody }[]; warnings: string[] }
  | { ok: false; reasons: string[]; warnings: string[] };

// ---------------------------------------------------------------- schema (câmpurile permise)

const COMMON_KEYS = ["type", "transaction", "title", "description", "price", "currency", "vatIncluded", "noCommission", "location", "contact"] as const;
const RES_OPTIONAL = ["centralHeatingPowerSource", "convectorPowerSource", "heatDistribution", "petFriendly", "energyClass", "parkingType", "seismicRisk", "builtArea", "availableFrom", "deposit", "minRentalMonths", "monthlyCosts", "parkingIncluded", "allowForeigns", "allowSmoking"];
const RES_REQUIRED = ["totalRooms", "totalBathrooms", "buildYear", "totalParkingSpaces", "buildingServices", "refurbishStatus", "airConditioning", "heatingType", "furnishing", "utilities"];
export const VREXA_ALLOWED_KEYS: Record<VrexaType, ReadonlySet<string>> = {
  apartment: new Set([...COMMON_KEYS, ...RES_REQUIRED, "floor", "totalFloors", "partitioning", "comfort", "usableArea", "buildingType", "balconies", "commonYard", "elevator", ...RES_OPTIONAL]),
  house: new Set([...COMMON_KEYS, ...RES_REQUIRED, "houseType", "totalFloors", "plotArea", "usableArea", "basement", "semibasement", "attic", "pool", "passiveHouse", "yard", "garden", ...RES_OPTIONAL, "totalFloorArea", "constructionMaterial", "legalStatus"]),
  plot: new Set([...COMMON_KEYS, "plotType", "plotClassification", "streetFrontage", "plotArea", "utilities", "fenced", "accessType", "surroundings", "pot", "cut", "maxHeight", "legalStatus", "planningStatus", "depth", "slope"]),
  commercial: new Set([...COMMON_KEYS, "category", "floor", "usableArea", "utilities", "refurbishStatus", "serviceCharge", "energyClass", "totalParkingSpaces", "airConditioning", "heatingType", "officeClass", "streetFrontage", "shopWindow", "clearHeight", "loadingDocks", "hotelRooms"]),
};

// ---------------------------------------------------------------- tabele de corespondență (etichete normalizate)

const TYPE: Record<string, VrexaType> = {
  apartment: "apartment", studio: "apartment", penthouse: "apartment", duplex: "house",
  house: "house", villa: "house", land: "plot",
  office: "commercial", commercial: "commercial", industrial: "commercial", hotel: "commercial",
};
const COMMERCIAL_CATEGORY: Record<string, string> = { office: "office", commercial: "commercial", industrial: "industrial", hotel: "hotelOrGuesthouse" };
/** PROVIZORIU până confirmă Vrexa corespondența stărilor. */
export const VREXA_REFURBISH_PROVISIONAL: Record<string, string> = {
  renovat: "refurbished", "de renovat": "needsRefurbish", "necesita renovare": "needsRefurbish",
  ultrafinisat: "premiumFinishes", lux: "luxury", finisat: "refurbished", buna: "refurbished", semifinisat: "notRefurbished",
};
const COOLING: Record<string, string> = { "aer conditionat": "airConditioning", ventiloconvectoare: "fanCoils", aeroterme: "heaters" };
const HEATING: Record<string, string> = {
  "centrala imobil": "buildingCentralHeating", "centrala proprie": "ownCentralHeating", "centrala pe lemne": "ownCentralHeating",
  convectoare: "convector", "panouri radiante": "infraredPanels", "panouri infrarosu": "infraredPanels",
  termoficare: "heating", "pompa de caldura": "heatPump",
};
const HEAT_DISTRIBUTION: Record<string, string> = { calorifere: "radiators", "incalzire pardoseala": "underfloorHeating" };
const FURNISHING: Record<string, string> = { nemobilat: "unfurnished", partial: "partiallyFurnished", complet: "fullyFurnished" };
const PARTITIONING: Record<string, string> = { decomandat: "partitioned", semidecomandat: "semiPartitioned", nedecomandat: "unPartitioned", circular: "circularPartitioning", "open space": "openSpace" };
const COMFORT: Record<string, string> = { "1": "one", "2": "two", "3": "three", lux: "luxury" };
const BUILDING_TYPE: Record<string, string> = { bloc: "block", "ansamblu rezidential": "block", casa: "vila", vila: "vila" };
const UTILITY: Record<string, string> = { apa: "water", canalizare: "sewer", gaz: "gas", "curent electric": "electricity" };
const SERVICES: Record<string, string> = { administrare: "administration", administrator: "administration", curatenie: "housekeeping", paza: "security", "supraveghere video": "videoSurveillance" };
const PARKING_TYPE: Record<string, string> = { "parcare subterana": "underground", "parcare supraterana": "outdoor", garaj: "garage" };
const SEISMIC: Record<string, string> = { "clasa rsi": "rsI", "clasa rsii": "rsII", "clasa rsiii": "rsIII", "clasa rsiv": "rsIV", neexpertizat: "notAssessed" };
const MATERIAL: Record<string, string> = { caramida: "brick", beton: "monolithic", prefabricate: "prefabricated", lemn: "timber", bca: "aac" };
const PLOT_TYPE: Record<string, string> = { constructii: "constructionLand", construibil: "constructionLand", agricol: "agriculturalLand", agricola: "agriculturalLand", padure: "forest", livada: "orchard", faneata: "meadow", pasune: "pasture", iaz: "pond", heleșteu: "pond", helesteu: "pond" };
const PLOT_CLASS: Record<string, string> = { intravilan: "urbanArea", extravilan: "nonUrbanArea" };
const ACCESS: Record<string, string> = { asfaltate: "asphaltRoad", betonate: "pavedRoad", pietruite: "pavedRoad", neamenajate: "dirtRoad" };
const SURROUNDINGS: Record<string, string> = { "spre padure": "forest", "spre lac": "lake", "spre munte": "mountains", "spre mare": "sea" };
const HOUSE_TYPE: Record<string, string> = { duplex: "duplex", triplex: "triplex", individuala: "detached", cuplata: "semiDetached", insiruita: "terraced", bungalow: "bungalow", conac: "mansion", cabana: "cottage", ferma: "farmhouse" };

// ---------------------------------------------------------------- utilitare pure

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const look = (t: Record<string, string>, v: unknown): string | null => t[normalizeLabel(str(v))] ?? null;
const inRange = (n: number | null, min: number, max: number): number | null => (n !== null && n >= min && n <= max ? n : null);
const has = (values: string[], ...labels: string[]) => {
  const set = new Set(values.map((v) => normalizeLabel(v)));
  return labels.some((l) => set.has(normalizeLabel(l)));
};
const mapList = (values: string[], t: Record<string, string>) => [...new Set(values.map((v) => t[normalizeLabel(v)]).filter((x): x is string => !!x))];

export function vrexaShorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > 0 ? cut.slice(0, at) : text.slice(0, max)).replace(/[\s,;:.-]+$/, "");
}

/** Doar litere, cifre, spațiu și `,.-()+/#'"&:°`. */
export function vrexaCleanAddress(text: string): string {
  return text.replace(/[^\p{L}\p{N} ,.\-()+/#'"&:°]/gu, "").replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}
/** Doar litere (inclusiv diacritice), spațiu și cratimă. */
export function vrexaCleanName(text: string): string {
  return text.replace(/[^\p{L} -]/gu, "").replace(/\s+/g, " ").trim();
}
/** Doar cifre și `.+() `. */
export function vrexaCleanPhone(text: string): string {
  return text.replace(/[^0-9.+() ]/g, "").trim();
}

/** Valori confirmate de Vrexa la 2026-11-25: subsol -2, demisol -1, parter 0, mansardă 101. */
export function vrexaFloor(label: unknown, floor: unknown): number | null {
  const l = normalizeLabel(str(label));
  if (l === "subsol") return -2;
  if (l === "demisol") return -1;
  if (l === "mansarda") return 101;
  if (l === "parter" || l === "parter inalt") return 0;
  const n = num(floor);
  // normalizeLabel elimină „+”; verifică eticheta originală înainte de „Etaj 10”.
  if (l === "etaj 10" && str(label).includes("+")) return n !== null && n >= 10 ? n : null;
  const m = /^etaj (\d+)$/.exec(l);
  if (m) return Number(m[1]);
  if (/^etaj 10/.test(l)) return n !== null && n >= 10 ? n : null;
  if (!l && n !== null && Number.isInteger(n) && n >= 0) return n;
  return null;
}

// ---------------------------------------------------------------- mapare

export function mapPropertyToVrexa(p: Row, ctx: VrexaMapContext): VrexaMapResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const typeKey = str(p.property_type).trim().toLowerCase();
  const type = TYPE[typeKey] ?? null;
  if (!type) return { ok: false, reasons: [`Tipul de proprietate „${str(p.property_type) || "necompletat"}” nu are corespondent la Vrexa.`], warnings };

  const b: VrexaBody = { type };
  const need = (key: string, value: unknown, what: string) => {
    if (value === null || value === undefined || value === "") reasons.push(`Completează ${what} pentru Vrexa.`);
    else b[key] = value;
  };
  const put = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") b[key] = value;
  };

  // Text.
  let title = htmlToText(str(p.title)).replace(/\s+/g, " ").trim();
  if (title.length > 100) { title = vrexaShorten(title, 100); warnings.push("Titlul are peste 100 de caractere și a fost scurtat pentru Vrexa."); }
  if (title.length < 10) reasons.push("Titlul trebuie să aibă cel puțin 10 caractere pentru Vrexa.");
  else b.title = title;
  let description = htmlToText(str(p.description)).trim();
  if (description.length < 50) reasons.push("Descrierea trebuie să aibă cel puțin 50 de caractere pentru Vrexa.");
  else {
    if (description.length > 10000) { description = vrexaShorten(description, 10000); warnings.push("Descrierea are peste 10000 de caractere și a fost scurtată pentru Vrexa."); }
    b.description = description;
  }

  if (p.vat_included === true) b.vatIncluded = true;
  b.noCommission = /^\s*0+(?:[.,]0+)?\s*%?\s*$/.test(str(p.commission));

  // Locație.
  const precise = p.location_precise === true;
  const street = [str(p.street).trim(), precise ? str(p.street_number).trim() : ""].filter(Boolean).join(" ");
  const address = vrexaCleanAddress([street, str(p.district), str(p.city), str(p.county)].map((s) => s.trim()).filter(Boolean).join(", "));
  const coords = publicCoords({ id: p.id, lat: num(p.lat), lng: num(p.lng), location_precise: precise });
  if (!coords) reasons.push("Completează poziția pe hartă pentru Vrexa.");
  if (address.length < 10) reasons.push("Adresa (stradă, cartier, localitate, județ) are sub 10 caractere pentru Vrexa.");
  if (coords && address.length >= 10) b.location = { address: vrexaShorten(address, 200), latitude: coords.lat, longitude: coords.lng };

  // Contact.
  const name = vrexaCleanName(ctx.agent?.name ?? "").slice(0, 100).trim();
  const email = (ctx.agent?.email ?? "").trim();
  const phone = vrexaCleanPhone(ctx.agent?.phone ?? "");
  const contactBad: string[] = [];
  if (name.length < 3) contactBad.push("numele");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) contactBad.push("emailul");
  if (phone.length < 5 || phone.length > 20) contactBad.push("telefonul");
  if (contactBad.length) reasons.push(`Completează ${contactBad.join(", ")} agentului responsabil pentru Vrexa.`);
  else b.contact = { name, email, phone };

  // Valori comune.
  const utilities = mapList(list(p.utilities), UTILITY);
  const amenities = [...list(p.building_amenities), ...list(p.features)];
  const heatingValues = [...list(p.heating_systems), str(p.heating)].filter(Boolean);
  const refurbish = look(VREXA_REFURBISH_PROVISIONAL, p.finish_state);
  const rooms = typeKey === "studio" ? 1 : inRange(num(p.rooms), 1, 50);
  const year = inRange(num(p.build_year), 1900, 2100);
  const parking = num(p.parking_spaces);
  const floor = vrexaFloor(p.floor_label, p.floor);
  const needFloor = () => {
    need("floor", floor !== null && Number.isInteger(floor) ? inRange(floor, -2, 101) : null, "etajul");
  };
  const energy = /^[a-g]$/i.test(str(p.energy_class).trim().charAt(0)) && str(p.energy_class).trim().length <= 2 ? str(p.energy_class).trim().charAt(0).toLowerCase() : null;

  const residential = () => {
    need("totalRooms", rooms, "numărul de camere");
    need("totalBathrooms", inRange(num(p.bathrooms), 0, 20), "numărul de băi");
    need("buildYear", year, "anul construcției (1900–2100)");
    b.totalParkingSpaces = inRange(parking, 0, 50) ?? 0;
    b.buildingServices = mapList(amenities, SERVICES);
    need("refurbishStatus", refurbish, "starea finisajelor");
    const cooling = mapList(list(p.cooling_systems), COOLING)[0] ?? null;
    b.airConditioning = cooling ?? "noAirConditioning";
    need("heatingType", mapList(heatingValues, HEATING)[0] ?? null, "tipul de încălzire");
    need("furnishing", look(FURNISHING, p.furnishing), "mobilarea");
    b.utilities = utilities;
    put("heatDistribution", mapList(heatingValues, HEAT_DISTRIBUTION)[0] ?? null);
    if (p.pet_friendly === true) b.petFriendly = true;
    put("energyClass", energy);
    put("parkingType", look(PARKING_TYPE, p.parking));
    put("seismicRisk", look(SEISMIC, p.seismic_risk));
  };

  if (type === "apartment") {
    residential();
    needFloor();
    need("totalFloors", inRange(num(p.building_floors), 1, 100), "numărul de niveluri ale clădirii");
    need("partitioning", look(PARTITIONING, p.layout), "compartimentarea");
    need("comfort", look(COMFORT, p.comfort), "confortul");
    need("usableArea", inRange(num(p.usable_surface ?? p.surface), 1, 2000), "suprafața utilă");
    need("buildingType", look(BUILDING_TYPE, p.building_type), "tipul clădirii (bloc sau vilă)");
    b.balconies = inRange(num(p.balconies), 0, 20) ?? 0;
    b.commonYard = has(amenities, "Curte comună");
    b.elevator = has(amenities, "Lift");
    put("builtArea", inRange(num(p.built_surface), 1, 5000));
  } else if (type === "house") {
    residential();
    need("houseType", look(HOUSE_TYPE, p.category) ?? (typeKey === "duplex" ? "duplex" : null), "tipul casei (individuală, cuplată, înșiruită, duplex etc.)");
    need("totalFloors", inRange(num(p.building_floors), 1, 10), "numărul de niveluri");
    need("plotArea", inRange(num(p.land_surface), 1, 100000), "suprafața terenului");
    need("usableArea", inRange(num(p.usable_surface ?? p.surface), 1, 10000), "suprafața utilă");
    b.basement = p.has_basement === true;
    b.semibasement = p.has_semi_basement === true;
    b.attic = p.has_attic === true || p.has_loft === true;
    b.pool = has(amenities, "Piscină interioară", "Piscină exterioară");
    b.passiveHouse = false;
    b.yard = has(amenities, "Curte", "Curte comună");
    b.garden = has(amenities, "Grădină") || (num(p.garden_surface) ?? 0) > 0;
    put("builtArea", inRange(num(p.built_surface), 1, 20000));
    put("constructionMaterial", look(MATERIAL, p.building_structure));
  } else if (type === "plot") {
    need("plotType", look(PLOT_TYPE, p.destination) ?? look(PLOT_TYPE, p.category), "tipul terenului (construibil, agricol etc.)");
    need("plotClassification", look(PLOT_CLASS, p.land_classification), "clasificarea terenului (intravilan/extravilan)");
    const frontage = num(p.street_frontage);
    if (frontage !== null && frontage >= 0) b.streetFrontage = Math.round(frontage);
    else reasons.push("Vrexa cere frontul stradal (metri) la terenuri, iar fișa proprietății nu are încă acest câmp.");
    need("plotArea", inRange(num(p.land_surface ?? p.surface), 1, 100000), "suprafața terenului");
    b.utilities = utilities;
    b.fenced = has([...list(p.features), ...list(p.misc_features)], "Împrejmuit", "Teren împrejmuit");
    need("accessType", mapList(list(p.street_arrangement), ACCESS)[0] ?? null, "amenajarea străzii (asfaltată, betonată, pietruită, neamenajată)");
    b.surroundings = mapList(list(p.views), SURROUNDINGS);
  } else {
    b.category = COMMERCIAL_CATEGORY[typeKey];
    needFloor();
    need("usableArea", inRange(num(p.usable_surface ?? p.surface), 1, 10000), "suprafața utilă");
    b.utilities = utilities;
    need("refurbishStatus", refurbish, "starea finisajelor");
    put("energyClass", energy);
    if (parking !== null && parking >= 0) b.totalParkingSpaces = Math.round(parking);
    const cooling = mapList(list(p.cooling_systems), COOLING)[0] ?? null;
    put("airConditioning", cooling);
    put("heatingType", mapList(heatingValues, HEATING)[0] ?? null);
  }

  // Tranzacții: un anunț per tranzacție.
  const sale = !!(p.for_sale || p.transaction_kind === "sale");
  const rent = !!(p.for_rent || p.transaction_kind === "rent");
  if (!sale && !rent) reasons.push("Bifează vânzare sau închiriere.");
  const listings: { transaction: VrexaTransaction; body: VrexaBody }[] = [];
  const tx = (kind: VrexaTransaction, raw: unknown, cur: unknown, label: string) => {
    const price = num(raw);
    const currency = (str(cur) || str(p.currency) || "EUR").toUpperCase();
    if (price === null || price < 1) return void reasons.push(`Lipsește prețul de ${label}.`);
    let eur: number;
    if (currency === "EUR") eur = Math.round(price);
    else if (currency === "RON") {
      if (ctx.eurRonRate === undefined) { warnings.push(`Prețul de ${label} este în lei: se convertește în EUR la cursul BNR din ziua publicării.`); eur = 0; }
      else if (ctx.eurRonRate === null || !(ctx.eurRonRate > 0)) return void reasons.push(`Prețul de ${label} este în lei și cursul BNR al zilei nu este disponibil.`);
      else { eur = Math.round(price / ctx.eurRonRate); warnings.push(`Prețul de ${label} a fost convertit din lei în EUR la cursul BNR (${ctx.eurRonRate}).`); }
    } else return void reasons.push(`Vrexa acceptă doar prețuri în EUR (sau în lei, convertite); prețul de ${label} este în ${currency}.`);
    const body: VrexaBody = { ...b, transaction: kind, currency: "eur" };
    if (eur >= 1) body.price = eur;
    listings.push({ transaction: kind, body });
  };
  if (sale) tx("sale", p.sale_price ?? p.price, p.sale_currency, "vânzare");
  if (rent) tx("rent", p.rent_price ?? p.price, p.rent_currency, "închiriere");

  if (reasons.length) return { ok: false, reasons, warnings };
  // Ordinea cheilor: comune întâi; nicio cheie în afara schemei.
  const allowed = VREXA_ALLOWED_KEYS[type];
  for (const l of listings) for (const k of Object.keys(l.body)) if (!allowed.has(k)) delete l.body[k];
  return { ok: true, listings, warnings };
}
