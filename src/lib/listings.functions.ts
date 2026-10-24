// Modulul „Anunțuri particulari”: citește anunțurile importate (hbsync) ca
// utilizatorul conectat. Orice agent sau administrator de agenție activă are acces.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  PRIVATE_LISTINGS_ORDER,
  PRIVATE_LISTINGS_PAGE_SIZE,
  cleanText,
  keywordTerms,
  normalizeRooms,
} from "@/lib/private-listings";

export type OwnerListing = {
  id: string;
  source: string;
  title: string | null;
  price: number | null;
  currency: string | null;
  pricePerM2: number | null;
  rooms: number | null;
  surface: number | null;
  floor: string | null;
  city: string | null;
  zone: string | null;
  location: string | null;
  county: string | null;
  propertyType: string | null;
  transactionType: string | null;
  phone: string | null;
  url: string | null;
  description: string | null;
  images: string[];
  scrapedAt: string | null;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const privateListingsFiltersSchema = z.object({
  city: z.string().max(80).optional(),
  zone: z.string().max(80).optional(),
  rooms: z.array(z.number().int()).max(5).optional(),
  q: z.string().max(200).optional(),
  page: z.number().int().min(0).max(1000).optional(),
  source: z.enum(["storia", "imobiliare", "olx", "romimo"]).optional(),
  transaction: z.enum(["sale", "rent", "rent_day"]).optional(),
  priceMin: z.number().min(0).max(1e9).optional(),
  priceMax: z.number().min(0).max(1e9).optional(),
  surfaceMin: z.number().min(0).max(1e6).optional(),
  surfaceMax: z.number().min(0).max(1e6).optional(),
  propertyType: z.string().max(80).optional(),
});

export const TRANSACTION_FILTERS: Record<"sale" | "rent" | "rent_day", string> = {
  sale: "transaction_type.ilike.%vanz%,transaction_type.ilike.%vânz%,transaction_type.ilike.%sale%",
  rent: "transaction_type.ilike.%inch%,transaction_type.ilike.%închi%,transaction_type.ilike.%Închi%,transaction_type.ilike.%rent%,transaction_type.ilike.%lease%",
  rent_day: "transaction_type.ilike.%pe zi%,description.ilike.%pe zi%",
};

export const getOwnerListings = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => privateListingsFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ items: OwnerListing[]; total: number }> => {
    const page = data.page ?? 0;
    let query = context.supabase
      .from("listings")
      .select(
        "id, source, title, price, currency, price_per_m2, rooms, surface, floor, city, zone, location, county, property_type, transaction_type, phone, url, description, images, scraped_at",
        { count: "exact" },
      )
      .eq("is_owner", true);

    const city = cleanText(data.city);
    const zone = cleanText(data.zone);
    if (city) query = query.ilike("city", city);
    if (zone) query = query.ilike("zone", zone);

    if (data.source) query = query.eq("source", data.source);
    if (data.transaction) query = query.or(TRANSACTION_FILTERS[data.transaction]);
    const propertyType = cleanText(data.propertyType);
    if (propertyType) query = query.ilike("property_type", propertyType);
    if (data.priceMin !== undefined) query = query.gte("price", data.priceMin);
    if (data.priceMax !== undefined) query = query.lte("price", data.priceMax);
    if (data.surfaceMin !== undefined) query = query.gte("surface", data.surfaceMin);
    if (data.surfaceMax !== undefined) query = query.lte("surface", data.surfaceMax);

    const rooms = normalizeRooms(data.rooms);
    if (rooms.length) {
      const exact = rooms.filter((r) => r < 5);
      const parts = exact.length ? [`rooms.in.(${exact.join(",")})`] : [];
      if (rooms.includes(5)) parts.push("rooms.gte.5");
      query = query.or(parts.join(","));
    }

    for (const term of keywordTerms(data.q)) {
      query = query.or(
        `title.ilike.%${term}%,description.ilike.%${term}%,location.ilike.%${term}%`,
      );
    }

    const from = page * PRIVATE_LISTINGS_PAGE_SIZE;
    const { data: rows, error, count } = await query
      .order("scraped_at", { ascending: false, nullsFirst: false })
      .range(from, from + PRIVATE_LISTINGS_PAGE_SIZE - 1);
    if (error) throw new Error("Anunțurile nu pot fi încărcate acum.");

    return {
      total: count ?? 0,
      items: (rows ?? []).map((row) => ({
        id: row.id,
        source: row.source,
        title: row.title,
        price: num(row.price),
        currency: row.currency,
        pricePerM2: num(row.price_per_m2),
        rooms: row.rooms,
        surface: num(row.surface),
        floor: row.floor,
        city: row.city,
        zone: row.zone,
        location: row.location,
        county: row.county,
        propertyType: row.property_type,
        transactionType: row.transaction_type,
        phone: row.phone,
        url: row.url,
        description: row.description,
        images: Array.isArray(row.images) ? row.images.filter((u): u is string => typeof u === "string") : [],
        scrapedAt: row.scraped_at,
      })),
    };
  });

/** Orașele, zonele și tipurile de proprietate existente, pentru listele din filtre. */
export const getOwnerListingFacets = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<{ cities: string[]; zones: Record<string, string[]>; propertyTypes: string[] }> => {
    const { data } = await context.supabase
      .from("listings")
      .select("city, zone, property_type")
      .eq("is_owner", true)
      .not("city", "is", null)
      .limit(5000);
    const zones: Record<string, Set<string>> = {};
    const propertyTypes = new Set<string>();
    for (const row of data ?? []) {
      const c = row.city?.trim();
      if (!c) continue;
      zones[c] ??= new Set();
      if (row.zone?.trim()) zones[c].add(row.zone.trim());
      if (row.property_type?.trim()) propertyTypes.add(row.property_type.trim());
    }
    const sort = (a: string, b: string) => a.localeCompare(b, "ro");
    return {
      cities: Object.keys(zones).sort(sort),
      zones: Object.fromEntries(Object.entries(zones).map(([c, s]) => [c, [...s].sort(sort)])),
      propertyTypes: [...propertyTypes].sort(sort),
    };
  });
