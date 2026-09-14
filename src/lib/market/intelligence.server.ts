/**
 * Market Intelligence — accesul la date (server-only).
 *
 * Filtrarea și numărarea se fac în baza de date (PostgREST + COUNT exact), pe
 * o proiecție îngustă de coloane. Agregările rulează pe server, pe un eșantion
 * plafonat (`MARKET_SAMPLE_CAP`), niciodată în browser și niciodată cu
 * `raw_data`. Pool-ul de piață este comun tuturor agențiilor și poate fi citit
 * doar prin SELECT (RLS), deci nu există date ale altei agenții în el.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  MARKET_SAMPLE_CAP,
  aggregateMarketRows,
  buildSourceQuality,
  computeMarketTrend,
  type MarketIntelligenceAggregate,
  type MarketIntelligenceFilters,
  type MarketIntelligenceRow,
  type MarketIntelligenceResult,
  type MarketSourceQuality,
  type MarketTrend,
  type MarketTrendObservation,
} from "./intelligence";
export type { MarketIntelligenceResult };
import { MARKET_SOURCES, marketSourceName } from "./sources";

type Admin = SupabaseClient<Database>;

type SourceQualityInput = Parameters<typeof buildSourceQuality>[0]["sources"][number];

const ROW_COLUMNS =
  "id,source,status,city,county,district,neighborhood,address,property_type," +
  "transaction_type,rooms,usable_area,total_area,price,currency,price_per_sqm," +
  "last_seen_at,first_seen_at";

/** Câte listări sunt luate în calcul pentru trend (istoricul lor din snapshots). */
const TREND_LISTING_CAP = 1000;
const TREND_OBSERVATION_CAP = 20_000;
const TREND_MONTHS = 12;

function mapRow(row: Record<string, unknown>): MarketIntelligenceRow {
  return {
    id: String(row["id"]),
    source: String(row["source"]),
    status: String(row["status"] ?? "active"),
    city: (row["city"] as string | null) ?? null,
    county: (row["county"] as string | null) ?? null,
    district: (row["district"] as string | null) ?? null,
    neighborhood: (row["neighborhood"] as string | null) ?? null,
    address: (row["address"] as string | null) ?? null,
    propertyType: (row["property_type"] as string | null) ?? null,
    transactionType: (row["transaction_type"] as string | null) ?? null,
    rooms: (row["rooms"] as number | null) ?? null,
    usableArea:
      (row["usable_area"] as number | null) ?? (row["total_area"] as number | null) ?? null,
    price: (row["price"] as number | null) ?? null,
    currency: (row["currency"] as string | null) ?? null,
    pricePerSqm: (row["price_per_sqm"] as number | null) ?? null,
    lastSeenAt: (row["last_seen_at"] as string | null) ?? null,
    firstSeenAt: (row["first_seen_at"] as string | null) ?? null,
  };
}

/** Traduce modelul de filtre în condiții SQL, fără valori implicite inventate. */
export async function loadMarketIntelligenceRows(
  admin: Admin,
  filters: MarketIntelligenceFilters,
): Promise<{ rows: MarketIntelligenceRow[]; totalMatched: number }> {
  let query = admin
    .from("market_listings")
    .select(ROW_COLUMNS, { count: "exact" })
    .order("last_seen_at", { ascending: false })
    .limit(MARKET_SAMPLE_CAP);

  const status = filters.status ?? "active";
  if (status !== "all") query = query.eq("status", status);
  if (filters.city) query = query.ilike("city", filters.city);
  if (filters.county) query = query.ilike("county", filters.county);
  if (filters.area) {
    const term = `%${filters.area.replace(/[%,]/g, " ").trim()}%`;
    query = query.or(`district.ilike.${term},neighborhood.ilike.${term},address.ilike.${term}`);
  }
  if (filters.propertyType) query = query.eq("property_type", filters.propertyType);
  if (filters.transactionType) query = query.eq("transaction_type", filters.transactionType);
  if (typeof filters.roomsMin === "number") query = query.gte("rooms", filters.roomsMin);
  if (typeof filters.roomsMax === "number") query = query.lte("rooms", filters.roomsMax);
  if (typeof filters.areaMin === "number") query = query.gte("usable_area", filters.areaMin);
  if (typeof filters.areaMax === "number") query = query.lte("usable_area", filters.areaMax);
  if (typeof filters.priceMin === "number") query = query.gte("price", filters.priceMin);
  if (typeof filters.priceMax === "number") query = query.lte("price", filters.priceMax);
  if (typeof filters.pricePerSqmMin === "number") {
    query = query.gte("price_per_sqm", filters.pricePerSqmMin);
  }
  if (typeof filters.pricePerSqmMax === "number") {
    query = query.lte("price_per_sqm", filters.pricePerSqmMax);
  }
  if (filters.sources && filters.sources.length > 0) query = query.in("source", filters.sources);
  if (typeof filters.seenWithinDays === "number") {
    const since = new Date(Date.now() - filters.seenWithinDays * 86_400_000).toISOString();
    query = query.gte("last_seen_at", since);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow);
  return { rows, totalMatched: count ?? rows.length };
}

