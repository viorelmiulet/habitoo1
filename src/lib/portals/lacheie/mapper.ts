/**
 * Mapper pur Habitoo → La Cheie (fără DB, fără rețea).
 *
 * Reguli respectate strict:
 *  - payload-ul conține DOAR câmpuri din allowlist (`LACHEIE_ALLOWED_FIELDS`);
 *    orice câmp necunoscut este eliminat înainte de request;
 *  - câmpurile refuzate de portal (`agency`, `agency_id`, `user_id`,
 *    `promoted_until`, `listing_type`, `location`, `phone` la nivel top-level)
 *    nu sunt trimise niciodată: telefonul stă în `agent.phone`, camerele în
 *    `number_of_rooms`;
 *  - `external_id` este stabil, ASCII, 1–64 caractere, derivat din UUID-ul
 *    intern al proprietății (imun la editarea referinței agenției);
 *  - POST și PUT trimit STAREA COMPLETĂ a ofertei (nu există PATCH), deci
 *    payload-ul se construiește explicit la fiecare scriere;
 *  - maximum 30 imagini, doar HTTP(S) public, deduplicate, fără credențiale,
 *    fragmente sau spații;
 *  - corpul cererii nu depășește 1 MiB.
 */
import type { LaCheieCategory } from "./catalog";

export const LACHEIE_MAX_IMAGES = 30;
/** Fiecare URL de imagine: maximum 500 de caractere (documentație, secțiunea 3). */
export const LACHEIE_MAX_IMAGE_URL_LENGTH = 500;
export const LACHEIE_MAX_BODY_BYTES = 1024 * 1024;
export const LACHEIE_MIN_TITLE = 8;
export const LACHEIE_MIN_DESCRIPTION = 40;
export const LACHEIE_EXTERNAL_ID_MAX = 64;
/** `agent.full_name` maximum 255 caractere; `agent.phone` 7–15 cifre, ≤30 caractere. */
export const LACHEIE_AGENT_NAME_MAX = 255;
export const LACHEIE_AGENT_PHONE_MAX = 30;
export const LACHEIE_AGENT_PHONE_MIN_DIGITS = 7;
export const LACHEIE_AGENT_PHONE_MAX_DIGITS = 15;


export type LaCheieCurrency = "EUR" | "RON" | "USD";
export type LaCheieTransaction = "sale" | "rent";

export const LACHEIE_CURRENCIES: readonly LaCheieCurrency[] = ["EUR", "RON", "USD"];
export const LACHEIE_TRANSACTIONS: readonly LaCheieTransaction[] = ["sale", "rent"];

/** Câmpurile pe care portalul le respinge explicit la nivel top-level. */
export const LACHEIE_FORBIDDEN_FIELDS = [
  "agency",
  "agency_id",
  "user_id",
  "promoted_until",
  "listing_type",
  "location",
  "phone",
] as const;

/** Singurele câmpuri acceptate în payload. Restul se elimină. */
export const LACHEIE_ALLOWED_FIELDS = [
  // obligatorii
  "external_id",
  "title",
  "description",
  "price",
  "currency",
  "transaction_type",
  "property_type",
  "county",
  "city",
  "agent",
  // caracteristici
  "area",
  "land_area",
  "bedrooms",
  "bathrooms",
  "year_built",
  "number_of_rooms",
  // opționale documentate
  "strengths",
  "neighbourhood",
  "street_name",
  "number",
  "latitude",
  "longitude",
  "apartment_type",
  "house_type",
  "land_type",
  "land_classification",
  "commercial_type",
  "admin_fee",
  "street_front",
  "floor",
  "comfort",
  "partitioning",
  "construction_stage",
  "pet_friendly",
  "has_video",
  "zero_commission",
  "cooling",
  "utilities",
  "availability",
  "heating",
  "parking",
  "laundry",
  "flooring",
  "pets_policy",
  "facilities",
  "nearby",
  "images",
] as const;

export type LaCheieAgent = {
  external_id: string;
  full_name: string;
  phone: string;
  email?: string;
};

