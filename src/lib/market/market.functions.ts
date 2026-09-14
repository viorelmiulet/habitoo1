/**
 * Server functions pentru Centrul de date de piață (ACP faza 3).
 *
 * Reguli:
 *  - importul și deduplicarea rulează exclusiv server-side, cu clientul
 *    privilegiat (RLS permite doar SELECT pe pool-ul comun);
 *  - importul și rezolvarea potrivirilor ambigue sunt rezervate superadminului;
 *  - `raw_data` nu ajunge niciodată la un utilizator fără drepturi;
 *  - fiecare rulare este înregistrată în `market_import_runs` (jurnal auditabil).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { parseCsv } from "./csv";
import {
  NOT_CONFIGURED_MESSAGE,
  runAdapterSync,
  sourceScopeKey,
  type SyncRunResult,
} from "./adapter";
import { HABITOO_ELIGIBLE_STATUSES, type HabitooPropertyRow } from "./adapters/habitoo";
import { createMarketAdapter, type RegistryDeps } from "./registry";
import { ingestListings, summarizeHistory, type ImportSummary } from "./ingest";
import {
  normalizeRecord,
  type MarketFieldMapping,
  type NormalizedListing,
} from "./normalize";
import { createMarketRepository } from "./repository.server";
import { findMarketSource, MARKET_SOURCES, marketSourceName } from "./sources";

type AuthContext = { userId: string; supabase: { rpc: (fn: string) => Promise<{ data: unknown }> } };

const PAGE_SIZE = 25;

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function isSuperadmin(context: AuthContext): Promise<boolean> {
  const { data } = await context.supabase.rpc("is_superadmin");
  return data === true;
}

async function requireSuperadmin(context: AuthContext): Promise<void> {
  if (!(await isSuperadmin(context))) {
    throw new Error("Această operațiune este rezervată administratorilor platformei.");
  }
}

/** Audit server-side: folosim clientul privilegiat, nu clientul de browser. */
async function logMarketAudit(params: {
  actorId: string;
  action: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    const admin = await loadAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", params.actorId)
      .maybeSingle();
    if (!profile?.organization_id) return;
    await admin.from("audit_logs").insert({
      organization_id: profile.organization_id,
      actor_id: params.actorId,
      action: params.action,
      entity: "market_data",
      entity_id: params.entityId ?? null,
      new_values: (params.details ?? null) as never,
    } as never);
  } catch {
    // auditul nu blochează operațiunea
  }
}

/* ------------------------------------------------------------------ */
/* Prezentare: surse, statistici, listă                                */
/* ------------------------------------------------------------------ */

export type MarketSourceStats = {
  id: string;
  name: string;
  description: string;
  formats: string[];
  pull: boolean;
  notes: string | null;
  /** Sursa are un feed/API autorizat configurat în Habitoo. */
  configured: boolean;
  total: number;
  active: number;
  inactive: number;
  newLast7Days: number;
  updatedLast7Days: number;
  duplicates: number;
  lastSeenAt: string | null;
  lastImportAt: string | null;
  lastImportStatus: string | null;
  /** Starea sincronizării, din `market_source_state`. */
  syncStatus: string | null;
  syncing: boolean;
  lastSyncAt: string | null;
  lastSyncSuccessAt: string | null;
  lastSyncError: string | null;
};

export type MarketOverview = {
  isSuperadmin: boolean;
  totals: {
    total: number;
    active: number;
    entities: number;
    duplicates: number;
    ambiguous: number;
    newLast7Days: number;
    updatedLast7Days: number;
    importErrors: number;
  };
  sources: MarketSourceStats[];
  lastRuns: {
    id: string;
    source: string;
    sourceName: string;
    format: string;
    mode: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    itemsReceived: number;
    itemsCreated: number;
    itemsUpdated: number;
    itemsInvalid: number;
    itemsDeactivated: number;
    duplicates: number;
    ambiguous: number;
    errorCount: number;
  }[];
};

