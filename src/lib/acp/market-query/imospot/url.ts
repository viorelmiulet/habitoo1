/**
 * Construirea adresei de căutare Imospot — funcții pure.
 *
 * Parametrii sunt exact cei folosiți de formularul public al sursei și se
 * trimit doar acolo unde noi chiar impunem o restricție; restul rămân
 * netrimiși, ca în interfața sursei.
 */
import type { MarketQueryCriteria } from "../port";
import type { ImospotLocation } from "./locations";

/** 12 rezultate pe pagină, ca la sursă. */
export const IMOSPOT_RESULTS_PER_PAGE = 12;
/** Cel mult două pagini pe interogare (24 de rezultate). */
export const IMOSPOT_MAX_PAGES = 2;
/** Sortarea cerută: cele mai noi oferte întâi. */
export const IMOSPOT_SORT = "-cele-mai-noi";

export type ImospotTransaction = "vanzari" | "inchirieri";

export function imospotTransaction(
  transactionType: string | null,
): ImospotTransaction | null {
  if (transactionType === "sale") return "vanzari";
  if (transactionType === "rent") return "inchirieri";
  return null;
}

/** Categoriile publicate de sursă, pentru vânzare și pentru închiriere. */
export const IMOSPOT_CATEGORIES: Record<
  string,
  { vanzari: string; inchirieri: string }
> = {
  apartment: {
    vanzari: "apartamente-de-vanzare",
    inchirieri: "apartamente-de-inchiriat",
  },
  studio: {
    vanzari: "apartamente-de-vanzare",
    inchirieri: "apartamente-de-inchiriat",
  },
  house: {
    vanzari: "case-vile-de-vanzare",
    inchirieri: "case-vile-de-inchiriat",
  },
  land: {
    vanzari: "terenuri-de-vanzare",
    inchirieri: "terenuri-de-inchiriat",
  },
  commercial: {
    vanzari: "birouri-si-spatii-comerciale-de-vanzare",
    inchirieri: "birouri-si-spatii-comerciale-de-inchiriat",
  },
  office: {
    vanzari: "birouri-si-spatii-comerciale-de-vanzare",
    inchirieri: "birouri-si-spatii-comerciale-de-inchiriat",
  },
  industrial: {
    vanzari: "hale-si-depozite-de-vanzare",
    inchirieri: "hale-si-depozite-de-inchiriat",
  },
};

export function imospotCategory(
  propertyType: string | null,
  transaction: ImospotTransaction | null,
): string | null {
  if (!propertyType || !transaction) return null;
  return IMOSPOT_CATEGORIES[propertyType]?.[transaction] ?? null;
}

function integer(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return String(Math.round(value));
}

/**
 * Adresa unei pagini de rezultate. `page` este 1-based; pagina 1 nu primește
 * parametrul `page`, exact ca la sursă.
 */
export function buildImospotSearchUrl(input: {
  baseUrl: string;
  location: ImospotLocation;
  criteria: MarketQueryCriteria;
  page?: number;
}): string {
  const { criteria, location } = input;
  const base = input.baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${location.path}`);

  const transaction = imospotTransaction(criteria.transactionType);
  if (transaction) url.searchParams.set("tranzactie", transaction);

  const category = imospotCategory(criteria.propertyType, transaction);
  if (category) url.searchParams.set("categorie", category);

  // Sursa oferă filtrul de camere doar pentru 1–5; peste, îl lăsăm gol.
  const rooms = integer(criteria.rooms);
  if (rooms && Number(rooms) >= 1 && Number(rooms) <= 5) {
    url.searchParams.set("rooms", rooms);
  }

  const priceMin = integer(criteria.priceMin);
  if (priceMin) url.searchParams.set("price_min", priceMin);
  const priceMax = integer(criteria.priceMax);
  if (priceMax) url.searchParams.set("price_max", priceMax);

  const areaMin = integer(criteria.areaMin);
  if (areaMin) url.searchParams.set("area_min", areaMin);
  const areaMax = integer(criteria.areaMax);
  if (areaMax) url.searchParams.set("area_max", areaMax);

  // Identificatorii numerici se trimit numai când îi cunoaștem cu certitudine.
  if (location.cityId !== null) url.searchParams.set("city_id", String(location.cityId));
  if (location.neighborhoodId !== null) {
    url.searchParams.set("neighborhood_id", String(location.neighborhoodId));
  }

  url.searchParams.set("sort", IMOSPOT_SORT);

  const page = input.page ?? 1;
  if (page > 1) url.searchParams.set("page", String(page));

  return url.toString();
}
