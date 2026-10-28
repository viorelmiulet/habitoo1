// Cererile clienților din grupurile publice (Facebook): validare import și potrivire cu proprietăți.
import { z } from "zod";
import { toLenientNumber } from "@/routes/api/public/listings/upsert";
import { geographyKey } from "./private-listing-geography";
import { placeMatches, type PlaceChoice } from "./search-places";
import { detectResidentialComplex } from "./acp/complexes";
import { zoneRelation } from "./bucharest-zones";

export const SOCIAL_REQUESTS_MAX_PER_CALL = 500;
export const SOCIAL_REQUESTS_RETENTION_DAYS = 30;

/** Bugete scrise românește: „90.000 €”, „1.200.000”, „85 mii”, „90k”. */
export function budgetNumber(v: unknown): unknown {
  if (typeof v !== "string") return toLenientNumber(v);
  const t = v.replace(/\s/g, "");
  const grouped = /\d{1,3}(?:[.,]\d{3})+(?![\d.,])/.exec(t);
  const base = grouped ? Number(grouped[0].replace(/[.,]/g, "")) : toLenientNumber(t);
  if (typeof base !== "number") return base;
  return /\d(mii|k)\b/i.test(t) || /\d(mii|k)$/i.test(t) ? base * 1000 : base;
}

const lenient = (int = false) =>
  z.preprocess((v) => {
    const n = int ? toLenientNumber(v, { int }) : budgetNumber(v);
    return typeof n === "number" && (!Number.isFinite(n) || n < 0) ? null : n;
  }, z.number().nonnegative().nullish());

const fold = (v: unknown) => (typeof v === "string" ? geographyKey(v) : v);

export function normalizeRequestTransaction(v: unknown): "cumparare" | "inchiriere" | null {
  const k = typeof v === "string" ? geographyKey(v) : "";
  if (!k) return null;
  if (/(inchir|rent|lease|chirie)/.test(k)) return "inchiriere";
  if (/(cumpar|buy|sale|vanz|achiz)/.test(k)) return "cumparare";
  return null;
}
export function normalizePublisherType(v: unknown): "particular" | "neclar" | "agentie" | null {
  const k = typeof v === "string" ? geographyKey(v) : "";
  if (!k) return null;
  if (/agent/.test(k)) return "agentie";
  if (/(particular|owner|private|persoana)/.test(k)) return "particular";
  return "neclar";
}

const optText = (max: number) => z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v), z.string().max(max).nullish());

export const socialRequestSchema = z.object({
  source: z.string().min(1).max(50).regex(/^[a-z0-9_.-]+$/),
  external_id: z.string().min(1).max(200),
  url: z.string().url().max(2000).nullish(),
  group_name: optText(300),
  posted_at: z.string().datetime({ offset: true }).nullish(),
  // Textele mai lungi se taie la 5000 de caractere în loc să respingă tot lotul.
  text: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 5000) : v), z.string().max(5000).nullish()),
  author_name: optText(200),
  publisher_type: z.preprocess(fold, z.string().max(50).nullish()),
  transaction_type: z.string().max(50).nullish(),
  property_type: optText(100),
  rooms: z.preprocess((v) => { const n = toLenientNumber(v, { int: true }); return typeof n === "number" && (n < 0 || n > 20) ? null : n; }, z.number().int().nullish()),
  budget_min: lenient(),
  budget_max: lenient(),
  currency: optText(8),
  county: optText(100),
  city: optText(100),
  zone: z.union([z.string().max(500), z.array(z.string().max(150)).max(30)]).nullish(),
  phone: optText(50),
});
export const socialRequestsBodySchema = z.object({ requests: z.array(socialRequestSchema).min(1).max(SOCIAL_REQUESTS_MAX_PER_CALL) });