export const getMarketOverview = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<MarketOverview> => {
    const admin = await loadAdmin();
    const superadmin = await isSuperadmin(context as unknown as AuthContext);
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const count = async (build: (q: ReturnType<typeof admin.from>) => unknown) => {
      const query = build(admin.from("market_listings")) as {
        then: Parameters<Promise<{ count: number | null }>["then"]>[0];
      };
      const { count: value } = (await (query as unknown as Promise<{ count: number | null }>)) ?? {
        count: 0,
      };
      return value ?? 0;
    };

    const base = () => admin.from("market_listings").select("id", { count: "exact", head: true });

    const [total, active, duplicates, ambiguous, fresh, updated, entities] = await Promise.all([
      count(() => base()),
      count(() => base().eq("status", "active")),
      count(() => base().eq("dedupe_status", "merged")),
      count(() => base().eq("dedupe_status", "ambiguous")),
      count(() => base().gte("first_seen_at", since)),
      count(() => base().gte("updated_at", since).lt("first_seen_at", since)),
      (async () => {
        const { count: value } = await admin
          .from("market_entities")
          .select("id", { count: "exact", head: true });
        return value ?? 0;
      })(),
    ]);

    const { data: runs } = await admin
      .from("market_import_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);

    const { data: states } = await admin.from("market_source_state").select("*");

    const runList = runs ?? [];
    const sources: MarketSourceStats[] = [];
    for (const definition of MARKET_SOURCES) {
      const [sTotal, sActive, sInactive, sNew, sUpdated, sDuplicates] = await Promise.all([
        count(() => base().eq("source", definition.id)),
        count(() => base().eq("source", definition.id).eq("status", "active")),
        count(() => base().eq("source", definition.id).neq("status", "active")),
        count(() => base().eq("source", definition.id).gte("first_seen_at", since)),
        count(() =>
          base().eq("source", definition.id).gte("updated_at", since).lt("first_seen_at", since),
        ),
        count(() => base().eq("source", definition.id).eq("dedupe_status", "merged")),
      ]);
      const { data: latest } = await admin
        .from("market_listings")
        .select("last_seen_at")
        .eq("source", definition.id)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastRun = runList.find((run) => run.source === definition.id) ?? null;
      const state =
        (states ?? []).find(
          (row) => row.source === definition.id || row.source.startsWith(`${definition.id}:`),
        ) ?? null;
      sources.push({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        formats: definition.formats,
        pull: definition.id === "habitoo_internal" ? true : definition.pull,
        notes: definition.notes ?? null,
        configured: definition.id === "habitoo_internal",
        total: sTotal,
        active: sActive,
        inactive: sInactive,
        newLast7Days: sNew,
        updatedLast7Days: sUpdated,
        duplicates: sDuplicates,
        lastSeenAt: latest?.last_seen_at ?? null,
        lastImportAt: lastRun?.started_at ?? null,
        lastImportStatus: lastRun?.status ?? null,
        syncStatus: state?.status ?? null,
        syncing: state?.status === "running",
        lastSyncAt: state?.last_sync_at ?? null,
        lastSyncSuccessAt: state?.last_success_at ?? null,
        lastSyncError: state?.last_error ?? null,
      });
    }

    const importErrors = runList.reduce(
      (sum, run) => sum + (Array.isArray(run.errors) ? run.errors.length : 0),
      0,
    );

    return {
      isSuperadmin: superadmin,
      totals: {
        total,
        active,
        entities,
        duplicates,
        ambiguous,
        newLast7Days: fresh,
        updatedLast7Days: updated,
        importErrors,
      },
      sources,
      lastRuns: superadmin
        ? runList.slice(0, 10).map((run) => ({
            id: run.id,
            source: run.source,
            sourceName: marketSourceName(run.source),
            format: run.format,
            mode: run.mode,
            status: run.status,
            startedAt: run.started_at,
            finishedAt: run.finished_at,
            itemsReceived: run.items_received,
            itemsCreated: run.items_created,
            itemsUpdated: run.items_updated,
            itemsInvalid: run.items_invalid,
            itemsDeactivated: run.items_deactivated,
            duplicates: run.duplicates_detected,
            ambiguous: run.ambiguous_matches,
            errorCount: Array.isArray(run.errors) ? run.errors.length : 0,
          }))
        : [],
    };
  });

const listFilters = z.object({
  source: z.string().optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  propertyType: z.string().optional(),
  transactionType: z.string().optional(),
  status: z.enum(["active", "inactive", "archived", "all"]).optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  areaMin: z.number().optional(),
  areaMax: z.number().optional(),
  rooms: z.number().optional(),
  page: z.number().int().min(1).optional(),
});

