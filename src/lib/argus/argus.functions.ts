/**
 * Funcțiile server Argus — pasul 1: conectarea agenției + accesul de bază la
 * API, fără interfață de căutare. Cheia API și tokenul rămân pe server;
 * browserul primește doar starea conexiunii și ultimele 4 caractere ale cheii.
 * Anunțurile Argus nu se salvează în baza de date — rezultatele se întorc
 * direct către apelant.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { Ctx } from "@/lib/meta/post.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Agenția apelantului — cheia Argus se folosește strict pe agenția proprie. */
async function callerOrgId(ctx: Ctx): Promise<string> {
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error("Agenția nu este configurată.");
  return profile.organization_id as string;
}

async function requireAdminOrg(ctx: Ctx): Promise<string> {
  const { data: isAdmin, error } = await ctx.supabase.rpc("is_org_admin");
  if (error || isAdmin !== true) {
    setResponseStatus(403);
    throw new Error("Acces refuzat: doar administratorul agenției gestionează conexiunea Argus.");
  }
  return callerOrgId(ctx);
}

/** IP-ul utilizatorului, trimis Argus ca `client_ip` (doar IPv4 valid). */
export function argusClientIp(): string | null {
  const cf = getRequestHeader("cf-connecting-ip")?.trim();
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = cf || forwarded || "";
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(candidate) ? candidate : null;
}

export type ArgusConnectionStatus = {
  /** Tokenul de aplicație Habitoo există pe server. */
  configured: boolean;
  connected: boolean;
  /** Ultimele 4 caractere ale cheii — singura parte afișată. */
  last4: string | null;
  connectedAt: string | null;
  connectedByName: string | null;
};

export const getArgusConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<ArgusConnectionStatus> => {
    setResponseHeader("Cache-Control", "no-store");
    const orgId = await requireAdminOrg(context as unknown as Ctx);
    const db = await adminDb();
    const { loadArgusConnection } = await import("./connection.server");
    const row = await loadArgusConnection(db, orgId);
    const configured = !!process.env["ARGUS_APPLICATION_TOKEN"]?.trim();
    if (!row) {
      return { configured, connected: false, last4: null, connectedAt: null, connectedByName: null };
    }
    const { data: by } = row.connected_by
      ? await db.from("profiles").select("full_name").eq("id", row.connected_by).maybeSingle()
      : { data: null };
    return {
      configured,
      connected: true,
      last4: row.api_key_last4,
      connectedAt: row.created_at,
      connectedByName: by?.full_name ?? null,
    };
  });

export const saveArgusApiKey = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) =>
    z.object({ apiKey: z.string().trim().min(8, "Cheia API pare prea scurtă.").max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const orgId = await requireAdminOrg(ctx);
    const db = await adminDb();
    const { saveArgusConnection } = await import("./connection.server");
    await saveArgusConnection(db, { organizationId: orgId, apiKey: data.apiKey, userId: ctx.userId });
    await db.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: ctx.userId,
      action: "argus.key_saved",
      entity: "argus_connection",
      new_values: { last4: data.apiKey.slice(-4) },
    });
    return { ok: true as const, last4: data.apiKey.slice(-4) };
  });

/** Testează conexiunea: o autentificare reală la Argus cu cheia salvată. */
export const testArgusConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    const ctx = context as unknown as Ctx;
    const orgId = await requireAdminOrg(ctx);
    const db = await adminDb();
    const { argusAccessToken } = await import("./connection.server");
    const { argusErrorMessage } = await import("./errors");
    try {
      await argusAccessToken(db, orgId);
      return { ok: true, message: "Conexiunea Argus funcționează." };
    } catch (e) {
      return { ok: false, message: argusErrorMessage(e) };
    }
  });

export const disconnectArgus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const orgId = await requireAdminOrg(ctx);
    const db = await adminDb();
    const { deleteArgusConnection } = await import("./connection.server");
    await deleteArgusConnection(db, orgId);
    await db.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: ctx.userId,
      action: "argus.disconnected",
      entity: "argus_connection",
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Acces la datele Argus (fără interfață încă). Rezultatele nu se      */
/* salvează în baza de date; fiecare cerere trimite IP-ul utilizatorului. */
/* ------------------------------------------------------------------ */

