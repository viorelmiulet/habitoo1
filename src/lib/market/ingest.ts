/**
 * Pipeline determinist de import al ofertelor de piață.
 *
 * Logica nu atinge direct baza de date: lucrează prin `MarketRepository`,
 * ca să poată fi testată integral cu un depozit în memorie.
 *
 * Garanții:
 *  - idempotent: aceeași ofertă importată din nou nu creează duplicate;
 *  - istoricul nu se șterge niciodată: schimbările devin snapshot-uri;
 *  - dispariția din feed marchează oferta ca inactivă, fără ștergere;
 *  - deduplicarea ambiguă nu unește nimic automat, ci cere verificare manuală.
 */
import {
  buildIdentityHash,
  matchListingToEntities,
  type DedupeDecision,
  type MarketEntityCandidate,
} from "./dedupe";
import type { MarketListingStatus, NormalizedListing } from "./normalize";

export type ExistingListing = {
  id: string;
  source: string;
  sourceListingId: string | null;
  url: string | null;
  price: number | null;
  currency: string | null;
  pricePerSqm: number | null;
  status: string;
  initialPrice: number | null;
  priceChanges: number;
  statusChanges: number;
  firstSeenAt: string;
  marketEntityId: string | null;
  dedupeStatus: string;
};

export type ListingWriteRow = {
  listing: NormalizedListing;
  identityHash: string | null;
  marketEntityId: string | null;
  dedupeStatus: "unique" | "merged" | "ambiguous";
  dedupeScore: number | null;
  dedupeReasons: string[];
  runId: string | null;
  now: string;
};

export type ListingPatch = {
  listing: NormalizedListing;
  identityHash: string | null;
  marketEntityId?: string | null;
  dedupeStatus?: "unique" | "merged" | "ambiguous";
  dedupeScore?: number | null;
  dedupeReasons?: string[];
  priceChanges: number;
  statusChanges: number;
  initialPrice: number | null;
  disappearedAt: string | null;
  runId: string | null;
  now: string;
};

export type SnapshotRow = {
  marketListingId: string;
  price: number | null;
  currency: string | null;
  pricePerSqm: number | null;
  status: string;
  changeType: "first_import" | "price" | "status" | "reappeared" | "disappeared";
  previousPrice: number | null;
  previousStatus: string | null;
  runId: string | null;
  capturedAt: string;
};

export type MarketRepository = {
  findListingBySource(
    source: string,
    sourceListingId: string,
  ): Promise<ExistingListing | null>;
  findEntityCandidates(listing: NormalizedListing): Promise<MarketEntityCandidate[]>;
  createEntity(listing: NormalizedListing, reasons: string[]): Promise<string>;
  touchEntity(entityId: string, listing: NormalizedListing): Promise<void>;
  insertListing(row: ListingWriteRow): Promise<string>;
  updateListing(id: string, patch: ListingPatch): Promise<void>;
  insertSnapshot(row: SnapshotRow): Promise<void>;
  upsertListingSource(row: {
    marketListingId: string;
    source: string;
    sourceListingId: string | null;
    url: string | null;
    price: number | null;
    isPrimary: boolean;
    now: string;
  }): Promise<void>;
  createDedupeReview(row: {
    marketListingId: string;
    candidateEntityId: string | null;
    score: number;
    reasons: string[];
  }): Promise<void>;
  /** Ofertele sursei care nu au fost văzute în rulare (doar la feed complet). */
  findMissingListings(source: string, seenIds: string[]): Promise<ExistingListing[]>;
  /** Marchează o ofertă dispărută din feed ca inactivă, păstrând istoricul. */
  markDisappeared(id: string, runId: string | null, now: string): Promise<void>;
};

export type ImportSummary = {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  duplicates: number;
  ambiguous: number;
  priceChanges: number;
  statusChanges: number;
  errors: { reference: string; message: string }[];
};

export type IngestOptions = {
  source: string;
  /** `full` = feedul conține toate ofertele active ale sursei. */
  mode: "full" | "partial";
  runId: string | null;
  now: string;
};