export type MarketListRow = {
  id: string;
  source: string;
  sourceName: string;
  title: string | null;
  imageUrl: string | null;
  url: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  transactionType: string | null;
  rooms: number | null;
  usableArea: number | null;
  price: number | null;
  currency: string | null;
  pricePerSqm: number | null;
  status: string;
  dedupeStatus: string;
  firstSeenAt: string;
  lastSeenAt: string;
  entityId: string | null;
};

export const listMarketListings = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => listFilters.parse(data ?? {}))
  .handler(async ({ data }): Promise<{ rows: MarketListRow[]; total: number; page: number }> => {
    const admin = await loadAdmin();
    const page = data.page ?? 1;
    let query = admin
      .from("market_listings")
      .select(
        "id,source,title,image_url,url,city,district,neighborhood,property_type,transaction_type,rooms,usable_area,total_area,price,currency,price_per_sqm,status,dedupe_status,first_seen_at,last_seen_at,market_entity_id",
        { count: "exact" },
      )
      .order("last_seen_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (data.source) query = query.eq("source", data.source);
    if (data.propertyType) query = query.eq("property_type", data.propertyType);
    if (data.transactionType) query = query.eq("transaction_type", data.transactionType);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.rooms) query = query.eq("rooms", data.rooms);
    if (data.priceMin) query = query.gte("price", data.priceMin);
    if (data.priceMax) query = query.lte("price", data.priceMax);
    if (data.areaMin) query = query.gte("usable_area", data.areaMin);
    if (data.areaMax) query = query.lte("usable_area", data.areaMax);
    if (data.city) query = query.ilike("city", `%${data.city}%`);
    if (data.area) {
      const term = `%${data.area}%`;
      query = query.or(
        `district.ilike.${term},neighborhood.ilike.${term},address.ilike.${term}`,
      );
    }

    const { data: rows, count, error } = await query;
    if (error) throw error;

    return {
      page,
      total: count ?? 0,
      rows: (rows ?? []).map((row) => ({
        id: row.id,
        source: row.source,
        sourceName: marketSourceName(row.source),
        title: row.title,
        imageUrl: row.image_url,
        url: row.url,
        city: row.city,
        district: row.district,
        neighborhood: row.neighborhood,
        propertyType: row.property_type,
        transactionType: row.transaction_type,
        rooms: row.rooms,
        usableArea: row.usable_area ?? row.total_area,
        price: row.price,
        currency: row.currency,
        pricePerSqm: row.price_per_sqm,
        status: row.status,
        dedupeStatus: row.dedupe_status,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        entityId: row.market_entity_id,
      })),
    };
  });