export type LaCheieOffer = {
  external_id: string;
  title: string;
  description: string;
  price: number;
  currency: LaCheieCurrency;
  transaction_type: LaCheieTransaction;
  /** Id din `/options`, păstrat ca text pentru precizie. */
  property_type: string;
  county: string;
  city: string;
  agent: LaCheieAgent;
  area?: number;
  land_area?: number;
  bedrooms?: number;
  bathrooms?: number;
  year_built?: number;
  number_of_rooms?: number;
  images?: string[];
  [key: string]: unknown;
};

/** `external_id` stabil per proprietate și tranzacție (ASCII, ≤ 64). */
export function laCheieExternalId(propertyId: string, transaction: LaCheieTransaction): string {
  const base = `HBT-${propertyId}-${transaction.toUpperCase()}`;
  const ascii = base.replace(/[^\x21-\x7e]/g, "-");
  return ascii.slice(0, LACHEIE_EXTERNAL_ID_MAX);
}

export function isValidExternalId(value: string): boolean {
  return (
    value.length >= 1 && value.length <= LACHEIE_EXTERNAL_ID_MAX && /^[\x21-\x7e]+$/.test(value)
  );
}

/** Elimină câmpurile necunoscute și cele interzise, raportând ce a scos. */
export function stripUnknownFields(input: Record<string, unknown>): {
  payload: Record<string, unknown>;
  removed: string[];
} {
  const allowed = new Set<string>(LACHEIE_ALLOWED_FIELDS as readonly string[]);
  const payload: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (!allowed.has(key)) {
      removed.push(key);
      continue;
    }
    payload[key] = value;
  }
  return { payload, removed };
}

export type ImageSanitizeResult = {
  images: string[];
  /** URL-uri respinse, cu motivul, pentru mesajul din UI. */
  rejected: { url: string; reason: string }[];
  duplicates: number;
  /** `true` când sunt mai multe de 30 și publicarea trebuie blocată. */
  tooMany: boolean;
};

/** Validează, deduplică (păstrând ordinea) și limitează lista de imagini. */
export function sanitizeLaCheieImages(urls: (string | null | undefined)[]): ImageSanitizeResult {
  const images: string[] = [];
  const rejected: { url: string; reason: string }[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const raw of urls) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    if (/\s/.test(value)) {
      rejected.push({ url: value, reason: "conține spații" });
      continue;
    }
    if (value.includes("#")) {
      rejected.push({ url: value, reason: "conține fragment (#)" });
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      rejected.push({ url: value, reason: "nu este un URL valid" });
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      rejected.push({ url: value, reason: "trebuie să fie HTTP(S)" });
      continue;
    }
    if (parsed.username || parsed.password) {
      rejected.push({ url: value, reason: "conține credențiale" });
      continue;
    }
    // URL-uri semnate/expirabile: La Cheie păstrează adresa furnizată, deci un
    // link temporar ar duce la imagini rupte pe portal.
    if (/[?&](x-amz-signature|token|signature|expires|se=)/i.test(parsed.search)) {
      rejected.push({ url: value, reason: "pare un link temporar/semnat" });
      continue;
    }
    if (seen.has(value)) {
      duplicates += 1;
      continue;
    }
    seen.add(value);
    images.push(value);
  }

  return { images, rejected, duplicates, tooMany: images.length > LACHEIE_MAX_IMAGES };
}

export type LaCheiePropertyInput = {
  id: string;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  transaction: LaCheieTransaction;
  category: LaCheieCategory;
  propertyTypeId: string;
  countyId: string;
  cityId: string;
  /** Suprafață utilă/construită, în m². */
  area?: number | null;
  landArea?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  yearBuilt?: number | null;
  numberOfRooms?: number | null;
  floor?: number | null;
  comfort?: string | null;
  partitioning?: string | null;
  constructionStage?: string | null;
  neighbourhood?: string | null;
  streetName?: string | null;
  streetNumber?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Valoare de catalog (`allowed`/`not_allowed`/`any`), nu boolean. */
  petFriendly?: string | null;
  strengths?: string[];
  /** Id-uri numerice din catalog (pk), nu denumiri. */
  facilities?: number[];
  utilities?: number[];
  nearby?: number[];
  heating?: number | null;
  cooling?: number | null;
  parking?: number | null;
  images?: (string | null | undefined)[];
};

