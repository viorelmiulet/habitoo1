// Modulul „Anunțuri particulari”: citește anunțurile importate (hbsync) ca
// utilizatorul conectat. Orice agent sau administrator de agenție activă are acces.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { buildListingFacets, geographyKey, zoneFilter, type GeographyRow, type ListingFacets } from "./private-listing-geography";
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
  url: string | null;
  description: string | null;
  images: string[];
  scrapedAt: string | null;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const privateListingsFiltersSchema = z.object({
  county: z.string().max(100).optional(),
  city: z.string().max(80).optional(),
  zone: z.string().max(80).optional(),
  rooms: z.array(z.number().int()).max(5).optional(),
  q: z.string().max(200).optional(),
  page: z.number().int().min(0).max(1000).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "surface_desc"]).optional(),
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
        "id, source, title, price, currency, price_per_m2, rooms, surface, floor, city, zone, location, county, property_type, transaction_type, url, description, images, scraped_at",
        { count: "exact" },
      )
      .eq("is_owner", true);

    const county = geographyKey(data.county);
    const city = geographyKey(data.city);
    const zone = geographyKey(data.zone);
    if (county) query = query.eq("county_key", county);
    if (city) query = query.eq("city_key", city);
    if (zone) {
      const filter = zoneFilter(zone);
      // Non-sector legacy zona links may refer to the old zone column.
      query = filter.column === "zone_key" ? query.eq(filter.column, filter.value)
        : query.or(`neighborhood_key.eq.${filter.value},zone_key.eq.${filter.value}`);
    }

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
    const order = PRIVATE_LISTINGS_ORDER[data.sort ?? "newest"];
    const { data: rows, error, count } = await query
      .order(order.column, { ascending: order.ascending, nullsFirst: false })
      .order("scraped_at", { ascending: false, nullsFirst: false })
      .range(from, from + PRIVATE_LISTINGS_PAGE_SIZE - 1);
    if (error) throw new Error("Anunțurile nu pot fi încărcate acum.");

    return {
      total: count ?? 0,
      items: (rows ?? []).map((row) => toOwnerListing(row as ListingRow)),
    };
  });

/** Complete, counted geography facets; every page is read under caller RLS. */
export const getOwnerListingFacets = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<ListingFacets> => {
    const rows: GeographyRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await context.supabase.from("listings")
        .select("city, county, zone, neighborhood, property_type").eq("is_owner", true)
        .order("id").range(from, from + 999);
      if (error) throw new Error("Localizările nu pot fi încărcate acum.");
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    return buildListingFacets(rows);
  });

const LISTING_COLUMNS =
  "id, source, title, price, currency, price_per_m2, rooms, surface, floor, city, zone, location, county, property_type, transaction_type, url, description, images, scraped_at";

type ListingRow = {
  id: string;
  source: string;
  title: string | null;
  price: number | string | null;
  currency: string | null;
  price_per_m2: number | string | null;
  rooms: number | null;
  surface: number | string | null;
  floor: string | null;
  city: string | null;
  zone: string | null;
  location: string | null;
  county: string | null;
  property_type: string | null;
  transaction_type: string | null;
  url: string | null;
  description: string | null;
  images: unknown;
  scraped_at: string | null;
};

function toOwnerListing(row: ListingRow): OwnerListing {
  return {
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
    url: row.url,
    description: row.description,
    images: Array.isArray(row.images) ? row.images.filter((u): u is string => typeof u === "string") : [],
    scrapedAt: row.scraped_at,
  };
}

/** Detaliul complet al unui anunț de proprietar (toate pozele și descrierea). */
export const getOwnerListing = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OwnerListing | null> => {
    const { data: row, error } = await context.supabase
      .from("listings")
      .select(LISTING_COLUMNS)
      .eq("id", data.id)
      .eq("is_owner", true)
      .maybeSingle();
    if (error) throw new Error("Anunțul nu poate fi încărcat acum.");
    return row ? toOwnerListing(row as ListingRow) : null;
  });

export type ListingComment = {
  id: string;
  authorName: string;
  orgName: string | null;
  body: string;
  createdAt: string;
};

/** Comentariile unui anunț — vizibile tuturor agenților, din orice agenție. */
export const getListingComments = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ListingComment[]> => {
    const { data: rows, error } = await context.supabase
      .from("listing_comments")
      .select("id, author_name, org_name, body, created_at")
      .eq("listing_id", data.listingId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error("Comentariile nu pot fi încărcate acum.");
    return (rows ?? []).map((row) => ({
      id: row.id,
      authorName: row.author_name,
      orgName: row.org_name,
      body: row.body,
      createdAt: row.created_at,
    }));
  });

export const LISTING_COMMENT_MAX_LENGTH = 1000;

/** Adaugă un comentariu; numele autorului și agenția se preiau din profil, nu din client. */
export const addListingComment = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        listingId: z.string().uuid(),
        body: z.string().trim().min(1, "Scrie un comentariu.").max(LISTING_COMMENT_MAX_LENGTH),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ListingComment> => {
    const userId = (context as { userId: string }).userId;
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name, organization_id")
      .eq("id", userId)
      .maybeSingle();
    let orgName: string | null = null;
    if (profile?.organization_id) {
      const { data: org } = await context.supabase
        .from("organizations")
        .select("name")
        .eq("id", profile.organization_id)
        .maybeSingle();
      orgName = org?.name ?? null;
    }
    const authorName = profile?.full_name?.trim() || "Agent";
    const { data: row, error } = await context.supabase
      .from("listing_comments")
      .insert({
        listing_id: data.listingId,
        author_id: userId,
        author_name: authorName,
        org_name: orgName,
        body: data.body,
      })
      .select("id, author_name, org_name, body, created_at")
      .single();
    if (error || !row) throw new Error("Comentariul nu a putut fi salvat. Reîncearcă.");
    return {
      id: row.id,
      authorName: row.author_name,
      orgName: row.org_name,
      body: row.body,
      createdAt: row.created_at,
    };
  });