export const getMarketListingDetail = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const admin = await loadAdmin();
    const superadmin = await isSuperadmin(context as unknown as AuthContext);

    const { data: listing, error } = await admin
      .from("market_listings")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!listing) throw new Error("Oferta de piață nu a fost găsită.");

    const [{ data: sources }, { data: snapshots }, entity] = await Promise.all([
      admin
        .from("market_listing_sources")
        .select("*")
        .eq("market_listing_id", listing.id)
        .order("first_seen_at", { ascending: true }),
      admin
        .from("market_listing_snapshots")
        .select("*")
        .eq("market_listing_id", listing.id)
        .order("captured_at", { ascending: true }),
      listing.market_entity_id
        ? admin.from("market_entities").select("*").eq("id", listing.market_entity_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const siblings = listing.market_entity_id
      ? await admin
          .from("market_listings")
          .select("id,source,url,price,currency,status,last_seen_at")
          .eq("market_entity_id", listing.market_entity_id)
          .neq("id", listing.id)
      : { data: [] };

    return {
      listing: {
        id: listing.id,
        source: listing.source,
        sourceName: marketSourceName(listing.source),
        sourceListingId: listing.source_listing_id,
        url: listing.url,
        title: listing.title,
        imageUrl: listing.image_url,
        propertyType: listing.property_type,
        transactionType: listing.transaction_type,
        city: listing.city,
        county: listing.county,
        district: listing.district,
        neighborhood: listing.neighborhood,
        address: listing.address,
        latitude: listing.latitude,
        longitude: listing.longitude,
        rooms: listing.rooms,
        bathrooms: listing.bathrooms,
        usableArea: listing.usable_area,
        totalArea: listing.total_area,
        floor: listing.floor,
        totalFloors: listing.total_floors,
        constructionYear: listing.construction_year,
        price: listing.price,
        currency: listing.currency,
        pricePerSqm: listing.price_per_sqm,
        condition: listing.condition,
        furnished: listing.furnished,
        parking: listing.parking,
        balcony: listing.balcony,
        features: (listing.features ?? {}) as Record<string, boolean>,
        status: listing.status,
        firstSeenAt: listing.first_seen_at,
        lastSeenAt: listing.last_seen_at,
        disappearedAt: listing.disappeared_at,
        dedupeStatus: listing.dedupe_status,
        dedupeScore: listing.dedupe_score,
        dedupeReasons: (Array.isArray(listing.dedupe_reasons)
          ? listing.dedupe_reasons
          : []) as string[],
      },
      history: summarizeHistory({
        initialPrice: listing.initial_price,
        price: listing.price,
        priceChanges: listing.price_changes,
        statusChanges: listing.status_changes,
        firstSeenAt: listing.first_seen_at,
        lastSeenAt: listing.last_seen_at,
        status: listing.status,
      }),
      sources: (sources ?? []).map((row) => ({
        id: row.id,
        source: row.source,
        sourceName: marketSourceName(row.source),
        sourceListingId: row.source_listing_id,
        url: row.url,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        isPrimary: row.is_primary,
        isActive: row.is_active,
        lastPrice: row.last_price,
      })),
      snapshots: (snapshots ?? []).map((row) => ({
        id: row.id,
        price: row.price,
        currency: row.currency,
        pricePerSqm: row.price_per_sqm,
        status: row.status,
        changeType: row.change_type,
        previousPrice: row.previous_price,
        previousStatus: row.previous_status,
        capturedAt: row.captured_at,
      })),
      entity: entity.data
        ? {
            id: entity.data.id,
            normalizedAddress: entity.data.normalized_address,
            normalizedCity: entity.data.normalized_city,
            listingCount: entity.data.listing_count,
            reviewRequired: entity.data.review_required,
            reasons: (Array.isArray(entity.data.identity_reasons)
              ? entity.data.identity_reasons
              : []) as string[],
          }
        : null,
      siblings: (siblings.data ?? []).map((row) => ({
        id: row.id,
        source: row.source,
        sourceName: marketSourceName(row.source),
        url: row.url,
        price: row.price,
        currency: row.currency,
        status: row.status,
        lastSeenAt: row.last_seen_at,
      })),
      // `raw_data` conține valorile originale ale sursei: doar pentru superadmin.
      rawJson: superadmin ? JSON.stringify(listing.raw_data ?? {}, null, 2) : null,
      canSeeRaw: superadmin,
    };
  });

/* ------------------------------------------------------------------ */
/* Import                                                             */
/* ------------------------------------------------------------------ */

const importInput = z.object({
  source: z.string().min(1),
  format: z.enum(["json", "csv"]),
  content: z.string().min(2).max(8_000_000),
  mode: z.enum(["full", "partial"]).default("partial"),
  mapping: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});

export type ImportResult = ImportSummary & {
  runId: string;
  invalid: number;
  source: string;
  sourceName: string;
};

/** Extrage lista de înregistrări din JSON (array sau obiect cu `listings`/`data`/`items`). */
function extractJsonRecords(content: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Fișierul JSON nu este valid.");
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["listings", "data", "items", "results", "ads"]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  throw new Error("JSON-ul nu conține o listă de oferte.");
}

export const importMarketListings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => importInput.parse(data))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const definition = findMarketSource(data.source);
    if (!definition) throw new Error("Sursă de date necunoscută.");
    if (!definition.formats.includes(data.format)) {
      throw new Error(`Sursa ${definition.name} nu acceptă formatul ${data.format.toUpperCase()}.`);
    }

    const admin = await loadAdmin();
    const userId = (context as unknown as { userId: string }).userId;
    const now = new Date().toISOString();

    const { data: run, error: runError } = await admin
      .from("market_import_runs")
      .insert({
        source: definition.id,
        format: data.format,
        mode: data.mode,
        status: "running",
        triggered_by: userId,
        started_at: now,
      })
      .select("id")
      .single();
    if (runError) throw runError;

    try {
      const records =
        data.format === "json" ? extractJsonRecords(data.content) : parseCsv(data.content).rows;
      const mapping = {
        ...definition.mapping,
        ...(data.mapping as MarketFieldMapping | undefined),
      } as MarketFieldMapping;

      const listings: NormalizedListing[] = [];
      const invalid: { reference: string; message: string }[] = [];
      records.forEach((record, index) => {
        const result = normalizeRecord(definition.id, record, mapping);
        if (result.ok) listings.push(result.listing);
        else {
          invalid.push({
            reference: `rând ${index + 1}`,
            message: result.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "),
          });
        }
      });

      const repo = createMarketRepository(admin);
      const summary = await ingestListings(
        repo,
        { source: definition.id, mode: data.mode, runId: run.id, now },
        listings,
      );

      const errors = [...invalid, ...summary.errors].slice(0, 200);
      await admin
        .from("market_import_runs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          items_received: records.length,
          items_created: summary.created,
          items_updated: summary.updated,
          items_unchanged: summary.unchanged,
          items_invalid: invalid.length,
          items_deactivated: summary.deactivated,
          duplicates_detected: summary.duplicates,
          ambiguous_matches: summary.ambiguous,
          price_changes: summary.priceChanges,
          status_changes: summary.statusChanges,
          errors: errors as never,
        })
        .eq("id", run.id);

      await logMarketAudit({
        actorId: userId,
        action: "market.import.completed",
        entityId: run.id,
        details: {
          source: definition.id,
          format: data.format,
          mode: data.mode,
          received: records.length,
          created: summary.created,
          updated: summary.updated,
          invalid: invalid.length,
          duplicates: summary.duplicates,
          ambiguous: summary.ambiguous,
        },
      });

      return {
        ...summary,
        errors,
        received: records.length,
        invalid: invalid.length,
        runId: run.id,
        source: definition.id,
        sourceName: definition.name,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Eroare necunoscută la import.";
      await admin
        .from("market_import_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          errors: [{ reference: "import", message }] as never,
        })
        .eq("id", run.id);
      await logMarketAudit({
        actorId: userId,
        action: "market.import.failed",
        entityId: run.id,
        details: { source: definition.id, message },
      });
      throw error;
    }
  });

