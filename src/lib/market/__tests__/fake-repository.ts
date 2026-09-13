/**
 * Depozit în memorie pentru testarea pipeline-ului de import, fără bază de date.
 * Reproduce exact contractul `MarketRepository`.
 */
import { matchListingToEntities, type MarketEntityCandidate } from "../dedupe";
import type {
  ExistingListing,
  ListingPatch,
  ListingWriteRow,
  MarketRepository,
  SnapshotRow,
} from "../ingest";
import type { NormalizedListing } from "../normalize";

export type FakeListing = ExistingListing & {
  listing: NormalizedListing;
  lastSeenAt: string;
  disappearedAt: string | null;
  dedupeScore: number | null;
  dedupeReasons: string[];
};

export type FakeStore = {
  listings: FakeListing[];
  entities: MarketEntityCandidate[];
  snapshots: SnapshotRow[];
  sources: {
    marketListingId: string;
    source: string;
    sourceListingId: string | null;
    url: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    isActive: boolean;
    isPrimary: boolean;
  }[];
  reviews: {
    marketListingId: string;
    candidateEntityId: string | null;
    score: number;
    reasons: string[];
  }[];
};

export function createFakeRepository(): { repo: MarketRepository; store: FakeStore } {
  const store: FakeStore = {
    listings: [],
    entities: [],
    snapshots: [],
    sources: [],
    reviews: [],
  };
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

  const repo: MarketRepository = {
    async findListingBySource(source, sourceListingId) {
      return (
        store.listings.find(
          (row) => row.source === source && row.sourceListingId === sourceListingId,
        ) ?? null
      );
    },
    async findEntityCandidates(listing) {
      return store.entities.filter(
        (entity) =>
          !listing.normalizedCity ||
          !entity.normalizedCity ||
          entity.normalizedCity === listing.normalizedCity,
      );
    },
    async createEntity(listing) {
      const id = nextId("entity");
      store.entities.push({
        id,
        normalizedAddress: listing.normalizedAddress,
        normalizedCity: listing.normalizedCity,
        normalizedDistrict: listing.normalizedDistrict,
        normalizedNeighborhood: listing.normalizedNeighborhood,
        usableArea: listing.usableArea ?? listing.totalArea,
        rooms: listing.rooms,
        floor: listing.floor,
        totalFloors: listing.totalFloors,
        constructionYear: listing.constructionYear,
        propertyType: listing.propertyType,
        transactionType: listing.transactionType,
        latitude: listing.latitude,
        longitude: listing.longitude,
        identityHash: null,
        sources: [],
      });
      return id;
    },
    async touchEntity() {
      // nimic de actualizat în memorie
    },
    async insertListing(row: ListingWriteRow) {
      const id = nextId("listing");
      store.listings.push({
        id,
        source: row.listing.source,
        sourceListingId: row.listing.sourceListingId,
        url: row.listing.url,
        price: row.listing.price,
        currency: row.listing.currency,
        pricePerSqm: row.listing.pricePerSqm,
        status: row.listing.status,
        initialPrice: row.listing.price,
        priceChanges: 0,
        statusChanges: 0,
        firstSeenAt: row.now,
        lastSeenAt: row.now,
        marketEntityId: row.marketEntityId,
        dedupeStatus: row.dedupeStatus,
        dedupeScore: row.dedupeScore,
        dedupeReasons: row.dedupeReasons,
        disappearedAt: null,
        listing: row.listing,
      });
      if (row.marketEntityId) {
        const entity = store.entities.find((e) => e.id === row.marketEntityId);
        entity?.sources.push({
          source: row.listing.source,
          sourceListingId: row.listing.sourceListingId,
          url: row.listing.url,
        });
      }
      return id;
    },
    async updateListing(id, patch: ListingPatch) {
      const existing = store.listings.find((row) => row.id === id);
      if (!existing) throw new Error("Ofertă inexistentă");
      existing.listing = patch.listing;
      existing.price = patch.listing.price;
      existing.currency = patch.listing.currency;
      existing.pricePerSqm = patch.listing.pricePerSqm;
      existing.status = patch.listing.status;
      existing.priceChanges = patch.priceChanges;
      existing.statusChanges = patch.statusChanges;
      existing.initialPrice = patch.initialPrice;
      existing.lastSeenAt = patch.now;
      existing.disappearedAt = patch.disappearedAt;
      if (patch.marketEntityId !== undefined) existing.marketEntityId = patch.marketEntityId;
      if (patch.dedupeStatus !== undefined) existing.dedupeStatus = patch.dedupeStatus;
    },
    async insertSnapshot(row) {
      store.snapshots.push(row);
    },
    async upsertListingSource(row) {
      const existing = store.sources.find(
        (item) =>
          item.marketListingId === row.marketListingId &&
          item.source === row.source &&
          item.sourceListingId === row.sourceListingId,
      );
      if (existing) {
        existing.lastSeenAt = row.now;
        existing.url = row.url;
        existing.isActive = true;
        return;
      }
      store.sources.push({
        marketListingId: row.marketListingId,
        source: row.source,
        sourceListingId: row.sourceListingId,
        url: row.url,
        firstSeenAt: row.now,
        lastSeenAt: row.now,
        isActive: true,
        isPrimary: row.isPrimary,
      });
    },
    async createDedupeReview(row) {
      store.reviews.push(row);
    },
    async findMissingListings(source, seenIds) {
      return store.listings.filter(
        (row) =>
          row.source === source &&
          row.status === "active" &&
          !seenIds.includes(row.sourceListingId ?? ""),
      );
    },
    async markDisappeared(id, _runId, now) {
      const existing = store.listings.find((row) => row.id === id);
      if (!existing) return;
      existing.status = "inactive";
      existing.disappearedAt = now;
      for (const source of store.sources.filter((s) => s.marketListingId === id)) {
        source.isActive = false;
      }
    },
  };

  return { repo, store };
}

/** Ajutor pentru teste: decide entitatea folosind aceleași reguli ca importul. */
export function decideEntity(listing: NormalizedListing, entities: MarketEntityCandidate[]) {
  return matchListingToEntities(listing, entities);
}