export function buildSocialRequestRow(input: unknown): Record<string, unknown> {
  const r = socialRequestSchema.parse(input);
  const zones = Array.isArray(r.zone) ? r.zone.map((z) => z.trim()).filter(Boolean) : null;
  let min = r.budget_min ?? null, max = r.budget_max ?? null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return {
    source: r.source, external_id: r.external_id, url: r.url ?? null, group_name: r.group_name ?? null,
    posted_at: r.posted_at ?? null, text: r.text ?? null, author_name: r.author_name ?? null,
    publisher_type: normalizePublisherType(r.publisher_type), transaction_type: normalizeRequestTransaction(r.transaction_type),
    property_type: r.property_type ?? null, rooms: r.rooms ?? null, budget_min: min, budget_max: max,
    currency: r.currency ? r.currency.toUpperCase().replace("€", "EUR") : (min !== null || max !== null ? "EUR" : null),
    county: r.county ?? null, city: r.city ?? null,
    zone: zones ? zones.join(", ") || null : (r.zone as string | null | undefined) ?? null,
    zones: zones ?? [], phone: r.phone ?? null,
  };
}

export const REQUEST_TRANSACTION_LABELS = { cumparare: "Cumpărare", inchiriere: "Închiriere" } as const;
export const REQUEST_PROPERTY_TYPES = ["Apartament", "Casă", "Teren", "Spațiu comercial", "Birou"] as const;

/** Tipul cererii, comparat tolerant cu tipul proprietății din CRM. */
export function propertyTypeKey(v?: string | null): string {
  const k = geographyKey(v);
  if (!k) return "";
  if (/(apart|garson|studio)/.test(k)) return "apartament";
  if (/(casa|vila|house|duplex)/.test(k)) return "casa";
  if (/(teren|land)/.test(k)) return "teren";
  if (/(birou|office)/.test(k)) return "birou";
  if (/(comerc|spatiu|retail|hala|depozit)/.test(k)) return "comercial";
  return k;
}

export type RequestForMatch = {
  transaction_type: string | null; property_type: string | null; rooms: number | null;
  budget_min: number | null; budget_max: number | null; currency: string | null;
  county: string | null; city: string | null; zones: string[];
};
export type PropertyForMatch = {
  transaction_kind: "sale" | "rent"; property_type: string | null; rooms: number | null;
  price: number | null; currency: string | null; county: string | null; city: string | null; district: string | null;
  title?: string | null; address?: string | null;
};
export type RequestMatch = { score: number; reasons: string[]; kind: "strict" | "close"; differences: string[] };
export type MatchMode = "strict" | "close";

/** Zonele cererii ca alegeri „Localități și zone” (aceeași regulă ca filtrele). */
export function requestPlaceChoices(r: Pick<RequestForMatch, "county" | "city" | "zones">): PlaceChoice[] {
  // Aceeași cheie de localitate ca `placeMatches` („Sector 6” → București), altfel sectoarele nu se potrivesc niciodată.
  const county = geographyKey(r.county), city = placeCityKey(r.city);
  const sector = geographyKey(r.city).match(/^sector [1-6]$/)?.[0];
  if (r.zones.length && city) return r.zones.map((z) => ({ kind: "zone", county, city, zone: geographyKey(z) }));
  // Doar sectorul, fără zone: rămâne limitat la acel sector.
  if (sector) return [{ kind: "zone", county, city, zone: sector }];
  if (city) return [{ kind: "city", county, city, zone: "" }];
  if (county) return [{ kind: "county", county, city: "", zone: "" }];
  return [];
}

type PlaceResult = { rel: "strict" | "near"; reason: string } | null;

/** Zona cererii vs proprietate: localitate/zonă exactă, subzonă↔cartier, ansamblu (ACP) sau vecinătate. */
export function requestPlaceRelation(r: Pick<RequestForMatch, "county" | "city" | "zones">, p: PropertyForMatch): PlaceResult {
  const choices = requestPlaceChoices(r);
  const complex = detectResidentialComplex(p.title, p.address, p.district);
  // Ansamblul are propria localitate (ex. Militari Residence → Chiajna), indiferent de fișă.
  const loc = complex
    ? { county: complex.county, city: complex.city, district: complex.label }
    : { county: p.county, city: p.city, district: p.district, zone: geographyKey(p.city).match(/^sector [1-6]$/)?.[0] ?? null };
  if (placeMatches(loc, choices)) return { rel: "strict", reason: complex ? `${complex.label} (${complex.city})` : "zonă" };
  const reqBuc = geographyKey(r.city).includes("bucuresti") || geographyKey(r.county).includes("bucuresti");
  const propZone = complex ? complex.label : p.district;
  const propBuc = complex ? true : geographyKey(p.city).includes("bucuresti") || geographyKey(p.county).includes("bucuresti");
  if (!reqBuc || !propBuc || !r.zones.length) return null;
  let near: PlaceResult = null;
  for (const z of r.zones) {
    const rel = zoneRelation(z, propZone);
    if (rel === "same") return { rel: "strict", reason: `zonă înrudită: ${z} ↔ ${propZone}` };
    if (rel === "neighbor" && !near) near = { rel: "near", reason: `${propZone} e zonă vecină cu ${z}` };
  }
  return near;
}

