/**
 * Stratul comun de adaptoare pentru sursele de date de piață.
 *
 * Fiecare sursă expune același contract (`MarketSourceAdapter`): aduce
 * înregistrări brute, iar normalizarea, validarea, deduplicarea și scrierea
 * rămân în pipeline-ul existent (`normalizeRecord` + `ingestListings`).
 * Astfel nicio sursă nu-și inventează propriul format de rezultat și nu apare
 * o a doua arhitectură de import.
 *
 * O sursă fără feed/API autorizat configurat rămâne `not_configured`: nu
 * simulăm niciodată o sincronizare reușită.
 */
import { ingestListings, type MarketRepository } from "./ingest";
import {
  normalizeRecord,
  type MarketFieldMapping,
  type NormalizedListing,
} from "./normalize";

export type MarketSourceSyncStatus = "not_configured" | "idle" | "running" | "error" | "ok";

/** Rezultat structurat, identic pentru orice sursă. */
export type SyncRunResult = {
  source: string;
  sourceName: string;
  status: MarketSourceSyncStatus;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  rejected: number;
  deactivated: number;
  duplicates: number;
  /** Rânduri unite cu o ofertă existentă de pe alt portal. */
  crossPortalMerges: number;
  ambiguous: number;
  errors: { reference: string; message: string }[];
};

export type AdapterContext = {
  /** Agenția pentru care rulează sincronizarea (null = pool comun). */
  organizationId: string | null;
  runId: string | null;
  now: string;
};

export type AdapterFetchResult = {
  records: unknown[];
  /** Maparea folosită pentru înregistrările aduse (implicit cea a sursei). */
  mapping: MarketFieldMapping;
  /** `full` = sursa a returnat toate ofertele active. */
  mode: "full" | "partial";
};

export type MarketSourceInfo = {
  id: string;
  name: string;
  provider: string;
  description: string;
  notes: string | null;
  formats: string[];
  /** Există import automat implementat pentru sursă. */
  pull: boolean;
  configured: boolean;
  /** Datele aparțin unei agenții (sursa internă), nu pool-ului comun. */
  orgScoped: boolean;
};

export type MarketSourceAdapter = {
  getSourceInfo(): MarketSourceInfo;
  testConnection(ctx: AdapterContext): Promise<{ ok: boolean; message: string }>;
  fetchRecords(ctx: AdapterContext): Promise<AdapterFetchResult>;
};

export const NOT_CONFIGURED_MESSAGE =
  "Sursa nu are un feed sau API autorizat configurat. Încarcă exportul primit de la sursă.";

/** Datele minime fără care o ofertă nu poate intra într-o analiză ACP. */
export function hasAcpMinimumData(listing: NormalizedListing): string | null {
  if (!listing.price || listing.price <= 0) return "Lipsește prețul.";
  const area = listing.usableArea ?? listing.totalArea;
  if (!area || area <= 0) return "Lipsește suprafața.";
  if (!listing.city && !listing.normalizedAddress) return "Lipsește localizarea.";
  if (!listing.propertyType) return "Lipsește tipul de proprietate.";
  if (!listing.transactionType) return "Lipsește tipul tranzacției (vânzare/închiriere).";
  return null;
}

export type NormalizeBatch = {
  listings: NormalizedListing[];
  rejected: { reference: string; message: string }[];
};

/**
 * Normalizează și validează un lot de înregistrări brute.
 * Nu completăm valori lipsă: ce nu trece validarea este respins cu motiv.
 */
export function normalizeRecords(
  source: string,
  records: readonly unknown[],
  mapping: MarketFieldMapping,
): NormalizeBatch {
  const listings: NormalizedListing[] = [];
  const rejected: { reference: string; message: string }[] = [];
  records.forEach((record, index) => {
    const result = normalizeRecord(source, record, mapping);
    if (!result.ok) {
      rejected.push({
        reference: `înregistrarea ${index + 1}`,
        message: result.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "),
      });
      return;
    }
    const missing = hasAcpMinimumData(result.listing);
    if (missing) {
      rejected.push({ reference: result.listing.sourceListingId, message: missing });
      return;
    }
    listings.push(result.listing);
  });
  return { listings, rejected };
}

function emptyResult(
  adapter: MarketSourceAdapter,
  startedAt: string,
  status: MarketSourceSyncStatus,
  errors: { reference: string; message: string }[],
): SyncRunResult {
  const info = adapter.getSourceInfo();
  return {
    source: info.id,
    sourceName: info.name,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    success: false,
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    rejected: 0,
    deactivated: 0,
    duplicates: 0,
    crossPortalMerges: 0,
    ambiguous: 0,
    errors,
  };
}

/**
 * Rulează o sincronizare completă pentru un adaptor, prin pipeline-ul existent.
 * Idempotentă: `ingestListings` identifică oferta după `source` +
 * `source_listing_id`, deci re-rularea actualizează, nu dublează.
 */
export async function runAdapterSync(
  adapter: MarketSourceAdapter,
  ctx: AdapterContext,
  repo: MarketRepository,
): Promise<SyncRunResult> {
  const info = adapter.getSourceInfo();
  const startedAt = ctx.now;

  if (!info.configured) {
    return emptyResult(adapter, startedAt, "not_configured", [
      { reference: info.id, message: NOT_CONFIGURED_MESSAGE },
    ]);
  }

  let fetched: AdapterFetchResult;
  try {
    fetched = await adapter.fetchRecords(ctx);
  } catch (error) {
    return emptyResult(adapter, startedAt, "error", [
      {
        reference: info.id,
        message: error instanceof Error ? error.message : "Eroare necunoscută la citirea sursei.",
      },
    ]);
  }

  const { listings, rejected } = normalizeRecords(info.id, fetched.records, fetched.mapping);
  const summary = await ingestListings(
    repo,
    { source: info.id, mode: fetched.mode, runId: ctx.runId, now: ctx.now },
    listings,
  );

  return {
    source: info.id,
    sourceName: info.name,
    status: summary.errors.length > 0 ? "error" : "ok",
    startedAt,
    finishedAt: new Date().toISOString(),
    success: summary.errors.length === 0,
    fetched: fetched.records.length,
    inserted: summary.created,
    updated: summary.updated,
    unchanged: summary.unchanged,
    skipped: summary.unchanged,
    rejected: rejected.length,
    deactivated: summary.deactivated,
    duplicates: summary.duplicates,
    crossPortalMerges: summary.crossPortalMerges,
    ambiguous: summary.ambiguous,
    errors: [...rejected, ...summary.errors].slice(0, 200),
  };
}

/** Cheia de blocare/stare: sursele per agenție se izolează pe agenție. */
export function sourceScopeKey(source: string, organizationId: string | null): string {
  return organizationId ? `${source}:${organizationId}` : source;
}
