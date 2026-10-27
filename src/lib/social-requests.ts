// Cererile clienților din grupurile publice (Facebook): validare import și potrivire cu proprietăți.
import { z } from "zod";
import { toLenientNumber } from "@/routes/api/public/listings/upsert";
import { geographyKey } from "./private-listing-geography";
import { placeMatches, type PlaceChoice } from "./search-places";

export const SOCIAL_REQUESTS_MAX_PER_CALL = 500;
export const SOCIAL_REQUESTS_RETENTION_DAYS = 30;

const lenient = (int = false) =>
  z.preprocess((v) => {
    const n = toLenientNumber(v, { int });
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
};
export type RequestMatch = { score: number; reasons: string[] };

/** Zonele cererii ca alegeri „Localități și zone” (aceeași regulă ca filtrele). */
export function requestPlaceChoices(r: Pick<RequestForMatch, "county" | "city" | "zones">): PlaceChoice[] {
  const county = geographyKey(r.county), city = geographyKey(r.city);
  if (r.zones.length && city) return r.zones.map((z) => ({ kind: "zone", county, city, zone: geographyKey(z) }));
  if (city) return [{ kind: "city", county, city, zone: "" }];
  if (county) return [{ kind: "county", county, city: "", zone: "" }];
  return [];
}

/**
 * Potrivire deterministă. Tranzacția și tipul sunt obligatorii dacă cererea le are;
 * camerele, bugetul (±10%) și zona trebuie să se potrivească când sunt cunoscute.
 * Scorul = criterii confirmate / criterii cunoscute. Null = nu se potrivește.
 */
export function matchRequestProperty(r: RequestForMatch, p: PropertyForMatch): RequestMatch | null {
  const reasons: string[] = [];
  let known = 0, ok = 0;
  if (r.transaction_type) {
    known++;
    if ((r.transaction_type === "inchiriere" ? "rent" : "sale") !== p.transaction_kind) return null;
    ok++; reasons.push(REQUEST_TRANSACTION_LABELS[r.transaction_type as keyof typeof REQUEST_TRANSACTION_LABELS] ?? r.transaction_type);
  }
  if (r.property_type) {
    known++;
    if (propertyTypeKey(r.property_type) !== propertyTypeKey(p.property_type)) return null;
    ok++; reasons.push("tip");
  }
  if (r.rooms !== null) {
    known++;
    if (p.rooms === null || p.rooms !== r.rooms) return null;
    ok++; reasons.push(`${r.rooms} camere`);
  }
  if (r.budget_min !== null || r.budget_max !== null) {
    known++;
    const sameCurrency = (r.currency ?? "EUR").toUpperCase() === (p.currency ?? "EUR").toUpperCase();
    if (p.price === null || !sameCurrency) return null;
    const lo = r.budget_min !== null ? r.budget_min * 0.9 : 0;
    const hi = r.budget_max !== null ? r.budget_max * 1.1 : Number.POSITIVE_INFINITY;
    if (p.price < lo || p.price > hi) return null;
    ok++; reasons.push("buget");
  }
  const choices = requestPlaceChoices(r);
  if (choices.length) {
    known++;
    if (!placeMatches({ county: p.county, city: p.city, district: p.district }, choices)) return null;
    ok++; reasons.push("zonă");
  }
  return { score: known ? Math.round((ok / known) * 100) : 0, reasons };
}