/* ------------------------------------------------------------------ */
/* Sincronizarea surselor (adaptoare + lock server-side)               */
/* ------------------------------------------------------------------ */

/** Adaptoarele au nevoie de acces la proprietățile agenției. */
function habitooDeps(admin: Awaited<ReturnType<typeof loadAdmin>>): RegistryDeps["habitoo"] {
  const eligible = () =>
    admin
      .from("properties")
      .select(PROPERTY_SYNC_COLUMNS)
      .is("archived_at", null)
      .in("status", [...HABITOO_ELIGIBLE_STATUSES]);
  return {
    async countProperties(organizationId) {
      const { count } = await admin
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .in("status", [...HABITOO_ELIGIBLE_STATUSES]);
      return count ?? 0;
    },
    async loadProperties(organizationId) {
      const { data, error } = await eligible()
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as HabitooPropertyRow[];
    },
  };
}

const PROPERTY_SYNC_COLUMNS =
  "id,title,reference,property_type,transaction_kind,status,city,county,district,street,lat,lng,rooms,bathrooms,usable_surface,surface,floor,building_floors,build_year,price,currency,finish_state,furnishing,parking,balcony,updated_at";

/** Cine poate porni o sincronizare: sursa internă = admin agenției; restul = superadmin. */
async function requireSyncPermission(
  context: AuthContext,
  source: string,
): Promise<{ userId: string; organizationId: string | null; superadmin: boolean }> {
  const userId = (context as unknown as { userId: string }).userId;
  const superadmin = await isSuperadmin(context);
  const admin = await loadAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  const organizationId = profile?.organization_id ?? null;

  if (superadmin) return { userId, organizationId, superadmin };
  if (source !== "habitoo_internal") {
    throw new Error("Această sursă poate fi sincronizată doar de administratorii platformei.");
  }
  const { data: isAdmin } = await context.supabase.rpc("is_org_admin");
  if (isAdmin !== true) {
    throw new Error("Doar administratorul agenției poate sincroniza sursa internă.");
  }
  if (!organizationId) throw new Error("Lipsește agenția curentă.");
  return { userId, organizationId, superadmin };
}

