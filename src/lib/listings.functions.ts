// Modulul „Anunțuri particulari”: citește anunțurile importate (hbsync) ca
// utilizatorul conectat. Orice agent sau administrator de agenție activă are acces.
import { buildSearchPlaces, placeChoiceSchema, type SearchPlaceOption } from "./search-places";
import { isListPageSize } from "@/lib/list-page-size";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { buildListingFacets, geographyKey, type GeographyRow, type ListingFacets } from "./private-listing-geography";
import {
  PRIVATE_LISTINGS_CATEGORY_FILTERS,
  PRIVATE_LISTINGS_ORDER,
  PRIVATE_LISTINGS_PAGE_SIZE,
  cleanText,
  daysCutoff,
  interleaveNewest,
  keywordTerms,
  normalizeRooms,
  romaniaTodayStart,
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
  firstSeenAt: string | null;
  phone: string | null;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const privateListingsFiltersSchema = z.object({
  scope: z.enum(["habitoo", "facebook"]).optional(),
  places: z.array(placeChoiceSchema).optional(),
  county: z.string().max(100).optional(),
  city: z.string().max(80).optional(),
  zone: z.array(z.string().max(80)).max(30).optional(),
  rooms: z.array(z.number().int()).max(5).optional(),
  q: z.string().max(200).optional(),
  page: z.number().int().min(0).max(1000).optional(),
  pageSize: z.number().int().refine(isListPageSize, "Mărime de pagină invalidă.").optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "surface_desc"]).optional(),
  source: z.enum(["storia", "imobiliare", "olx", "romimo", "imoradar", "anuntul", "facebook"]).optional(),
  transaction: z.enum(["sale", "rent", "rent_day"]).optional(),
  priceMin: z.number().min(0).max(1e9).optional(),
  priceMax: z.number().min(0).max(1e9).optional(),
  surfaceMin: z.number().min(0).max(1e6).optional(),
  surfaceMax: z.number().min(0).max(1e6).optional(),
  propertyType: z.string().max(80).optional(),
  category: z.enum(["apartamente", "case", "comerciale", "terenuri"]).optional(),
  days: z.number().int().min(0).max(7).optional(),
  externalId: z.string().max(200).optional(),
  floorMin: z.number().int().min(-5).max(100).optional(),
  floorMax: z.number().int().min(-5).max(100).optional(),
  yearMin: z.number().int().min(1800).max(2100).optional(),
  yearMax: z.number().int().min(1800).max(2100).optional(),
  yearUnknown: z.boolean().optional(),
});

export const TRANSACTION_FILTERS: Record<"sale" | "rent" | "rent_day", string> = {
  sale: "transaction_type.ilike.%vanz%,transaction_type.ilike.%vânz%,transaction_type.ilike.%sale%",
  rent: "transaction_type.ilike.%inch%,transaction_type.ilike.%închi%,transaction_type.ilike.%Închi%,transaction_type.ilike.%rent%,transaction_type.ilike.%lease%",
  rent_day: "transaction_type.ilike.%pe zi%,description.ilike.%pe zi%",
};

type PrivateListingsInput = z.infer<typeof privateListingsFiltersSchema>;

/** Structural query interface: PostgREST filter builders return `this`. */
interface OwnerFilterQuery<Q> {
  eq(column: string, value: unknown): Q;
  or(filter: string): Q;
  ilike(column: string, pattern: string): Q;
  gte(column: string, value: number | string): Q;
  lte(column: string, value: number | string): Q;
}