export type LaCheieBuildResult =
  | { ok: true; offer: LaCheieOffer; warnings: string[]; removedFields: string[] }
  | { ok: false; reasons: string[] };

function positiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function nonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/** Id-uri de catalog (pk): întregi pozitivi, unici, în ordinea primită. */
function cleanIdList(values: number[] | undefined, limit = 30): number[] {
  const out: number[] = [];
  for (const value of values ?? []) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    const id = Math.round(value);
    if (!out.includes(id)) out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

function cleanTextList(values: string[] | undefined, limit = 30): string[] {
  if (!values?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = (value ?? "").toString().trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/** Construiește payload-ul complet, validat local înainte de orice request. */
export function buildLaCheieOffer(
  input: LaCheiePropertyInput,
  agent: Partial<LaCheieAgent> | null,
): LaCheieBuildResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const title = (input.title ?? "").trim();
  if (title.length < LACHEIE_MIN_TITLE) {
    reasons.push(`Titlul trebuie să aibă minimum ${LACHEIE_MIN_TITLE} caractere.`);
  }
  const description = (input.description ?? "").trim();
  if (description.length < LACHEIE_MIN_DESCRIPTION) {
    reasons.push(`Descrierea trebuie să aibă minimum ${LACHEIE_MIN_DESCRIPTION} caractere.`);
  }

  const price = positiveInt(input.price);
  if (price === null) reasons.push("Lipsește prețul sau nu este un număr pozitiv.");

  const currency = (input.currency ?? "EUR").trim().toUpperCase() as LaCheieCurrency;
  if (!LACHEIE_CURRENCIES.includes(currency)) {
    reasons.push(`Moneda „${currency}” nu este acceptată de La Cheie (EUR, RON sau USD).`);
  }
  if (!LACHEIE_TRANSACTIONS.includes(input.transaction)) {
    reasons.push("Tipul tranzacției trebuie să fie vânzare sau închiriere.");
  }
  if (!input.propertyTypeId) reasons.push("Lipsește tipul de proprietate din catalogul La Cheie.");
  if (!input.countyId) reasons.push("Lipsește județul din catalogul La Cheie.");
  if (!input.cityId) reasons.push("Lipsește localitatea din catalogul La Cheie.");

  const externalId = laCheieExternalId(input.id, input.transaction);
  if (!isValidExternalId(externalId)) reasons.push("Identificatorul extern al ofertei este invalid.");

  const agentExternalId = (agent?.external_id ?? "").trim();
  const agentName = (agent?.full_name ?? "").trim();
  const agentPhone = (agent?.phone ?? "").trim();
  if (!agentExternalId) reasons.push("Agentul responsabil nu are identificator.");
  if (!agentName) reasons.push("Agentul responsabil nu are nume complet.");
  if (!agentPhone) reasons.push("Agentul responsabil nu are telefon (obligatoriu la La Cheie).");

  const area = positiveInt(input.area);
  const landArea = positiveInt(input.landArea);
  const bedrooms = nonNegativeInt(input.bedrooms);
  const bathrooms = nonNegativeInt(input.bathrooms);
  const yearBuilt = nonNegativeInt(input.yearBuilt);
  const numberOfRooms = nonNegativeInt(input.numberOfRooms);

  if (input.category === "apartment" || input.category === "house") {
    if (area === null) reasons.push("Lipsește suprafața utilă/construită (obligatorie).");
    if (bedrooms === null) reasons.push("Lipsește numărul de dormitoare (obligatoriu).");
    if (bathrooms === null) reasons.push("Lipsește numărul de băi (obligatoriu).");
    if (yearBuilt === null) reasons.push("Lipsește anul construcției (obligatoriu).");
  } else if (input.category === "land") {
    if (landArea === null) reasons.push("Lipsește suprafața terenului (obligatorie).");
  } else if (input.category === "commercial") {
    if (area === null) reasons.push("Lipsește suprafața spațiului (obligatorie).");
    if (bathrooms === null) reasons.push("Lipsește numărul de băi (obligatoriu).");
    if (yearBuilt === null) reasons.push("Lipsește anul construcției (obligatoriu).");
    if (numberOfRooms === null) reasons.push("Lipsește numărul de camere (obligatoriu).");
  }

  const imageResult = sanitizeLaCheieImages(input.images ?? []);
  if (imageResult.tooMany) {
    reasons.push(
      `Oferta are ${imageResult.images.length} imagini publicabile, iar La Cheie acceptă maximum ${LACHEIE_MAX_IMAGES}. Reduce numărul înainte de publicare.`,
    );
  }
  if (imageResult.rejected.length) {
    warnings.push(
      `${imageResult.rejected.length} imagine(i) nu au fost trimise (${imageResult.rejected[0]?.reason}).`,
    );
  }
  if (imageResult.duplicates) {
    warnings.push(`${imageResult.duplicates} imagine(i) duplicate au fost eliminate.`);
  }

  if (reasons.length) return { ok: false, reasons };

  const draft: Record<string, unknown> = {
    external_id: externalId,
    title,
    description,
    price,
    currency,
    transaction_type: input.transaction,
    property_type: input.propertyTypeId,
    county: input.countyId,
    city: input.cityId,
    agent: {
      external_id: agentExternalId,
      full_name: agentName,
      phone: agentPhone,
      ...(agent?.email?.trim() ? { email: agent.email.trim() } : {}),
    },
  };

  if (input.category === "land") {
    // Documentația permite `area` = `land_area`, iar camere/băi/an pot fi 0.
    draft["land_area"] = landArea;
    draft["area"] = area ?? landArea;
    draft["bedrooms"] = bedrooms ?? 0;
    draft["bathrooms"] = bathrooms ?? 0;
    draft["year_built"] = yearBuilt ?? 0;
    draft["number_of_rooms"] = numberOfRooms ?? 0;
  } else {
    draft["area"] = area;
    draft["bedrooms"] = bedrooms ?? 0;
    draft["bathrooms"] = bathrooms;
    draft["year_built"] = yearBuilt;
    draft["number_of_rooms"] = numberOfRooms ?? bedrooms ?? 0;
    if (landArea !== null) draft["land_area"] = landArea;
  }

  const put = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string" && !value.trim()) return;
    if (Array.isArray(value) && value.length === 0) return;
    draft[key] = value;
  };

  put("neighbourhood", input.neighbourhood?.trim());
  put("street_name", input.streetName?.trim());
  put("number", input.streetNumber?.trim());
  put("latitude", typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : null);
  put("longitude", typeof input.lng === "number" && Number.isFinite(input.lng) ? input.lng : null);
  put("floor", nonNegativeInt(input.floor));
  put("comfort", input.comfort?.trim());
  put("partitioning", input.partitioning?.trim());
  put("construction_stage", input.constructionStage?.trim());
  put("heating", positiveInt(input.heating));
  put("cooling", positiveInt(input.cooling));
  put("parking", positiveInt(input.parking));
  put("strengths", cleanTextList(input.strengths));
  put("facilities", cleanIdList(input.facilities));
  put("utilities", cleanIdList(input.utilities));
  put("nearby", cleanIdList(input.nearby));
  put("pet_friendly", input.petFriendly?.trim());
  // Imaginile: `[]` cere explicit eliminarea celor existente la portal.
  draft["images"] = imageResult.images;

  const { payload, removed } = stripUnknownFields(draft);
  const offer = payload as LaCheieOffer;

  const size = payloadByteSize(offer);
  if (size > LACHEIE_MAX_BODY_BYTES) {
    return {
      ok: false,
      reasons: [
        `Anunțul are ${Math.round(size / 1024)} KiB, peste limita de 1 MiB acceptată de La Cheie.`,
      ],
    };
  }

  return { ok: true, offer, warnings, removedFields: removed };
}

export function payloadByteSize(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

export function exceedsLaCheieBodyLimit(payload: unknown): boolean {
  return payloadByteSize(payload) > LACHEIE_MAX_BODY_BYTES;
}
