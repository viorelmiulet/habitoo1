/**
 * Mapper Habitoo → Romimo (`SaveArticleDto` parțial).
 *
 * Scris de la zero, strict pe structura Swagger Romimo API v2. Funcții pure,
 * fără rețea și fără DB: generatorul de referință CRM (`next_property_reference`)
 * este injectat prin context, ca mapperul să rămână testabil.
 */
import type { RomimoPicture, RomimoProperty, SaveArticleDto } from "./types";


export const ROMIMO_TITLE_MIN = 5;
export const ROMIMO_TITLE_MAX = 100;
export const ROMIMO_TEXT_MIN = 15;
export const ROMIMO_TEXT_MAX = 10_000;

/** Categorii Romimo cunoscute: (tip, tranzacție, camere) → cod. */
const CATEGORY_APARTMENT_SALE: Record<number, number> = { 1: 337, 2: 338, 3: 339, 4: 340, 5: 341 };
const CATEGORY_APARTMENT_RENT: Record<number, number> = { 1: 312, 2: 313, 3: 314, 4: 315, 5: 316 };
const CATEGORY_APARTMENT_SALE_6PLUS = 342;
const CATEGORY_APARTMENT_RENT_6PLUS = 317;
const CATEGORY_STUDIO_SALE = 343;
const CATEGORY_STUDIO_RENT = 318;
const CATEGORY_HOUSE_SALE = 347;
const CATEGORY_HOUSE_RENT = 44;

const APARTMENT_CATEGORIES = new Set<number>([
  337, 338, 339, 340, 341, 342, 343, 312, 313, 314, 315, 316, 317, 318,
]);
const HOUSE_CATEGORIES = new Set<number>([CATEGORY_HOUSE_SALE, CATEGORY_HOUSE_RENT]);

/** Compartimentările acceptate de Romimo (`resfeatures`), exact ca text. */
export const ROMIMO_LAYOUTS = [
  "Decomandat",
  "Semidecomandat",
  "Nedecomandat",
  "Circular",
  "Vagon",
] as const;

/** Tipurile de încălzire acceptate de Romimo (`heating`), plus „Altele". */
export const ROMIMO_HEATING = [
  "Gaz",
  "Lemn",
  "Centrala proprie",
  "Cazan",
  "Convector",
  "Centrala bloc",
  "Incalzire centralizata",
  "Panouri solare",
] as const;

/** Numărul maxim de poze trimise într-un anunț Romimo. */
export const ROMIMO_MAX_PICTURES = 20;

export type RomimoMapperImage = {
  id: string;
  includeInPublish: boolean;
  isConfidential: boolean;
  rank: number | null;
};

export type RomimoMapperProperty = {
  id: string;
  reference: string | null;
  propertyType: string | null;
  transactionKind: string | null;
  rooms: number | null;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  salePrice: number | null;
  saleCurrency: string | null;
  county: string | null;
  city: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  assignedTo: string | null;
  /** Caracteristici fizice folosite în `properties[]`. */
  usableSurface: number | null;
  builtSurface: number | null;
  landSurface: number | null;
  surface: number | null;
  floor: number | null;
  layout: string | null;
  buildYear: number | null;
  heatingSystems: string[] | null;
  /** Pozele proprietății, în ordinea existentă de afișare. */
  images: RomimoMapperImage[];
};

export type RomimoMapperContext = {
  agent: { fullName: string | null; email: string | null; phone: string | null } | null;
  organization: { phone: string | null; materialPhone: string | null } | null;
  /**
   * Generează referința CRM (`next_property_reference()`). Obligatoriu doar
   * când proprietatea nu are încă `reference`.
   */
  generateReference?: () => Promise<string>;
  /** Domeniul public al platformei, fără slash final (ex. `https://crm.habitoo.ro`). */
  publicBaseUrl: string;
  /** Injectabil în teste; implicit `new Date()`. */
  now?: Date;
};


export type RomimoMapperResult =
  | { ok: true; dto: Partial<SaveArticleDto>; warnings: string[] }
  | { ok: false; reasons: string[] };

