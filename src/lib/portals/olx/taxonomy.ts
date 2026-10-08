/**
 * Taxonomia OLX.ro (Partner API 2.0) pentru Imobiliare — partea pură.
 * ID-urile categoriilor frunză (`is_leaf = true`) au fost citite real din
 * `GET /categories` (rădăcina Imobiliare = 3). Atributele obligatorii și
 * `photos_limit` vin din cache-ul `portal_taxonomy_cache` (portal `olx_direct`).
 */
export const OLX_TAXONOMY_PORTAL = "olx_direct";
export const OLX_TAXONOMY_SITE = "olx.ro:imobiliare";
export const OLX_REAL_ESTATE_ROOT = 3;
/** Reîmprospătare săptămânală. */
export const OLX_TAXONOMY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type OlxAttributeDef = {
  code: string;
  label: string;
  required: boolean;
  numeric: boolean;
  multiple: boolean;
  values: string[];
};
export type OlxCategory = {
  id: number;
  name: string;
  parent_id: number;
  photos_limit: number;
  is_leaf: boolean;
  attributes?: OlxAttributeDef[];
};
export type OlxTaxonomy = Record<string, OlxCategory>;

export type OlxTransaction = "sale" | "rent";

type Family = "apartment" | "house" | "land" | "commercial" | "warehouse" | "garage" | "room" | "other";

const FAMILY: Record<string, Family> = {
  apartment: "apartment", apartament: "apartment", studio: "apartment", garsoniera: "apartment",
  "garsonieră": "apartment", penthouse: "apartment", duplex: "apartment",
  house: "house", casa: "house", "casă": "house", villa: "house", vila: "house", "vilă": "house",
  land: "land", teren: "land", lot: "land", parcela: "land", "parcelă": "land",
  commercial: "commercial", spatiu_comercial: "commercial", "spațiu comercial": "commercial",
  retail: "commercial", office: "commercial", birou: "commercial", birouri: "commercial",
  warehouse: "warehouse", hala: "warehouse", "hală": "warehouse", depozit: "warehouse", industrial: "warehouse",
  garage: "garage", garaj: "garage", parcare: "garage",
  room: "room", camera: "room", "cameră": "room",
};

/** ID-uri reale OLX (frunze). Apartamentele depind de numărul de camere. */
export const OLX_LEAF = {
  apartment: { sale: { 1: 1163, 2: 1165, 3: 1167, 4: 1169 }, rent: { 1: 1155, 2: 1157, 3: 1159, 4: 1161 } },
  house: { sale: 911, rent: 913 },
  land: { sale: 709, rent: 709 },
  commercial: { sale: 710, rent: 710 },
  warehouse: { sale: 2664, rent: 2665 },
  garage: { sale: 2661, rent: 2662 },
  room: { sale: null, rent: 2679 },
  other: { sale: 745, rent: 745 },
} as const;

export function olxFamily(propertyType: string | null): Family | null {
  if (!propertyType) return null;
  return FAMILY[propertyType.trim().toLowerCase()] ?? null;
}

/** Categoria frunză OLX pentru tipul Habitoo + tranzacție (+ camere la apartamente). */
export function olxCategoryId(
  propertyType: string | null,
  transaction: OlxTransaction,
  rooms: number | null,
): number | null {
  const family = olxFamily(propertyType);
  if (!family) return null;
  if (family === "apartment") {
    const isStudio = ["studio", "garsoniera", "garsonieră"].includes(propertyType!.trim().toLowerCase());
    const r = isStudio ? 1 : rooms;
    if (!r || r < 1) return null;
    const key = (Math.min(4, Math.floor(r)) as 1 | 2 | 3 | 4);
    return OLX_LEAF.apartment[transaction][key];
  }
  return OLX_LEAF[family][transaction];
}

/** Lanțul de categorii de la frunză la rădăcină (pentru potrivirea pachetelor). */
export function olxCategoryChain(taxonomy: OlxTaxonomy, leafId: number): number[] {
  const chain: number[] = [];
  let cur: OlxCategory | undefined = taxonomy[String(leafId)];
  for (let i = 0; cur && i < 6; i += 1) {
    chain.push(cur.id);
    cur = cur.parent_id ? taxonomy[String(cur.parent_id)] : undefined;
  }
  return chain.length ? chain : [leafId];
}