export const testMarketSourceConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ source: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AuthContext;
    const { organizationId } = await requireSyncPermission(ctx, data.source);
    const admin = await loadAdmin();
    const adapter = createMarketAdapter(data.source, { habitoo: habitooDeps(admin) });
    if (!adapter) throw new Error("Sursă de date necunoscută.");
    const info = adapter.getSourceInfo();
    if (!info.configured) {
      return { ok: false, configured: false, message: NOT_CONFIGURED_MESSAGE };
    }
    const result = await adapter.testConnection({
      organizationId: info.orgScoped ? organizationId : null,
      runId: null,
      now: new Date().toISOString(),
    });
    return { ok: result.ok, configured: true, message: result.message };
  });

export const syncMarketSource = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ source: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }): Promise<SyncRunResult> => {
    const ctx = context as unknown as AuthContext;
    const { userId, organizationId } = await requireSyncPermission(ctx, data.source);
    const admin = await loadAdmin();
    const adapter = createMarketAdapter(data.source, { habitoo: habitooDeps(admin) });
    if (!adapter) throw new Error("Sursă de date necunoscută.");

    const info = adapter.getSourceInfo();
    const scopedOrg = info.orgScoped ? organizationId : null;
    if (!info.configured) {
      throw new Error(
        `${info.name} nu are un feed sau API autorizat configurat. Încarcă exportul primit de la sursă.`,
      );
    }

    // Rate limit: sincronizările manuale nu pot fi apelate în buclă.
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _bucket: `market_sync:${userId}`,
      _limit: 20,
      _window_seconds: 3600,
    });
    if (allowed === false) {
      throw new Error("Prea multe sincronizări în ultima oră. Încearcă din nou mai târziu.");
    }

    // Lock server-side: o singură sincronizare activă per sursă (și per agenție
    // la sursele izolate). Lock-ul abandonat expiră automat.
    const lockKey = sourceScopeKey(info.id, scopedOrg);
    const { data: claimed, error: claimError } = await admin.rpc("market_sync_claim", {
      _source: lockKey,
      _stale_seconds: 900,
    });
    if (claimError) throw claimError;
    if (claimed !== true) {
      throw new Error("O sincronizare este deja în curs pentru această sursă.");
    }

    const startedAt = new Date().toISOString();
    const { data: run, error: runError } = await admin
      .from("market_import_runs")
      .insert({
        source: info.id,
        format: "json",
        mode: "partial",
        status: "running",
        triggered_by: userId,
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (runError) {
      await admin.rpc("market_sync_release", {
        _source: lockKey,
        _ok: false,
        _error: "Nu s-a putut înregistra rularea.",
        _run_id: null,
      });
      throw runError;
    }

    await logMarketAudit({
      actorId: userId,
      action: "market.sync.started",
      entityId: run.id,
      details: { source: info.id, organizationId: scopedOrg, startedAt },
    });

    try {
      const result = await runAdapterSync(
        adapter,
        { organizationId: scopedOrg, runId: run.id, now: startedAt },
        createMarketRepository(admin),
      );

      await admin
        .from("market_import_runs")
        .update({
          status: result.success ? "completed" : "failed",
          finished_at: result.finishedAt,
          items_received: result.fetched,
          items_created: result.inserted,
          items_updated: result.updated,
          items_unchanged: result.unchanged,
          items_invalid: result.rejected,
          items_deactivated: result.deactivated,
          duplicates_detected: result.duplicates,
          ambiguous_matches: result.ambiguous,
          errors: result.errors as never,
        })
        .eq("id", run.id);

      await admin.rpc("market_sync_release", {
        _source: lockKey,
        _ok: result.success,
        _error: result.success ? null : (result.errors[0]?.message ?? "Sincronizare eșuată."),
        _run_id: run.id,
      });

      await logMarketAudit({
        actorId: userId,
        action: result.success ? "market.sync.completed" : "market.sync.failed",
        entityId: run.id,
        details: {
          source: info.id,
          organizationId: scopedOrg,
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
          fetched: result.fetched,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
          rejected: result.rejected,
          errors: result.errors.length,
        },
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Eroare necunoscută la sincronizare.";
      await admin
        .from("market_import_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          errors: [{ reference: info.id, message }] as never,
        })
        .eq("id", run.id);
      // Lock-ul se eliberează și la eroare.
      await admin.rpc("market_sync_release", {
        _source: lockKey,
        _ok: false,
        _error: message,
        _run_id: run.id,
      });
      await logMarketAudit({
        actorId: userId,
        action: "market.sync.failed",
        entityId: run.id,
        details: { source: info.id, organizationId: scopedOrg, message },
      });
      throw new Error("Sincronizarea a eșuat. Verifică configurația sursei și încearcă din nou.");
    }
  });

/**
 * Numărul de oferte disponibile per sursă, pentru selecția din „Analiză nouă".
 * Numerele vin din baza de date, nu sunt hardcodate.
 */
export type MarketSourceCount = {
  id: string;
  name: string;
  configured: boolean;
  active: number;
  status: "never_synced" | "ok" | "error" | "running" | "not_configured";
  lastSyncAt: string | null;
};

export const getMarketSourceCounts = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async (): Promise<MarketSourceCount[]> => {
    const admin = await loadAdmin();
    const { data: states } = await admin.from("market_source_state").select("*");
    const stateFor = (source: string) =>
      (states ?? []).find((row) => row.source === source || row.source.startsWith(`${source}:`)) ??
      null;

    const out: MarketSourceCount[] = [];
    for (const definition of MARKET_SOURCES) {
      const { count } = await admin
        .from("market_listings")
        .select("id", { count: "exact", head: true })
        .eq("source", definition.id)
        .eq("status", "active");
      const state = stateFor(definition.id);
      const configured = definition.id === "habitoo_internal";
      out.push({
        id: definition.id,
        name: definition.name,
        configured,
        active: count ?? 0,
        status: !configured
          ? "not_configured"
          : state?.status === "running"
            ? "running"
            : state?.status === "error"
              ? "error"
              : state?.last_success_at
                ? "ok"
                : "never_synced",
        lastSyncAt: state?.last_sync_at ?? null,
      });
    }
    return out;
  });

