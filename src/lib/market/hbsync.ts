import { z } from "zod";
import { hasAcpMinimumData } from "./adapter";
import { normalizeRecord, type MarketFieldMapping, type NormalizedListing } from "./normalize";

const text = (max: number) => z.string().max(max).nullish();
const number = z.number().finite().nonnegative().nullish();
const crmSchema = z.object({
  titlu: text(500), localitate: text(100), judet: text(100), sector: text(150), zona: text(150),
  camere: z.number().int().nonnegative().nullish(), tip_tranzactie: text(50), tip_proprietate: text(100),
  pret_eur: number, suprafata_mp: number, url: z.string().url().max(2000).nullish(), perioada: text(100),
});
export const hbsyncMarketListingSchema = z.object({
  source: z.enum(["storia", "olx", "romimo", "imobiliare"]), external_id: z.string().min(1).max(200),
  url: z.string().url().max(2000).nullish(), title: text(500),
  deal_type: text(50), property_type: text(100), price: number, currency: text(8),
  surface_built: number, rooms: z.number().int().nonnegative().nullish(),
  city: text(100), county: text(100), sector: text(150), neighborhood: text(150),
  publisher_type: z.enum(["particular", "agency", "unknown"]).nullish(),
  first_seen_at: z.string().datetime({ offset: true }).nullish(),
  last_seen_at: z.string().datetime({ offset: true }).nullish(),
  status: text(50), images: z.array(z.string().url().max(2000)).max(12).nullish(),
  period: text(100), crm: crmSchema.nullish(),
});
export const hbsyncMarketBodySchema = z.object({ listings: z.array(z.unknown()).min(1).max(500) });

const mapping: MarketFieldMapping = {
  sourceListingId: "external_id", url: "url", title: "title", imageUrl: "image",
  propertyType: "property_type", transactionType: "transaction", city: "city", county: "county",
  district: "neighborhood", neighborhood: "neighborhood", rooms: "rooms", totalArea: "surface",
  price: "price", currency: "currency", status: "status",
};
const types: Record<string, string> = {
  apartment: "apartament", house: "casa", land: "teren", office: "birou",
  commercial: "spatiu comercial", warehouse: "hala",
};

/** Strict structured data only: no contact, description parsing, or generated prices. */
export function normalizeHbsyncMarketListing(input: unknown):
  { ok: true; listing: NormalizedListing } | { ok: false; reference: string; message: string } {
  const parsed = hbsyncMarketListingSchema.safeParse(input);
  if (!parsed.success) {
    const reference = input && typeof input === "object" && "external_id" in input && typeof input.external_id === "string" && input.external_id.trim()
      ? input.external_id : "invalid";
    return { ok: false, reference, message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const row = parsed.data;
  const crm = row.crm;
  const period = row.period ?? crm?.perioada ?? null;
  if (period && /^(zi|day|noapte)$/i.test(period.trim())) {
    return { ok: false, reference: row.external_id, message: "Închirierea pe zi nu este comparabilă cu chiria lunară ACP." };
  }
  const deal = row.deal_type ?? crm?.tip_tranzactie;
  const propertyType = row.property_type ?? crm?.tip_proprietate;
  const currency = row.price != null ? row.currency : (crm?.pret_eur != null ? "EUR" : row.currency);
  const images = (row.images ?? []).filter(url => /^https?:\/\//i.test(url));
  const result = normalizeRecord(row.source, {
    external_id: row.external_id, url: row.url ?? crm?.url, title: row.title ?? crm?.titlu,
    property_type: propertyType ? (types[propertyType] ?? propertyType) : null,
    transaction: deal === "lease" ? "rent" : deal,
    city: row.city ?? crm?.localitate, county: row.county ?? crm?.judet,
    neighborhood: row.neighborhood ?? crm?.zona, rooms: row.rooms ?? crm?.camere,
    surface: row.surface_built ?? crm?.suprafata_mp, price: row.price ?? crm?.pret_eur,
    currency, status: row.status, image: images[0],
  }, mapping);
  if (!result.ok) return { ok: false, reference: row.external_id, message: result.issues.map(i => i.message).join("; ") };
  const missing = hasAcpMinimumData(result.listing);
  if (missing || !result.listing.currency || result.listing.propertyType === "unknown") {
    return { ok: false, reference: row.external_id, message: missing ?? "Moneda sau tipul proprietății nu este cunoscut." };
  }
  const firstSeenAt = row.first_seen_at ?? null;
  return { ok: true, listing: {
    ...result.listing,
    publisherType: row.publisher_type ?? null,
    isPrivate: row.publisher_type === "particular" ? true : row.publisher_type === "agency" ? false : null,
    sector: row.sector ?? crm?.sector ?? null, images, importProvider: "hbsync", period,
    observedFirstSeenAt: firstSeenAt,
    observedLastSeenAt: row.last_seen_at ?? firstSeenAt,
  } };
}