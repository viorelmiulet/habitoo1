/**
 * Scrierea prospecților proveniți din Apify.
 *
 * Refolosește exact tabela și cheia de conflict ale prospectării existente
 * (`organization_id,normalized_hash`), deci nu apare un al doilea traseu de
 * date. Scorul se calculează cu aceeași funcție, pe criterii neutre: sursa nu
 * are o căutare asociată.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreProspect } from "@/lib/prospecting/scoring";
import type { NormalizedProspect, ProspectSearchCriteria } from "@/lib/prospecting/types";

const NEUTRAL_CRITERIA: ProspectSearchCriteria = {
  transactionType: null,
  propertyTypes: [],
  counties: [],
  cities: [],
  zones: [],
  priceMin: null,
  priceMax: null,
  currency: null,
  roomsMin: null,
  roomsMax: null,
  surfaceMin: null,
  surfaceMax: null,
  keywords: [],
  excludeKeywords: [],
  sellerTypes: ["private"],
  maxAgeDays: null,
};

export async function writeApifyProspects(
  admin: SupabaseClient,
  organizationId: string,
  prospects: readonly NormalizedProspect[],
  now: string,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const prospect of prospects) {
    const score = scoreProspect(prospect, { criteria: NEUTRAL_CRITERIA });
    const { data: existing } = await admin
      .from("prospects")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("normalized_hash", prospect.normalizedHash)
      .maybeSingle();

    const { error } = await admin.from("prospects").upsert(
      {
        organization_id: organizationId,
        source_id: prospect.sourceKey,
        external_id: prospect.externalId,
        source_url: prospect.sourceUrl,
        canonical_url: prospect.canonicalUrl,
        title: prospect.title,
        description: prospect.description,
        seller_name: prospect.sellerName,
        seller_phone: prospect.sellerPhone,
        seller_type: prospect.sellerType,
        seller_confidence: prospect.sellerConfidence,
        transaction_type: prospect.transactionType,
        property_type: prospect.propertyType,
        county: prospect.county,
        city: prospect.city,
        zone: prospect.zone,
        address: prospect.address,
        price: prospect.price,
        currency: prospect.currency,
        rooms: prospect.rooms,
        surface_useful: prospect.surfaceUseful,
        surface_built: prospect.surfaceBuilt,
        floor: prospect.floor,
        total_floors: prospect.totalFloors,
        year_built: prospect.yearBuilt,
        features: prospect.features as never,
        images: prospect.images as never,
        published_at: prospect.publishedAt,
        last_seen_at: now,
        content_hash: prospect.contentHash,
        normalized_hash: prospect.normalizedHash,
        opportunity_score: score.score,
        score_breakdown: score as never,
        relevance_score: score.relevance,
        extraction_confidence: prospect.extractionConfidence,
        status: existing ? "updated" : "new",
        raw_metadata: { fieldSources: prospect.fieldSources, origin: "apify" } as never,
        updated_at: now,
      } as never,
      { onConflict: "organization_id,normalized_hash" },
    );
    if (error) continue;
    if (existing) updated += 1;
    else created += 1;
  }

  return { created, updated };
}