/* ------------------------------------------------------------------ */
/* Potriviri ambigue                                                  */
/* ------------------------------------------------------------------ */

export const listDedupeReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { data, error } = await admin
      .from("market_dedupe_reviews")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const listingIds = [...new Set((data ?? []).map((row) => row.market_listing_id))];
    const { data: listings } = listingIds.length
      ? await admin
          .from("market_listings")
          .select("id,source,title,address,city,usable_area,rooms,price,currency,url")
          .in("id", listingIds)
      : { data: [] };
    const byId = new Map((listings ?? []).map((row) => [row.id, row]));
    return (data ?? []).map((row) => ({
      id: row.id,
      score: row.score,
      reasons: (Array.isArray(row.reasons) ? row.reasons : []) as string[],
      createdAt: row.created_at,
      candidateEntityId: row.candidate_entity_id,
      listing: byId.get(row.market_listing_id) ?? null,
    }));
  });

export const resolveDedupeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ id: z.string().uuid(), decision: z.enum(["confirm", "reject"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const userId = (context as unknown as { userId: string }).userId;
    const { data: review, error } = await admin
      .from("market_dedupe_reviews")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!review || review.status !== "pending") {
      throw new Error("Potrivirea a fost deja rezolvată.");
    }

    const now = new Date().toISOString();
    if (data.decision === "confirm" && review.candidate_entity_id) {
      await admin
        .from("market_listings")
        .update({
          market_entity_id: review.candidate_entity_id,
          dedupe_status: "merged",
          dedupe_score: review.score,
          dedupe_reasons: review.reasons as never,
          updated_at: now,
        })
        .eq("id", review.market_listing_id);
      const { count } = await admin
        .from("market_listings")
        .select("id", { count: "exact", head: true })
        .eq("market_entity_id", review.candidate_entity_id);
      await admin
        .from("market_entities")
        .update({ listing_count: count ?? 1, review_required: false })
        .eq("id", review.candidate_entity_id);
      // Celelalte potriviri pentru aceeași ofertă devin respinse.
      await admin
        .from("market_dedupe_reviews")
        .update({ status: "rejected", resolved_by: userId, resolved_at: now })
        .eq("market_listing_id", review.market_listing_id)
        .eq("status", "pending")
        .neq("id", review.id);
    } else {
      await admin
        .from("market_listings")
        .update({ dedupe_status: "unique", updated_at: now })
        .eq("id", review.market_listing_id);
    }

    await admin
      .from("market_dedupe_reviews")
      .update({
        status: data.decision === "confirm" ? "confirmed" : "rejected",
        resolved_by: userId,
        resolved_at: now,
      })
      .eq("id", review.id);

    await logMarketAudit({
      actorId: userId,
      action: "market.dedupe.resolved",
      entityId: review.market_listing_id,
      details: { decision: data.decision, score: review.score },
    });

    return { ok: true as const };
  });
