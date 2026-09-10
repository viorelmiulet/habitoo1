/**
 * Taxonomia Storia.ro (OLX Group RE API) — doar categoriile documentate în
 * „Storia taxonomy tree”. Nu inventăm URN-uri: un tip de proprietate fără
 * corespondent documentat este raportat ca nepublicabil, cu motiv explicit.
 *
 * Atributele obligatorii per categorie sunt cele marcate „mandatory” în
 * documentație; restul dotărilor Habitoo NU se trimit ca atribute, pentru că
 * URN-urile lor nu pot fi confirmate din documentația publică.
 */

export type StoriaTransaction = "sale" | "rent";

/** Familia de bunuri, derivată din tipul de proprietate Habitoo. */
export type StoriaFamily = "apartment" | "house" | "room" | "store" | "warehouse" | "garage";

/** URN-uri de categorie, exact ca în arborele Storia. */
const CATEGORY_URN: Record<StoriaFamily, Record<StoriaTransaction, string | null>> = {
  apartment: {
    sale: "urn:concept:apartments-for-sale",
    rent: "urn:concept:apartments-for-rent",
  },
  house: {
    sale: "urn:concept:houses-for-sale",
    rent: "urn:concept:houses-for-rent",
  },
  room: {
    // Storia listează camere doar la închiriere.
    sale: null,
    rent: "urn:concept:rooms-for-rent",
  },
  store: {
    sale: "urn:concept:stores-for-sale",
    rent: "urn:concept:stores-for-rent",
  },
  warehouse: {
    sale: "urn:concept:warehouses-for-sale",
    rent: "urn:concept:warehouses-for-rent",
  },
  garage: {
    sale: "urn:concept:garages-for-sale",
    rent: "urn:concept:garages-for-rent",
  },
};

const FAMILY_MAP: Record<string, StoriaFamily> = {
  apartment: "apartment",
  apartament: "apartment",
  studio: "apartment",
  garsoniera: "apartment",
  "garsonieră": "apartment",
  penthouse: "apartment",
  duplex: "apartment",
  house: "house",
  casa: "house",
  "casă": "house",
  villa: "house",
  vila: "house",
  "vilă": "house",
  room: "room",
  camera: "room",
  "cameră": "room",
  commercial: "store",
  spatiu_comercial: "store",
  "spațiu comercial": "store",
  retail: "store",
  office: "store",
  birou: "store",
  birouri: "store",
  warehouse: "warehouse",
  hala: "warehouse",
  "hală": "warehouse",
  depozit: "warehouse",
  industrial: "warehouse",
  garage: "garage",
  garaj: "garage",
  parcare: "garage",
};

export function storiaFamily(propertyType: string | null): StoriaFamily | null {
  if (!propertyType) return null;
  return FAMILY_MAP[propertyType.trim().toLowerCase()] ?? null;
}

export function storiaCategoryUrn(
  propertyType: string | null,
  transaction: StoriaTransaction,
): string | null {
  const family = storiaFamily(propertyType);
  if (!family) return null;
  return CATEGORY_URN[family][transaction];
}

/** Atribute obligatorii per categorie (conform „advert validation rules”). */
export const REQUIRED_ATTRIBUTES: Record<string, readonly string[]> = {
  "urn:concept:apartments-for-sale": [
    "urn:concept:number-of-rooms",
    "urn:concept:net-area-m2",
    "urn:concept:market",
  ],
  "urn:concept:apartments-for-rent": ["urn:concept:number-of-rooms", "urn:concept:net-area-m2"],
  "urn:concept:houses-for-sale": ["urn:concept:net-area-m2", "urn:concept:terrain-area-m2"],
  "urn:concept:houses-for-rent": ["urn:concept:net-area-m2"],
  "urn:concept:warehouses-for-sale": ["urn:concept:net-area-m2"],
  "urn:concept:warehouses-for-rent": ["urn:concept:net-area-m2"],
};

/** Etichete în română pentru atributele obligatorii, folosite în mesaje. */
export const ATTRIBUTE_LABEL: Record<string, string> = {
  "urn:concept:number-of-rooms": "numărul de camere (1–10)",
  "urn:concept:net-area-m2": "suprafața utilă",
  "urn:concept:terrain-area-m2": "suprafața terenului",
  "urn:concept:market": "tipul pieței (nou sau vechi)",
};

/** Numărul de camere se trimite ca URN de concept; documentat 1–10. */
export function roomsUrn(rooms: number | null): string | null {
  if (typeof rooms !== "number" || !Number.isInteger(rooms) || rooms < 1 || rooms > 10) return null;
  return `urn:concept:${rooms}`;
}