function text(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

/** Sectorul București din `city`, tolerant la diacritice și la „Sectorul"/„Sector". */
export function extractBucharestSector(city: string | null): number | null {
  // „Sector"/„Sectorul" nu conțin diacritice, deci potrivirea e directă.
  const match = /sector(?:ul)?\s*([1-6])\b/.exec((city ?? "").toLowerCase());
  return match ? Number.parseInt(match[1] as string, 10) : null;
}

function categoryFor(
  propertyType: string | null,
  transactionKind: string | null,
  rooms: number | null,
): number | null {
  const type = (propertyType ?? "").toLowerCase();
  const kind = (transactionKind ?? "").toLowerCase();
  const roomCount = typeof rooms === "number" && Number.isFinite(rooms) ? Math.round(rooms) : 0;

  if (type === "apartment" && kind === "sale") {
    if (roomCount <= 0) return CATEGORY_STUDIO_SALE;
    if (roomCount >= 6) return CATEGORY_APARTMENT_SALE_6PLUS;
    return CATEGORY_APARTMENT_SALE[roomCount] ?? null;
  }
  if (type === "apartment" && kind === "rent") {
    if (roomCount <= 0) return CATEGORY_STUDIO_RENT;
    if (roomCount >= 6) return CATEGORY_APARTMENT_RENT_6PLUS;
    return CATEGORY_APARTMENT_RENT[roomCount] ?? null;
  }
  if (type === "house" && kind === "sale") return CATEGORY_HOUSE_SALE;
  if (type === "house" && kind === "rent") return CATEGORY_HOUSE_RENT;
  return null;
}

function numeric(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Text fără diacritice, minuscule — folosit doar la potrivirea încălzirii. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .toLowerCase()
    .trim();
}

/** `roomno`: textul cerut de Romimo, dedus din numărul de camere. */
export function romimoRoomNo(rooms: number | null): string | null {
  const count = numeric(rooms);
  if (count === null) return null;
  const rounded = Math.round(count);
  if (rounded <= 1) return "1 cameră";
  if (rounded >= 6) return "6 camere sau mai multe";
  return `${rounded} camere`;
}

/** `storey`: calculat exclusiv din `floor` (numeric); `floor_label` e ignorat. */
export function romimoStorey(floor: number | null): string | null {
  const value = numeric(floor);
  if (value === null) return null;
  const rounded = Math.round(value);
  if (rounded < 0) return "Demisol";
  if (rounded === 0) return "Parter";
  if (rounded <= 20) return `Etaj ${rounded}`;
  return "Ultimul etaj";
}

/** `heating`: primul element potrivit din `heating_systems`, altfel „Altele". */
export function romimoHeating(systems: string[] | null): string | null {
  const values = (systems ?? []).map((item) => text(item)).filter((item): item is string => !!item);
  if (values.length === 0) return null;
  for (const value of values) {
    const folded = fold(value);
    const match = ROMIMO_HEATING.find((option) => {
      const optionFolded = fold(option);
      return folded.includes(optionFolded) || optionFolded.includes(folded);
    });
    if (match) return match;
  }
  return "Altele";
}


function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export async function mapPropertyToRomimo(
  property: RomimoMapperProperty,
  context: RomimoMapperContext,
): Promise<RomimoMapperResult> {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // externalid: referința CRM; se generează dacă lipsește.
  let externalId = text(property.reference);
  if (!externalId) {
    if (!context.generateReference) {
      reasons.push("Oferta nu are referință CRM și nu există un generator de referințe.");
    } else {
      externalId = text(await context.generateReference());
      if (!externalId) reasons.push("Generatorul de referințe CRM nu a returnat o valoare.");
    }
  }

  const category = categoryFor(property.propertyType, property.transactionKind, property.rooms);
  if (category === null) {
    reasons.push(
      `Tip de proprietate neacceptat încă pentru Romimo: „${property.propertyType ?? "necunoscut"}" / „${property.transactionKind ?? "necunoscut"}".`,
    );
  }

  // Preț: cel de tranzacție are prioritate, apoi prețul general.
  const rawPrice =
    typeof property.salePrice === "number" && property.salePrice > 0
      ? property.salePrice
      : typeof property.price === "number" && property.price > 0
        ? property.price
        : null;
  const price = rawPrice === null ? null : Math.round(rawPrice);
  if (price === null) reasons.push("Oferta nu are un preț valid.");
  const currency = text(property.saleCurrency) ?? text(property.currency) ?? "EUR";

  const title = text(property.title);
  if (!title) {
    reasons.push("Oferta nu are titlu.");
  } else if (title.length < ROMIMO_TITLE_MIN || title.length > ROMIMO_TITLE_MAX) {
    reasons.push(
      `Titlul are ${title.length} caractere; Romimo acceptă între ${ROMIMO_TITLE_MIN} și ${ROMIMO_TITLE_MAX}.`,
    );
  }

  let description = text(property.description);
  if (!description) {
    reasons.push("Oferta nu are descriere.");
  } else if (description.length < ROMIMO_TEXT_MIN) {
    reasons.push(
      `Descrierea are ${description.length} caractere; Romimo cere minimum ${ROMIMO_TEXT_MIN}.`,
    );
  } else if (description.length > ROMIMO_TEXT_MAX) {
    description = description.slice(0, ROMIMO_TEXT_MAX);
    warnings.push(`Descrierea a fost trunchiată la ${ROMIMO_TEXT_MAX} de caractere (limita Romimo).`);
  }

  // Locație: județ + oraș, cu sector pentru București.
  const countyName = text(property.county);
  if (!countyName) reasons.push("Oferta nu are județ completat.");
  let cityName: string | null = null;
  if (countyName) {
    const isBucharest = countyName
      .normalize("NFD")
      .toLowerCase()
      .includes("bucure");
    if (isBucharest) {
      const sector = extractBucharestSector(property.city);
      if (sector === null) {
        reasons.push(
          `Nu am putut identifica sectorul din orașul „${property.city ?? "lipsă"}"; pentru București este necesar „Sectorul N".`,
        );
      } else {
        cityName = `sector ${sector}`;
      }
    } else {
      cityName = text(property.city);
      if (!cityName) reasons.push("Oferta nu are oraș completat.");
    }
  }

  // Contact: agentul responsabil, cu fallback pe telefonul agenției.
  if (!property.assignedTo || !context.agent) {
    reasons.push("Oferta nu are un agent responsabil cu profil complet.");
  }
  const agent = context.agent;
  const contactName = text(agent?.fullName ?? null);
  const contactEmail = text(agent?.email ?? null);
  if (property.assignedTo && agent) {
    if (!contactName) reasons.push("Agentul responsabil nu are nume completat în profil.");
    if (!contactEmail) reasons.push("Agentul responsabil nu are email completat în profil.");
  }
  const contactPhone =
    text(agent?.phone ?? null) ??
    text(context.organization?.phone ?? null) ??
    text(context.organization?.materialPhone ?? null);
  if (!contactPhone) {
    reasons.push("Lipsește telefonul de contact (agent sau agenție).");
  }

  // properties[]: caracteristicile cerute de categoria calculată.
  const characteristics: RomimoProperty[] = [];
  if (category !== null) {
    const usable = numeric(property.usableSurface);
    if (usable === null) {
      reasons.push("Lipsește suprafața utilă.");
    } else {
      characteristics.push({ key: "livingspace", value: String(usable) });
    }

    const roomNo = romimoRoomNo(property.rooms);
    if (!roomNo) {
      reasons.push("Lipsește numărul de camere.");
    } else {
      characteristics.push({ key: "roomno", value: roomNo });
    }

    const buildYear = numeric(property.buildYear);
    if (buildYear === null) {
      reasons.push("Lipsește anul construcției.");
    } else {
      characteristics.push({ key: "yearofbuilding", value: String(Math.round(buildYear)) });
    }

    if (APARTMENT_CATEGORIES.has(category)) {
      const storey = romimoStorey(property.floor);
      if (storey) characteristics.push({ key: "storey", value: storey });

      const layout = text(property.layout);
      if (layout) {
        const match = ROMIMO_LAYOUTS.find((option) => option === layout);
        if (!match) {
          reasons.push(
            `Compartimentarea „${layout}" nu este acceptată de Romimo (acceptate: ${ROMIMO_LAYOUTS.join(", ")}).`,
          );
        } else {
          characteristics.push({ key: "resfeatures", value: match });
        }
      }
    }

    if (HOUSE_CATEGORIES.has(category)) {
      const propertySpace =
        numeric(property.builtSurface) ?? numeric(property.landSurface) ?? numeric(property.surface);
      if (propertySpace === null) {
        reasons.push("Lipsește suprafața construită sau a terenului.");
      } else {
        characteristics.push({ key: "propertyspace", value: String(propertySpace) });
      }

      const heating = romimoHeating(property.heatingSystems);
      if (!heating) {
        reasons.push("Lipsește tipul de încălzire.");
      } else {
        characteristics.push({ key: "heating", value: heating });
      }
    }
  }

  // pictures[]: doar pozele publicabile, în ordinea existentă, maximum 20.
  const eligible = property.images.filter(
    (image) => image.includeInPublish && !image.isConfidential,
  );
  const base = context.publicBaseUrl.replace(/\/+$/, "");
  const pictures: RomimoPicture[] = eligible
    .slice(0, ROMIMO_MAX_PICTURES)
    .map((image, index) => ({
      url: `${base}/api/public/sites/v1/media/${image.id}`,
      rank: index + 1,
    }));
  if (pictures.length === 0) {
    warnings.push("Oferta nu are nicio poză eligibilă pentru publicare.");
  } else if (eligible.length > ROMIMO_MAX_PICTURES) {
    warnings.push(
      `Oferta are ${eligible.length} poze eligibile; Romimo acceptă maximum ${ROMIMO_MAX_PICTURES}, restul nu au fost trimise.`,
    );
  }

  if (reasons.length > 0) return { ok: false, reasons };


  const now = context.now ?? new Date();
  const dto: Partial<SaveArticleDto> = {
    ad: {
      active: true,
      promoted: false,
      externalid: externalId as string,
      category,
      price: price as number,
      currency: currency.toUpperCase(),
      title: title as string,
      text: description as string,
      validFrom: now.toISOString(),
      validTo: addMonths(now, 12).toISOString(),
    },
    contact: {
      contactName: contactName as string,
      contactEmail: contactEmail as string,
      contactPhone: contactPhone as string,
    },
    location: {
      countyName: countyName as string,
      cityName: cityName as string,
      ...(text(property.district) ? { areaName: text(property.district) } : {}),
      ...(typeof property.lat === "number" && Number.isFinite(property.lat)
        ? { latitude: property.lat }
        : {}),
      ...(typeof property.lng === "number" && Number.isFinite(property.lng)
        ? { longitude: property.lng }
        : {}),
    },
  };

  return { ok: true, dto, warnings };
}