export function emptySummary(): ImportSummary {
  return {
    received: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    deactivated: 0,
    duplicates: 0,
    ambiguous: 0,
    priceChanges: 0,
    statusChanges: 0,
    errors: [],
  };
}

function samePrice(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 0.005;
}

async function resolveEntity(
  repo: MarketRepository,
  listing: NormalizedListing,
): Promise<{ decision: DedupeDecision; entityId: string | null }> {
  const candidates = await repo.findEntityCandidates(listing);
  const decision = matchListingToEntities(listing, candidates);
  if (decision.decision === "match" && decision.entityId) {
    await repo.touchEntity(decision.entityId, listing);
    return { decision, entityId: decision.entityId };
  }
  if (decision.decision === "new") {
    const entityId = await repo.createEntity(listing, decision.reasons);
    return { decision, entityId };
  }
  return { decision, entityId: null };
}

/** Importă un set de oferte deja normalizate. */
export async function ingestListings(
  repo: MarketRepository,
  options: IngestOptions,
  listings: readonly NormalizedListing[],
): Promise<ImportSummary> {
  const summary = emptySummary();
  const seen = new Set<string>();

  for (const listing of listings) {
    summary.received += 1;
    const reference = listing.sourceListingId;
    try {
      if (seen.has(reference)) {
        summary.errors.push({
          reference,
          message: "Ofertă duplicată în același fișier: prima apariție a fost păstrată.",
        });
        continue;
      }
      seen.add(reference);

      const existing = await repo.findListingBySource(options.source, reference);
      const identityHash = buildIdentityHash(listing);

      if (!existing) {
        const { decision, entityId } = await resolveEntity(repo, listing);
        const dedupeStatus =
          decision.decision === "match"
            ? "merged"
            : decision.decision === "ambiguous"
              ? "ambiguous"
              : "unique";
        const listingId = await repo.insertListing({
          listing,
          identityHash,
          marketEntityId: entityId,
          dedupeStatus,
          dedupeScore: decision.score || null,
          dedupeReasons: decision.reasons,
          runId: options.runId,
          now: options.now,
        });
        await repo.upsertListingSource({
          marketListingId: listingId,
          source: listing.source,
          sourceListingId: listing.sourceListingId,
          url: listing.url,
          price: listing.price,
          isPrimary: dedupeStatus !== "merged",
          now: options.now,
        });
        await repo.insertSnapshot({
          marketListingId: listingId,
          price: listing.price,
          currency: listing.currency,
          pricePerSqm: listing.pricePerSqm,
          status: listing.status,
          changeType: "first_import",
          previousPrice: null,
          previousStatus: null,
          runId: options.runId,
          capturedAt: options.now,
        });
        if (dedupeStatus === "merged") summary.duplicates += 1;
        if (dedupeStatus === "ambiguous") {
          summary.ambiguous += 1;
          for (const candidate of decision.candidates) {
            await repo.createDedupeReview({
              marketListingId: listingId,
              candidateEntityId: candidate.entityId,
              score: candidate.score,
              reasons: candidate.reasons,
            });
          }
        }
        summary.created += 1;
        continue;
      }

      // Ofertă existentă: comparăm și înregistrăm doar schimbările reale.
      const priceChanged = !samePrice(existing.price, listing.price);
      const statusChanged = existing.status !== listing.status;
      const reappeared = existing.status !== "active" && listing.status === "active";

      if (priceChanged) {
        await repo.insertSnapshot({
          marketListingId: existing.id,
          price: listing.price,
          currency: listing.currency,
          pricePerSqm: listing.pricePerSqm,
          status: listing.status,
          changeType: "price",
          previousPrice: existing.price,
          previousStatus: existing.status,
          runId: options.runId,
          capturedAt: options.now,
        });
        summary.priceChanges += 1;
      }
      if (statusChanged) {
        await repo.insertSnapshot({
          marketListingId: existing.id,
          price: listing.price,
          currency: listing.currency,
          pricePerSqm: listing.pricePerSqm,
          status: listing.status,
          changeType: reappeared ? "reappeared" : "status",
          previousPrice: existing.price,
          previousStatus: existing.status,
          runId: options.runId,
          capturedAt: options.now,
        });
        summary.statusChanges += 1;
      }

      // Recuperăm entitatea canonică dacă lipsea (import mai vechi sau ambiguu).
      let entityPatch: Partial<ListingPatch> = {};
      if (!existing.marketEntityId) {
        const { decision, entityId } = await resolveEntity(repo, listing);
        if (entityId) {
          entityPatch = {
            marketEntityId: entityId,
            dedupeStatus: decision.decision === "match" ? "merged" : "unique",
            dedupeScore: decision.score || null,
            dedupeReasons: decision.reasons,
          };
          if (decision.decision === "match") summary.duplicates += 1;
        }
      } else if (existing.marketEntityId) {
        await repo.touchEntity(existing.marketEntityId, listing);
      }

      await repo.updateListing(existing.id, {
        listing,
        identityHash,
        priceChanges: existing.priceChanges + (priceChanged ? 1 : 0),
        statusChanges: existing.statusChanges + (statusChanged ? 1 : 0),
        initialPrice: existing.initialPrice ?? listing.price,
        disappearedAt: listing.status === "active" ? null : options.now,
        runId: options.runId,
        now: options.now,
        ...entityPatch,
      });
      await repo.upsertListingSource({
        marketListingId: existing.id,
        source: listing.source,
        sourceListingId: listing.sourceListingId,
        url: listing.url,
        price: listing.price,
        isPrimary: false,
        now: options.now,
      });

      if (priceChanged || statusChanged) summary.updated += 1;
      else summary.unchanged += 1;
    } catch (error) {
      summary.errors.push({
        reference,
        message: error instanceof Error ? error.message : "Eroare necunoscută la import.",
      });
    }
  }

  if (options.mode === "full") {
    const missing = await repo.findMissingListings(options.source, [...seen]);
    for (const listing of missing) {
      await repo.insertSnapshot({
        marketListingId: listing.id,
        price: listing.price,
        currency: listing.currency,
        pricePerSqm: listing.pricePerSqm,
        status: "inactive",
        changeType: "disappeared",
        previousPrice: listing.price,
        previousStatus: listing.status,
        runId: options.runId,
        capturedAt: options.now,
      });
      await repo.markDisappeared(listing.id, options.runId, options.now);
      summary.deactivated += 1;
      summary.statusChanges += 1;
    }
  }

  return summary;
}