/** Răspunsul Argus, trecut mai departe ca date JSON simple (nesalvate în DB). */
export type ArgusJson =
  | string
  | number
  | boolean
  | null
  | ArgusJson[]
  | { [key: string]: ArgusJson };

async function argusDataCall(
  ctx: Ctx,
  opts: { path: string; method?: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<ArgusJson> {
  const orgId = await callerOrgId(ctx);
  const db = await adminDb();
  const { argusCall } = await import("./connection.server");
  return argusCall<ArgusJson>(db, orgId, { ...opts, clientIp: argusClientIp() });
}

export const argusFilters = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) =>
    argusDataCall(context as unknown as Ctx, { path: "/properties/filters" }),
  );

const SearchInput = z
  .object({
    page: z.number().int().min(1).max(10_000).optional(),
    main_area: z.number().int().optional(),
    transaction_type: z.array(z.number().int()).max(10).optional(),
    property_type: z.array(z.number().int()).max(20).optional(),
    rooms: z.array(z.number().int()).max(10).optional(),
    budget: z.array(z.number()).max(2).optional(),
    year_built: z.array(z.number().int()).max(2).optional(),
    surface: z.array(z.number()).max(2).optional(),
    lot_size: z.array(z.number()).max(2).optional(),
    division: z.array(z.number().int()).max(10).optional(),
    comfort: z.array(z.number().int()).max(10).optional(),
    building_type: z.array(z.number().int()).max(30).optional(),
    listed_by: z.array(z.number().int()).max(10).optional(),
    listing_date: z.number().int().optional(),
    images_only: z.boolean().optional(),
    counties: z.array(z.number().int()).max(50).optional(),
    cities: z.array(z.number().int()).max(200).optional(),
    areas: z.array(z.number().int()).max(200).optional(),
  })
  .strict();

export const argusSearch = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data, context }) =>
    argusDataCall(context as unknown as Ctx, {
      path: "/properties/search",
      body: { ...data },
    }),
  );

const PropertyRef = z.object({ propertyId: z.string().trim().min(1).max(100) });

export const argusPropertyDetail = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => PropertyRef.parse(d))
  .handler(async ({ data, context }) =>
    argusDataCall(context as unknown as Ctx, {
      path: "/properties/detail",
      body: { property_id: data.propertyId },
    }),
  );

export const argusPropertyImages = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => PropertyRef.parse(d))
  .handler(async ({ data, context }) =>
    argusDataCall(context as unknown as Ctx, {
      path: "/properties/images",
      method: "GET",
      body: { property_id: data.propertyId },
    }),
  );

export const argusPropertyContact = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => PropertyRef.parse(d))
  .handler(async ({ data, context }) =>
    argusDataCall(context as unknown as Ctx, {
      path: "/properties/contact",
      method: "GET",
      body: { property_id: data.propertyId },
    }),
  );

const LocationPage = z.object({
  page: z.number().int().min(1).max(10_000).optional(),
  query: z.string().trim().max(100).optional(),
});

export const argusCounties = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => LocationPage.parse(d))
  .handler(async ({ data, context }) =>
    argusDataCall(context as unknown as Ctx, {
      path: "/tools/localisation/counties",
      body: { ...data },
    }),
  );

