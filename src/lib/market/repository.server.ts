/**
 * Implementarea `MarketRepository` peste baza de date.
 * Rulează exclusiv server-side, cu clientul privilegiat: pool-ul comun de
 * oferte nu poate fi scris din browser (RLS permite doar SELECT).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { MarketEntityCandidate } from "./dedupe";
import type {
  ExistingListing,
  ListingPatch,
  ListingWriteRow,
  MarketRepository,
  SnapshotRow,
} from "./ingest";
import type { NormalizedListing } from "./normalize";

type Admin = SupabaseClient<Database>;

const ENTITY_CANDIDATE_LIMIT = 200;

function listingRow(listing: NormalizedListing) {
  return {
    source: listing.source,
    source_listing_id: listing.sourceListingId,
    url: listing.url,
    title: listing.title,
    image_url: listing.imageUrl,
    property_type: listing.propertyType,
    transaction_type: listing.transactionType,
    city: listing.city,
    county: listing.county,
    district: listing.district,
    neighborhood: listing.neighborhood,
    address: listing.address,
    normalized_city: listing.normalizedCity,
    normalized_county: listing.normalizedCounty,
    normalized_district: listing.normalizedDistrict,
    normalized_neighborhood: listing.normalizedNeighborhood,
    normalized_address: listing.normalizedAddress,
    latitude: listing.latitude,
    longitude: listing.longitude,
    rooms: listing.rooms,
    bathrooms: listing.bathrooms,
    usable_area: listing.usableArea,
    total_area: listing.totalArea,
    floor: listing.floor,
    total_floors: listing.totalFloors,
    construction_year: listing.constructionYear,
    price: listing.price,
    currency: listing.currency,
    price_per_sqm: listing.pricePerSqm,
    condition: listing.condition,
    furnished: listing.furnished,
    parking: listing.parking,
    balcony: listing.balcony,
    features: listing.features as never,
    raw_data: listing.rawData as never,
    status: listing.status,
  };
}

function toExisting(row: Record<string, unknown>): ExistingListing {
  return {
    id: String(row.id),
    source: String(row.source),
    sourceListingId: (row.source_listing_id as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    price: (row.price as number | null) ?? null,
    currency: (row.currency as string | null) ?? null,
    pricePerSqm: (row.price_per_sqm as number | null) ?? null,
    status: String(row.status ?? "active"),
    initialPrice: (row.initial_price as number | null) ?? null,
    priceChanges: Number(row.price_changes ?? 0),
    statusChanges: Number(row.status_changes ?? 0),
    firstSeenAt: String(row.first_seen_at),
    marketEntityId: (row.market_entity_id as string | null) ?? null,
    dedupeStatus: String(row.dedupe_status ?? "unique"),
  };
}

export function createMarketRepository(admin: Admin): MarketRepository {
  return {
    async findListingBySource(source, sourceListingId) {
      const { data, error } = await admin
        .from("market_listings")
        .select("*")
        .eq("source", source)
        .eq("source_listing_id", sourceListingId)
        .maybeSingle();
      if (error) throw error;
      return data ? toExisting(data as never) : null;
    },

    async findEntityCandidates(listing) {
      // Restrângem candidații la aceeași localitate (sau la coordonate apropiate),
      // ca deduplicarea să rămână deterministă și ieftină.
      let query = admin
        .from("market_entities")
        .select("*")
        .limit(ENTITY_CANDIDATE_LIMIT);
      if (listing.normalizedCity) query = query.eq("normalized_city", listing.normalizedCity);
      else if (listing.normalizedAddress)
        query = query.eq("normalized_address", listing.normalizedAddress);
      else return [];
      const { data, error } = await query;
      if (error) throw error;
      const entities = data ?? [];
      if (entities.length === 0) return [];

      const ids = entities.map((row) => row.id);
      const { data: sourceRows } = await admin
        .from("market_listings")
        .select("market_entity_id,source,source_listing_id,url")
        .in("market_entity_id", ids);
      const sourcesByEntity = new Map<string, MarketEntityCandidate["sources"]>();
      for (const row of sourceRows ?? []) {
        if (!row.market_entity_id) continue;
        const list = sourcesByEntity.get(row.market_entity_id) ?? [];
        list.push({
          source: row.source,
          sourceListingId: row.source_listing_id,
          url: row.url,
        });
        sourcesByEntity.set(row.market_entity_id, list);
      }

      return entities.map<MarketEntityCandidate>((row) => ({
        id: row.id,
        normalizedAddress: row.normalized_address,
        normalizedCity: row.normalized_city,
        normalizedDistrict: row.normalized_district,
        normalizedNeighborhood: row.normalized_neighborhood,
        usableArea: row.usable_area,
        rooms: row.rooms,
        floor: row.floor,
        totalFloors: row.total_floors,
        constructionYear: row.construction_year,
        propertyType: row.property_type,
        transactionType: row.transaction_type,
        latitude: row.latitude,
        longitude: row.longitude,
        identityHash: row.identity_hash,
        sources: sourcesByEntity.get(row.id) ?? [],
      }));
    },

    async createEntity(listing, reasons) {
      const { data, error } = await admin
        .from("market_entities")
        .insert({
          normalized_address: listing.normalizedAddress,
          normalized_city: listing.normalizedCity,
          normalized_district: listing.normalizedDistrict,
          normalized_neighborhood: listing.normalizedNeighborhood,
          usable_area: listing.usableArea ?? listing.totalArea,
          rooms: listing.rooms,
          floor: listing.floor,
          total_floors: listing.totalFloors,
          construction_year: listing.constructionYear,
          property_type: listing.propertyType,
          transaction_type: listing.transactionType,
          latitude: listing.latitude,
          longitude: listing.longitude,
          identity_hash: null,
          listing_count: 1,
          identity_reasons: reasons as never,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    async touchEntity(entityId, listing) {
      const { data } = await admin
        .from("market_entities")
        .select("listing_count,latitude,longitude,construction_year,total_floors")
        .eq("id", entityId)
        .maybeSingle();
      await admin
        .from("market_entities")
        .update({
          listing_count: Number(data?.listing_count ?? 1),
          latitude: data?.latitude ?? listing.latitude,
          longitude: data?.longitude ?? listing.longitude,
          construction_year: data?.construction_year ?? listing.constructionYear,
          total_floors: data?.total_floors ?? listing.totalFloors,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entityId);
    },

    async insertListing(row: ListingWriteRow) {
      const { data, error } = await admin
        .from("market_listings")
        .insert({
          ...listingRow(row.listing),
          identity_hash: row.identityHash,
          market_entity_id: row.marketEntityId,
          dedupe_status: row.dedupeStatus,
          dedupe_score: row.dedupeScore,
          dedupe_reasons: row.dedupeReasons as never,
          initial_price: row.listing.price,
          first_seen_at: row.now,
          last_seen_at: row.now,
          last_import_run_id: row.runId,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (row.marketEntityId) {
        const { count } = await admin
          .from("market_listings")
          .select("id", { count: "exact", head: true })
          .eq("market_entity_id", row.marketEntityId);
        await admin
          .from("market_entities")
          .update({ listing_count: count ?? 1 })
          .eq("id", row.marketEntityId);
      }
      return data.id;
    },

    async updateListing(id, patch: ListingPatch) {
      const update: Record<string, unknown> = {
        ...listingRow(patch.listing),
        identity_hash: patch.identityHash,
        price_changes: patch.priceChanges,
        status_changes: patch.statusChanges,
        initial_price: patch.initialPrice,
        disappeared_at: patch.disappearedAt,
        last_seen_at: patch.now,
        last_import_run_id: patch.runId,
        updated_at: patch.now,
      };
      if (patch.marketEntityId !== undefined) update.market_entity_id = patch.marketEntityId;
      if (patch.dedupeStatus !== undefined) update.dedupe_status = patch.dedupeStatus;
      if (patch.dedupeScore !== undefined) update.dedupe_score = patch.dedupeScore;
      if (patch.dedupeReasons !== undefined) update.dedupe_reasons = patch.dedupeReasons;
      const { error } = await admin
        .from("market_listings")
        .update(update as never)
        .eq("id", id);
      if (error) throw error;
    },

    async insertSnapshot(row: SnapshotRow) {
      const { error } = await admin.from("market_listing_snapshots").insert({
        market_listing_id: row.marketListingId,
        price: row.price,
        currency: row.currency,
        price_per_sqm: row.pricePerSqm,
        status: row.status,
        change_type: row.changeType,
        previous_price: row.previousPrice,
        previous_status: row.previousStatus,
        import_run_id: row.runId,
        captured_at: row.capturedAt,
        raw_data: {} as never,
      });
      if (error) throw error;
    },

    async upsertListingSource(row) {
      const { data } = await admin
        .from("market_listing_sources")
        .select("id")
        .eq("market_listing_id", row.marketListingId)
        .eq("source", row.source)
        .eq("source_listing_id", row.sourceListingId ?? "")
        .maybeSingle();
      if (data?.id) {
        await admin
          .from("market_listing_sources")
          .update({ last_seen_at: row.now, url: row.url, last_price: row.price, is_active: true })
          .eq("id", data.id);
        return;
      }
      await admin.from("market_listing_sources").insert({
        market_listing_id: row.marketListingId,
        source: row.source,
        source_listing_id: row.sourceListingId,
        url: row.url,
        first_seen_at: row.now,
        last_seen_at: row.now,
        last_price: row.price,
        is_primary: row.isPrimary,
        is_active: true,
      });
    },

    async createDedupeReview(row) {
      await admin.from("market_dedupe_reviews").insert({
        market_listing_id: row.marketListingId,
        candidate_entity_id: row.candidateEntityId,
        score: row.score,
        reasons: row.reasons as never,
        status: "pending",
      });
    },

    async findMissingListings(source, seenIds) {
      let query = admin
        .from("market_listings")
        .select("*")
        .eq("source", source)
        .eq("status", "active");
      if (seenIds.length > 0) {
        const list = seenIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",");
        query = query.not("source_listing_id", "in", `(${list})`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => toExisting(row as never));
    },

    async markDisappeared(id, runId, now) {
      const { error } = await admin
        .from("market_listings")
        .update({
          status: "inactive",
          disappeared_at: now,
          last_import_run_id: runId,
          updated_at: now,
        })
        .eq("id", id);
      if (error) throw error;
      await admin
        .from("market_listing_sources")
        .update({ is_active: false })
        .eq("market_listing_id", id);
    },
  };
}