/**
 * Potrivire deterministă. Tranzacția și tipul sunt obligatorii dacă cererea le are.
 * Strict: camere exacte, buget ±10%, zonă (inclusiv subzonă↔cartier și ansamblu).
 * Apropiat: camere ±1, buget ±20%, zonă vecină — cu motivul fiecărei diferențe și scor mai mic.
 * Null = nu se potrivește.
 */
export function matchRequestProperty(r: RequestForMatch, p: PropertyForMatch, mode: MatchMode = "strict"): RequestMatch | null {
  const reasons: string[] = [], differences: string[] = [];
  let ok = 0, penalty = 0;
  const close = mode === "close";
  if (r.transaction_type) {
    if ((r.transaction_type === "inchiriere" ? "rent" : "sale") !== p.transaction_kind) return null;
    ok++; reasons.push(REQUEST_TRANSACTION_LABELS[r.transaction_type as keyof typeof REQUEST_TRANSACTION_LABELS] ?? r.transaction_type);
  }
  if (r.property_type) {
    if (propertyTypeKey(r.property_type) !== propertyTypeKey(p.property_type)) return null;
    ok++; reasons.push("tip");
  }
  if (r.rooms !== null) {
    if (p.rooms === null) return null;
    const d = Math.abs(p.rooms - r.rooms);
    if (d === 0) { ok++; reasons.push(`${r.rooms} camere`); }
    else if (close && d === 1) { ok += 0.5; penalty += 10; differences.push(`${p.rooms} camere în loc de ${r.rooms}`); }
    else return null;
  }
  if (r.budget_min !== null || r.budget_max !== null) {
    const sameCurrency = (r.currency ?? "EUR").toUpperCase() === (p.currency ?? "EUR").toUpperCase();
    if (p.price === null || !sameCurrency) return null;
    const within = (f: number) => (r.budget_min === null || p.price! >= r.budget_min * (1 - f)) && (r.budget_max === null || p.price! <= r.budget_max * (1 + f));
    if (within(0.1)) { ok++; reasons.push("buget"); }
    else if (close && within(0.2)) {
      ok += 0.5; penalty += 10;
      differences.push(r.budget_max !== null && p.price > r.budget_max ? `preț cu ${Math.round((p.price / r.budget_max - 1) * 100)}% peste buget` : "preț sub bugetul minim");
    } else return null;
  }
  if (requestPlaceChoices(r).length) {
    const place = requestPlaceRelation(r, p);
    if (!place) return null;
    if (place.rel === "strict") { ok++; reasons.push(place.reason); }
    else if (close) { ok += 0.5; penalty += 10; differences.push(place.reason); }
    else return null;
  }
  return { score: Math.max(0, Math.round((ok / 5) * 100) - penalty), reasons, kind: differences.length ? "close" : "strict", differences };
}

/** Potrivirile stricte; dacă nu există, potrivirile apropiate (ordonate după scor). */
export function rankRequestMatches<T extends PropertyForMatch>(r: RequestForMatch, props: T[], limit = 30): { kind: "strict" | "close"; items: { property: T; match: RequestMatch }[] } {
  const run = (mode: MatchMode) => props.flatMap((p) => { const m = matchRequestProperty(r, p, mode); return m && (mode === "strict" || m.kind === "close") ? [{ property: p, match: m }] : []; })
    .sort((a, b) => b.match.score - a.match.score).slice(0, limit);
  const strict = run("strict");
  return strict.length ? { kind: "strict", items: strict } : { kind: "close", items: run("close") };
}