export const argusCities = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) =>
    LocationPage.extend({ counties: z.array(z.number().int()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    argusDataCall(context as unknown as Ctx, {
      path: "/tools/localisation/cities",
      body: { ...data },
    }),
  );

export const argusAreas = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) =>
    LocationPage.extend({ cities: z.array(z.number().int()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    argusDataCall(context as unknown as Ctx, {
      path: "/tools/localisation/areas",
      body: { ...data },
    }),
  );

const TAXONOMY_PATHS = {
  property_types: "/tools/taxonomy/properties_types",
  transaction_types: "/tools/taxonomy/transactions_types",
  building_types: "/tools/taxonomy/property_building_types",
  division: "/tools/taxonomy/property_division",
} as const;

export const argusTaxonomy = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["property_types", "transaction_types", "building_types", "division"]) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    argusDataCall(context as unknown as Ctx, {
      path: TAXONOMY_PATHS[data.kind],
      method: "GET",
    }),
  );

/* ------------------------------------------------------------------ */
/* Pasul 2 — tabul „Argus” din Anunțuri particulari. Rezultatele vin     */
/* live de la Argus și nu se salvează în baza de date; telefonul se     */
/* cere doar prin getArgusListingContact, la apăsarea „Arată telefon”.  */
/* ------------------------------------------------------------------ */

/** Starea conexiunii pentru orice membru al agenției (fără date sensibile). */
export const getArgusTabStatus = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<{ configured: boolean; connected: boolean }> => {
    setResponseHeader("Cache-Control", "no-store");
    const ctx = context as unknown as Ctx;
    const orgId = await callerOrgId(ctx);
    const db = await adminDb();
    const { loadArgusConnection } = await import("./connection.server");
    const row = await loadArgusConnection(db, orgId);
    return {
      configured: !!process.env["ARGUS_APPLICATION_TOKEN"]?.trim(),
      connected: !!row,
    };
  });

const SearchUiInput = z
  .object({
    page: z.number().int().min(1).max(10_000).optional(),
    transaction: z.enum(["sale", "rent"]).optional(),
    propertyType: z.number().int().optional(),
    rooms: z.array(z.number().int().min(1).max(5)).max(5).optional(),
    priceMin: z.number().min(0).optional(),
    priceMax: z.number().min(0).optional(),
    surfaceMin: z.number().min(0).optional(),
    surfaceMax: z.number().min(0).optional(),
    countyId: z.number().int().optional(),
    cityId: z.number().int().optional(),
    areaIds: z.array(z.number().int()).max(200).optional(),
    listedBy: z.enum(["owner", "all"]).optional(),
  })
  .strict();

export const searchArgusListings = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => SearchUiInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const orgId = await callerOrgId(ctx);
    const db = await adminDb();
    const { searchArgusProperties } = await import("./search.server");
    return searchArgusProperties(db, orgId, data, { clientIp: argusClientIp() });
  });

export const getArgusListingDetail = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => PropertyRef.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const orgId = await callerOrgId(ctx);
    const db = await adminDb();
    const { getArgusPropertyDetail } = await import("./search.server");
    return getArgusPropertyDetail(db, orgId, data.propertyId, { clientIp: argusClientIp() });
  });

export const getArgusListingImages = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => PropertyRef.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const orgId = await callerOrgId(ctx);
    const db = await adminDb();
    const { getArgusPropertyImages } = await import("./search.server");
    return getArgusPropertyImages(db, orgId, data.propertyId, { clientIp: argusClientIp() });
  });

/** Telefonul proprietarului — apelat doar la apăsarea „Arată telefon”. */
export const getArgusListingContact = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => PropertyRef.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const orgId = await callerOrgId(ctx);
    const db = await adminDb();
    const { getArgusPropertyContact } = await import("./search.server");
    return getArgusPropertyContact(db, orgId, data.propertyId, { clientIp: argusClientIp() });
  });

const LocationsInput = z
  .object({
    kind: z.enum(["counties", "cities", "areas"]),
    countyIds: z.array(z.number().int()).max(50).optional(),
    cityIds: z.array(z.number().int()).max(200).optional(),
    query: z.string().trim().max(100).optional(),
  })
  .strict();

export const getArgusLocations = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => LocationsInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const orgId = await callerOrgId(ctx);
    const db = await adminDb();
    const { listArgusPlaces } = await import("./search.server");
    return listArgusPlaces(
      db,
      orgId,
      data.kind,
      { countyIds: data.countyIds, cityIds: data.cityIds, query: data.query },
      { clientIp: argusClientIp() },
    );
  });

/** Tipurile de proprietate de nivel superior, pentru filtrul „Tip proprietate”. */
export const getArgusPropertyTypes = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const raw = await argusDataCall(ctx, {
      path: TAXONOMY_PATHS.property_types,
      method: "GET",
    });
    const { normalizeArgusPropertyTypes } = await import("./search.shared");
    return normalizeArgusPropertyTypes(raw);
  });