/** Toate filtrele listei, aplicate identic în ambele faze ale sortării „Cele mai noi”. */
function applyOwnerFilters<Q extends OwnerFilterQuery<Q>>(query: Q, data: PrivateListingsInput): Q {
  query = applyOwnerScope(query, data.scope);
  const county = geographyKey(data.county);
  const city = geographyKey(data.city);
  const zones = [...new Set((data.zone ?? []).map(geographyKey).filter(Boolean))];
  if (!data.places?.length && county) query = query.eq("county_key", county);
  if (!data.places?.length && city) query = query.eq("city_key", city);
  if (!data.places?.length && zones.length) {
    // Mai multe zone odată: anunțurile din oricare zonă aleasă. Un sector include
    // și anunțurile fără cartier; linkurile vechi pot viza coloana zone.
    const sectors = zones.filter((z) => /^sector [1-6]$/.test(z));
    const neighborhoods = zones.filter((z) => !/^sector [1-6]$/.test(z));
    const parts = [`zone_key.in.(${[...sectors, ...neighborhoods].join(",")})`];
    if (neighborhoods.length) parts.push(`neighborhood_key.in.(${neighborhoods.join(",")})`);
    query = query.or(parts.join(","));
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

  if (data.category) query = query.or(PRIVATE_LISTINGS_CATEGORY_FILTERS[data.category]);
  if (data.days !== undefined) query = query.gte("first_seen_at", daysCutoff(data.days));
  const externalId = cleanText(data.externalId);
  if (externalId) query = query.eq("external_id", externalId);
  if (data.floorMin !== undefined) query = query.gte("floor_num", data.floorMin);
  if (data.floorMax !== undefined) query = query.lte("floor_num", data.floorMax);
  if (data.yearMin !== undefined) {
    query = data.yearUnknown === false
      ? query.gte("year_built", data.yearMin)
      : query.or(`year_built.gte.${data.yearMin},year_built.is.null`);
  }
  if (data.yearMax !== undefined) {
    query = data.yearUnknown === false
      ? query.lte("year_built", data.yearMax)
      : query.or(`year_built.lte.${data.yearMax},year_built.is.null`);
  }
  return query;
}

/** Scope precedes all counts, pagination and geography facets. */
function applyOwnerScope<Q extends Pick<OwnerFilterQuery<Q>, "eq" | "or">>(query: Q, scope: "habitoo" | "facebook" = "habitoo"): Q {
  return scope === "facebook" ? query.eq("source", "facebook") : query.or("source.neq.facebook");
}

export const getOwnerListings = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => privateListingsFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ items: OwnerListing[]; total: number; newToday: number }> => {
    const page = data.page ?? 0;
    const size = data.pageSize ?? PRIVATE_LISTINGS_PAGE_SIZE;
    const from = page * size;
    const sort = data.sort ?? "newest";
    const todayStart = romaniaTodayStart().toISOString();

    if (sort !== "newest") {
      let query = (data.places?.length ? context.supabase.rpc("search_listings_places", { _choices: data.places }, { count: "exact" }) : context.supabase.from("listings"))
        .select(LISTING_COLUMNS, { count: "exact" })
        .eq("is_owner", true);
      query = applyOwnerFilters(query, data);
      const order = PRIVATE_LISTINGS_ORDER[sort];
      const { data: rows, error, count } = await query
        .order(order.column, { ascending: order.ascending, nullsFirst: false })
        .order("scraped_at", { ascending: false, nullsFirst: false })
        .order("id")
        .range(from, from + size - 1);
      if (error) throw new Error("Anunțurile nu pot fi încărcate acum.");
      let todayQuery = (data.places?.length ? context.supabase.rpc("search_listings_places", { _choices: data.places }, { count: "exact" }) : context.supabase.from("listings"))
        .select("id", { count: "exact", head: true })
        .eq("is_owner", true);
      todayQuery = applyOwnerFilters(todayQuery, data).gte("first_seen_at", todayStart);
      const { count: newToday, error: todayError } = await todayQuery;
      if (todayError) throw new Error("Anunțurile nu pot fi încărcate acum.");
      return {
        total: count ?? 0,
        newToday: newToday ?? 0,
        items: (rows ?? []).map((row) => toOwnerListing(row as ListingRow)),
      };
    }

    // „Cele mai noi": faza 1 citește doar id/sursă/dată pentru toate
    // rezultatele filtrate, faza 2 aduce rândurile complete ale paginii
    // intercalate pe surse. Totalul și filtrele rămân identice.
    let idQuery = (data.places?.length ? context.supabase.rpc("search_listings_places", { _choices: data.places }, { count: "exact" }) : context.supabase.from("listings"))
      .select("id, source, first_seen_at")
      .eq("is_owner", true);
    idQuery = applyOwnerFilters(idQuery, data);
    const matches: { id: string; source: string; first_seen_at: string | null }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: batch, error } = await idQuery.order("id").range(offset, offset + 999);
      if (error) throw new Error("Anunțurile nu pot fi încărcate acum.");
      matches.push(...(batch ?? []));
      if ((batch?.length ?? 0) < 1000) break;
    }
    const ordered = interleaveNewest(matches);
    const newToday = matches.filter((row) => (row.first_seen_at ?? "") >= todayStart).length;
    const pageIds = ordered.slice(from, from + size).map((row) => row.id);
    if (pageIds.length === 0) return { total: ordered.length, newToday, items: [] };
    const pageQuery = (data.places?.length ? context.supabase.rpc("search_listings_places", { _choices: data.places }, { count: "exact" }) : context.supabase.from("listings"))
      .select(LISTING_COLUMNS)
      .eq("is_owner", true);
    const { data: rows, error } = await applyOwnerScope(pageQuery, data.scope)
      .in("id", pageIds);
    if (error) throw new Error("Anunțurile nu pot fi încărcate acum.");
    const byId = new Map((rows ?? []).map((row) => [(row as ListingRow).id, row as ListingRow]));
    return {
      total: ordered.length,
      newToday,
      items: pageIds
        .map((id) => byId.get(id))
        .filter((row): row is ListingRow => Boolean(row))
        .map(toOwnerListing),
    };
  });

/** Complete, counted geography facets; every page is read under caller RLS. */
export const getOwnerListingFacets = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ scope: z.enum(["habitoo", "facebook"]).optional() }).parse(input ?? {}))
  .handler(async ({ data: input, context }): Promise<ListingFacets & { places: SearchPlaceOption[] }> => {
    const rows: GeographyRow[] = [];
    for (let from = 0; ; from += 1000) {
      const query = context.supabase.from("listings")
        .select("city, county, zone, neighborhood, property_type").eq("is_owner", true)
      const { data, error } = await applyOwnerScope(query, input.scope)
        .order("id").range(from, from + 999);
      if (error) throw new Error("Localizările nu pot fi încărcate acum.");
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    return { ...buildListingFacets(rows), places: buildSearchPlaces(rows) };
  });

const LISTING_COLUMNS =
  "id, source, title, price, currency, price_per_m2, rooms, surface, floor, city, zone, location, county, property_type, transaction_type, url, description, images, scraped_at, first_seen_at, phone";

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
  first_seen_at: string | null;
  phone: string | null;
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
    firstSeenAt: row.first_seen_at,
    phone: row.phone,
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