/** Istoricul real al listărilor filtrate, din `market_listing_snapshots`. */
export async function loadTrendObservations(
  admin: Admin,
  listingIds: readonly string[],
): Promise<MarketTrendObservation[]> {
  if (listingIds.length === 0) return [];
  const since = new Date(Date.now() - TREND_MONTHS * 31 * 86_400_000).toISOString();
  const ids = listingIds.slice(0, TREND_LISTING_CAP);
  const { data, error } = await admin
    .from("market_listing_snapshots")
    .select("market_listing_id,price,price_per_sqm,captured_at")
    .in("market_listing_id", ids)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true })
    .limit(TREND_OBSERVATION_CAP);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    listingId: row.market_listing_id,
    capturedAt: row.captured_at,
    price: row.price,
    pricePerSqm: row.price_per_sqm,
  }));
}

/** Calitatea și prospețimea surselor: doar valori reale, fără simulări. */
export async function loadSourceQuality(
  admin: Admin,
  mix: MarketIntelligenceAggregate["sourceMix"],
): Promise<MarketSourceQuality[]> {
  const [{ data: states }, { data: runs }] = await Promise.all([
    admin.from("market_source_state").select("*"),
    admin
      .from("market_import_runs")
      .select("source,status,items_invalid,started_at")
      .order("started_at", { ascending: false })
      .limit(50),
  ]);

  const entries: SourceQualityInput[] = [];
  for (const definition of MARKET_SOURCES) {
    const base = () =>
      admin
        .from("market_listings")
        .select("id", { count: "exact", head: true })
        .eq("source", definition.id);
    const [{ count: total }, { count: active }, { count: duplicates }, { data: latest }] =
      await Promise.all([
        base(),
        base().eq("status", "active"),
        base().eq("dedupe_status", "merged"),
        admin
          .from("market_listings")
          .select("last_seen_at")
          .eq("source", definition.id)
          .order("last_seen_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    const state =
      (states ?? []).find(
        (row) => row.source === definition.id || row.source.startsWith(`${definition.id}:`),
      ) ?? null;
    const lastRun = (runs ?? []).find((row) => row.source === definition.id) ?? null;
    entries.push({
      id: definition.id,
      name: definition.name,
      // O sursă este „configurată” doar dacă Habitoo are un import real pentru ea.
      configured: definition.id === "habitoo_internal",
      syncStatus: state?.status ?? null,
      lastSyncAt: state?.last_sync_at ?? null,
      lastSuccessAt: state?.last_success_at ?? null,
      lastError: state?.last_error ?? null,
      total: total ?? 0,
      active: active ?? 0,
      duplicates: duplicates ?? 0,
      itemsInvalidLastRun: lastRun ? (lastRun.items_invalid ?? 0) : null,
      lastSeenAt: latest?.last_seen_at ?? null,
    });
  }

  return buildSourceQuality({ sources: entries, mix });
}

/** Agregarea completă pentru un set de filtre. */
export async function computeMarketIntelligence(
  admin: Admin,
  filters: MarketIntelligenceFilters,
  options: { includeTrend?: boolean; includeSources?: boolean } = {},
): Promise<MarketIntelligenceResult> {
  const { rows, totalMatched } = await loadMarketIntelligenceRows(admin, filters);

  const lastSyncAt = await (async () => {
    const { data } = await admin
      .from("market_source_state")
      .select("last_success_at")
      .order("last_success_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.last_success_at ?? null;
  })();

  const aggregate = aggregateMarketRows({ rows, totalMatched, lastSyncAt });
  const samplePricePerSqm = rows
    .map((row) => row.pricePerSqm ?? null)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const trend =
    options.includeTrend === false
      ? null
      : computeMarketTrend(
          await loadTrendObservations(
            admin,
            rows.map((row) => row.id),
          ),
        );

  const sources =
    options.includeSources === false ? [] : await loadSourceQuality(admin, aggregate.sourceMix);

  return {
    filters,
    aggregate,
    samplePricePerSqm,
    trend,
    sources,
    sourceNames: Object.fromEntries(MARKET_SOURCES.map((s) => [s.id, marketSourceName(s.id)])),
    computedAt: new Date().toISOString(),
  };
}
