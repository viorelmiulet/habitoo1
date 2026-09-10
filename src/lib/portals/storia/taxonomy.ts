/**
 * Taxonomia Storia.ro (OLX Group RE API) — validată contra API-ului real.
 *
 * Sursa de adevăr este `taxonomy-snapshot.ts`, generat din
 * `GET /taxonomy/v1/categories/partner/urn:site:storiaro`. Aici păstrăm doar
 * traducerea „tip de proprietate Habitoo → categorie Storia” și derivăm din
 * instantaneu atributele obligatorii, ca să nu mai existe liste scrise de mână.
 *
 * Un tip de proprietate fără corespondent în arborele real rămâne nepublicabil,
 * cu motiv explicit — nu inventăm URN-uri.
 */
import {
  STORIA_TAXONOMY_SNAPSHOT,
  storiaCategoryExists,
  storiaMandatoryAttributes,
} from "./taxonomy-snapshot";

export type StoriaTransaction = "sale" | "rent";

/** Familia de bunuri, derivată din tipul de proprietate Habitoo. */
export type StoriaFamily =
  | "apartment"
  | "house"
  | "room"
  | "store"
  | "warehouse"
  | "garage"
  | "land";

/** URN-uri de categorie, toate confirmate în arborele real Storia. */
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
    // Storia listează camere doar la închiriere (nu există `rooms-for-sale`).
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
  // Terenul există în taxonomia reală ca „lots”, nu „plots”/„land”.
  land: {
    sale: "urn:concept:lots-for-sale",
    rent: "urn:concept:lots-for-rent",
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
  land: "land",
  teren: "land",
  lot: "land",
  parcela: "land",
  "parcelă": "land",
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
  const urn = CATEGORY_URN[family][transaction];
  // Plasă de siguranță: dacă instantaneul nu confirmă categoria, nu publicăm.
  if (!urn || !storiaCategoryExists(urn)) return null;
  return urn;
}

/** Toate categoriile pe care Habitoo le folosește efectiv. */
export const STORIA_USED_CATEGORIES: readonly string[] = Object.values(CATEGORY_URN)
  .flatMap((byTransaction) => Object.values(byTransaction))
  .filter((urn): urn is string => Boolean(urn));

/**
 * Atributele obligatorii per categorie, derivate din instantaneul real
 * (`mandatory: true`), nu scrise de mână.
 */
export const REQUIRED_ATTRIBUTES: Record<string, readonly string[]> = Object.fromEntries(
  Object.keys(STORIA_TAXONOMY_SNAPSHOT).map((category) => [
    category,
    storiaMandatoryAttributes(category),
  ]),
);

/** Etichete în română pentru atribute, folosite în mesajele de validare. */
export const ATTRIBUTE_LABEL: Record<string, string> = {
  "urn:concept:number-of-rooms": "numărul de camere (1–10)",
  "urn:concept:net-area-m2": "suprafața utilă",
  "urn:concept:terrain-area-m2": "suprafața terenului",
  "urn:concept:market": "tipul pieței (nou sau vechi)",
};

/** Numărul de camere se trimite ca URN de concept; confirmat 1–10 + „more”. */
export function roomsUrn(rooms: number | null): string | null {
  if (typeof rooms !== "number" || !Number.isInteger(rooms) || rooms < 1) return null;
  if (rooms > 10) return "urn:concept:more";
  return `urn:concept:${rooms}`;
}
