/**
 * ImoBox.ro — funcții pure: textul `q`, adresa cererii și maparea rezultatelor.
 * API public, fără cheie (https://api.imobox.ro/api-docs).
 */
import type { MarketQueryCriteria, MarketQueryRawComparable } from "../port";

export const IMOBOX_SOURCE_KEY = "imobox";
export const IMOBOX_BASE_URL = "https://api.imobox.ro";
export const IMOBOX_USER_AGENT = "HabitooBot/1.0 (+https://www.habitoo.ro)";
export const IMOBOX_PAGE_LIMIT = 100;
export const IMOBOX_MAX_PAGES = 3;
export const IMOBOX_MIN_RESULTS = 5;
export const IMOBOX_MAX_AGE_DAYS = 365;

const TYPE_WORDS: Record<string, string> = {
  apartment: "apartament",
  studio: "garsoniera",
  house: "casa",
  land: "teren",
  commercial: "spatiu comercial",
  office: "birou",
  industrial: "hala",
};

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function imoboxTransactionWord(t: string | null): string | null {
  if (t === "sale") return "vanzare";
  if (t === "rent") return "inchiriere";
  return null;
}

/** Valoarea `tip_anunt` a ImoBox pentru tranzacția noastră. */
export function imoboxTipAnunt(t: string | null): string | null {
  if (t === "sale") return "vanzare-cumparare";
  if (t === "rent") return "inchiriere";
  return null;
}

/** Ex.: „apartament 2 camere vanzare Militari Bucuresti". */
export function buildImoboxQuery(
  criteria: MarketQueryCriteria,
  options: { withZone?: boolean } = {},
): string {
  const parts: string[] = [];
  const type = criteria.propertyType ? TYPE_WORDS[criteria.propertyType] : undefined;
  if (type) parts.push(type);
  const rooms = criteria.rooms;
  if (rooms !== null && rooms > 0 && criteria.propertyType !== "land") {
    const r = Math.round(rooms);
    parts.push(r === 1 ? "1 camera" : `${r} camere`);
  }
  const tx = imoboxTransactionWord(criteria.transactionType);
  if (tx) parts.push(tx);
  if (options.withZone !== false && criteria.zone) parts.push(criteria.zone);
  if (criteria.city) parts.push(criteria.city);
  return stripDiacritics(parts.join(" ")).replace(/\s+/g, " ").trim();
}

export function buildImoboxUrl(baseUrl: string, q: string, page: number): string {
  const url = new URL(`${(baseUrl || IMOBOX_BASE_URL).replace(/\/+$/, "")}/v1/anunturi`);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(IMOBOX_PAGE_LIMIT));
  url.searchParams.set("pagina", String(page));
  url.searchParams.set("format", "json");
  return url.toString();
}

export type ImoboxResult = Record<string, unknown>;

export type ImoboxPage = { results: ImoboxResult[]; totalPages: number | null };

export function parseImoboxPage(body: string): ImoboxPage {
  const json = JSON.parse(body) as {
    results?: unknown;
    requestInfo?: { totalPages?: unknown };
  };
  const results = Array.isArray(json.results)
    ? (json.results.filter((r) => r && typeof r === "object") as ImoboxResult[])
    : [];
  const tp = Number(json.requestInfo?.totalPages);
  return { results, totalPages: Number.isFinite(tp) ? tp : null };
}

function positive(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Un rezultat ImoBox → câmpuri brute; etajul și anul nu există la sursă. */
export function mapImoboxResult(r: ImoboxResult): MarketQueryRawComparable & { id: string | null } {
  return {
    id: typeof r["id_anunt"] === "string" ? (r["id_anunt"] as string) : null,
    price: r["pret_total"],
    currency: r["moneda"],
    area: positive(r["suprafata_casa"]) ?? positive(r["suprafata"]),
    rooms: r["camere"],
    locality: r["oras"] ?? r["judet"],
    zone: null,
    latitude: r["latitudine"],
    longitude: r["longitudine"],
    listedAt: r["data_actualizare"],
    url: r["url"],
  };
}

export type ImoboxExclusion = "no_price" | "no_area" | "transaction" | "too_old" | "price_band";

/** Motivul excluderii, sau `null` dacă rezultatul poate fi folosit. */
export function imoboxExclusion(
  r: ImoboxResult,
  criteria: MarketQueryCriteria,
  now: Date,
): ImoboxExclusion | null {
  const price = positive(r["pret_total"]);
  if (price === null) return "no_price";
  if ((positive(r["suprafata_casa"]) ?? positive(r["suprafata"])) === null) return "no_area";
  const tip = imoboxTipAnunt(criteria.transactionType);
  if (tip && r["tip_anunt"] !== tip) return "transaction";
  const updated = typeof r["data_actualizare"] === "string" ? Date.parse(r["data_actualizare"]) : NaN;
  if (!Number.isFinite(updated) || now.getTime() - updated > IMOBOX_MAX_AGE_DAYS * 86_400_000) {
    return "too_old";
  }
  if (criteria.priceMin !== null && price < criteria.priceMin) return "price_band";
  if (criteria.priceMax !== null && price > criteria.priceMax) return "price_band";
  return null;
}