/** Starea derivată din istoric, pentru afișare în UI. */
export type ListingHistoryInsight = {
  initialPrice: number | null;
  currentPrice: number | null;
  totalDiscount: number | null;
  discountPercent: number | null;
  priceChanges: number;
  statusChanges: number;
  daysOnMarket: number | null;
  status: MarketListingStatus | string;
};

export function summarizeHistory(input: {
  initialPrice: number | null;
  price: number | null;
  priceChanges: number;
  statusChanges: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: string;
}): ListingHistoryInsight {
  const first = Date.parse(input.firstSeenAt);
  const last = Date.parse(input.lastSeenAt);
  const days =
    Number.isFinite(first) && Number.isFinite(last)
      ? Math.max(0, Math.round((last - first) / 86_400_000))
      : null;
  const discount =
    input.initialPrice !== null && input.price !== null ? input.initialPrice - input.price : null;
  return {
    initialPrice: input.initialPrice,
    currentPrice: input.price,
    totalDiscount: discount,
    discountPercent:
      discount !== null && input.initialPrice && input.initialPrice > 0
        ? Math.round((discount / input.initialPrice) * 1000) / 10
        : null,
    priceChanges: input.priceChanges,
    statusChanges: input.statusChanges,
    daysOnMarket: days,
    status: input.status,
  };
}
