/**
 * Server functions pentru modulul ACP (faza 2).
 *
 * Serverul face doar trei lucruri: colectează candidații din surse existente
 * (fără a duplica tabele), apelează motorul pur `runAcpAnalysis` și persistă
 * rezultatul. Nu există AI, scraping sau acces direct la portaluri.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { ACP_SOURCE_TYPE_LABELS, type AcpSourceType } from "./config";
import { acpSourceOutcomeLabel } from "./source-outcome";
import { marketListingToSubject, propertyToSubject } from "./adapters";
import { runAcpAnalysis, targetPricePerSqm, type AcpCandidate, type AcpManualOverride } from "./engine";
import type { MarketQueryMarketContext } from "./market-query/port";
import {
  ACP_CURRENT_ENGINE_VERSION,
  engineSupportsLiveMarketQuery,
  normalizeAcpEngineVersion,
} from "./engine-version";
// `time-adjustment.server.ts` este server-only: se importă dinamic în handler.
import type {
  AcpPriceIndexSnapshot,
  AcpTimeAdjustment,
  AcpTimeAdjustmentSummary,
} from "./time-adjustment";
import type { AcpSubject } from "./scoring";
import type { AcpComparableResult } from "./engine";
import { ACP_AUDIT_ACTIONS, logAcpAudit } from "./audit";
import { acpDbError, acpError, acpSafeMessage } from "./safe-error";
import {
  acpSourcesSchema,
  canRecalculateInPlace,
  canRunAcpForTarget,
  shouldReuseRunningAnalysis,
} from "./guards";
import { readStoredAcpAiInsight, type AcpAiInsight } from "./ai/schema";
import { dedupeMarketCandidates } from "@/lib/market/acp";
import {
  calculateDataQuality,
  calculateFreshness,
  calculatePriceHistory,
  comparableRelevance,
  type AcpListingMeta,
} from "./precision";
// `calibration.server.ts` este server-only: se importă dinamic în handler.
import type { AcpCalibrationModel } from "./calibration";
import {
  buildAcpMarketInsights,
  marketFiltersFromSubject,
  type MarketIntelligenceAggregate,
  type MarketIntelligenceFilters,
} from "@/lib/market/intelligence";

// `intelligence.server.ts` este server-only: se importă dinamic în handler.
import { marketSourceName } from "@/lib/market/sources";

import {
  compareAcpVersionSnapshots,
  nextVersionNumber,
  type AcpVersionComparison,
  type AcpVersionListItem,
  type AcpVersionSnapshot,
} from "./versioning";


const MEDIA_BUCKET = "property-media";

/** Statusuri de proprietate care pot servi ca dovadă de piață. */
const CANDIDATE_STATUSES = ["active", "reserved", "negotiation", "sold", "rented"] as const;

const PROPERTY_COLUMNS =
  "id,organization_id,title,reference,property_type,transaction_kind,status,archived_at,city,county,district,lat,lng,rooms,usable_surface,surface,floor,building_floors,build_year,finish_state,parking,parking_spaces,balcony,furnishing,price,currency";

type PropertyRow = {
  id: string;
  organization_id: string;
  title: string;
  reference: string | null;
  city: string | null;
  district: string | null;
  county: string | null;
} & Record<string, unknown>;

type AuthContext = { userId: string };

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Actor = { userId: string; organizationId: string; collaborationEnabled: boolean };

async function loadActor(context: AuthContext): Promise<Actor> {
  const admin = await loadAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  const organizationId = profile?.organization_id ?? null;
  if (!organizationId) {
    throw new Error("Analiza comparativă este disponibilă doar utilizatorilor unei agenții.");
  }
  const { data: org } = await admin
    .from("organizations")
    .select("collaboration_enabled")
    .eq("id", organizationId)
    .maybeSingle();
  return {
    userId: context.userId,
    organizationId,
    collaborationEnabled: org?.collaboration_enabled !== false,
  };
}

/** Metadate reale de prospețime/istoric pentru o ofertă de piață. */
function marketListingMeta(
  row: Record<string, unknown>,
  extra: { status: string; duplicateCount: number },
): AcpListingMeta {
  const numeric = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
        ? Number(value)
        : null;
  const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
  return {
    firstSeenAt: text(row["first_seen_at"]),
    lastSeenAt: text(row["last_seen_at"]),
    initialPrice: numeric(row["initial_price"]),
    currentPrice: numeric(row["price"]),
    priceChanges: numeric(row["price_changes"]),
    status: extra.status,
    duplicateCount: extra.duplicateCount,
  };
}


/**
 * Stage 7: modelul de calibrare activ al agenției. Dacă agenția nu a activat
 * calibrarea sau nu există date suficiente, rezultatul este `null` și motorul
 * rulează exact ca înainte (baseline determinist).
 */
/**
 * Indicele trimestrial pentru ajustarea în timp, citit doar din baza de date.
 * Tabel gol ⇒ `null` ⇒ motorul nu aplică nicio ajustare în timp.
 */
async function loadPriceIndex(admin: unknown): Promise<AcpPriceIndexSnapshot | null> {
  const { loadAcpPriceIndex } = await import("./time-adjustment.server");
  return loadAcpPriceIndex(admin as never);
}

async function loadCalibration(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  organizationId: string,
): Promise<AcpCalibrationModel | null> {
  try {
    const { loadActiveCalibrationModel } = await import("./calibration.server");
    return await loadActiveCalibrationModel(admin as never, organizationId);
  } catch {
    return null;
  }
}


function locationLabel(row: { district?: string | null; city?: string | null; county?: string | null }) {
  return [row.district, row.city, row.county].filter(Boolean).join(", ") || null;
}

/** Imaginea principală publicabilă a fiecărei proprietăți. */
async function primaryImages(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  propertyIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (propertyIds.length === 0) return map;
  const { data } = await admin
    .from("property_images")
    .select("property_id,storage_path,position,is_primary")
    .in("property_id", propertyIds)
    .eq("is_confidential", false)
    .eq("include_in_publish", true)
    .order("position", { ascending: true });
  for (const row of data ?? []) {
    if (!row.storage_path) continue;
    const current = map.get(row.property_id);
    if (!current || row.is_primary) map.set(row.property_id, row.storage_path);
  }
  return map;
}

type SourceStat = {
  sourceType: AcpSourceType;
  sourceName: string;
  itemsFound: number;
  /** Doar pentru sursele interogate live: cum a răspuns sursa. */
  outcome?: string | null;
  outcomeDetail?: string | null;
};

/**
 * Colectează candidații. Prefiltrarea este deterministă și documentată:
 * același tip de proprietate, același tip de tranzacție și, când se cunoaște,
 * același oraș.
 */
async function collectCandidates(params: {
  admin: Awaited<ReturnType<typeof loadAdmin>>;
  actor: Actor;
  target: AcpSubject;
  targetPropertyId: string | null;
  sources: Record<string, boolean>;
  /** Interogarea live rulează doar de la versiunea 3 a motorului. */
  engineVersion: number;
}): Promise<{
  candidates: AcpCandidate[];
  stats: SourceStat[];
  /** Cifrele publicate de surse, ținute separat de calculul nostru. */
  marketQueryContexts: MarketQueryMarketContext[];
}> {
  const { admin, actor, target, targetPropertyId, sources } = params;
  const candidates: AcpCandidate[] = [];
  const stats: SourceStat[] = [];
  const marketQueryContexts: MarketQueryMarketContext[] = [];

  const applyPropertyFilters = <T extends { eq: (column: string, value: never) => T }>(
    query: T,
  ): T => {
    let out = query;
    if (target.propertyType) out = out.eq("property_type", target.propertyType as never);
    if (target.transactionType) out = out.eq("transaction_kind", target.transactionType as never);
    if (target.city) out = out.eq("city", target.city as never);
    return out;
  };


  const propertyRows: { row: PropertyRow; sourceType: AcpSourceType; sourceName: string }[] = [];

  // 1. Proprietățile agenției.
  if (sources["own_properties"]) {
    let query = admin
      .from("properties")
      .select(PROPERTY_COLUMNS)
      .eq("organization_id", actor.organizationId)
      .is("deleted_at", null)
      .is("archived_at", null)
      .in("status", [...CANDIDATE_STATUSES])
      .limit(200);
    query = applyPropertyFilters(query);
    if (targetPropertyId) query = query.neq("id", targetPropertyId);
    const { data, error } = await query;
    if (error) throw acpDbError("collect own properties", error);
    const rows = (data ?? []) as unknown as PropertyRow[];
    for (const row of rows) {
      propertyRows.push({
        row,
        sourceType: "own_properties",
        sourceName: ACP_SOURCE_TYPE_LABELS.own_properties,
      });
    }
    stats.push({
      sourceType: "own_properties",
      sourceName: ACP_SOURCE_TYPE_LABELS.own_properties,
      itemsFound: rows.length,
    });
  }

  // 2. Colaborare Habitoo — doar dacă ambele agenții participă.
  if (sources["collaboration"] && actor.collaborationEnabled) {
    const { data: orgs } = await admin
      .from("organizations")
      .select("id,name,status,archived_at,collaboration_enabled")
      .neq("id", actor.organizationId);
    const participating = new Map<string, string>();
    for (const org of orgs ?? []) {
      if (org.archived_at) continue;
      if (org.collaboration_enabled === false) continue;
      if (org.status !== "active" && org.status !== "trial") continue;
      participating.set(org.id, org.name);
    }
    let rows: PropertyRow[] = [];
    if (participating.size > 0) {
      let query = admin
        .from("properties")
        .select(PROPERTY_COLUMNS)
        .in("organization_id", [...participating.keys()])
        .eq("collaboration", true)
        .is("deleted_at", null)
        .in("status", ["active", "reserved", "negotiation"])
        .limit(200);
      query = applyPropertyFilters(query);
      const { data, error } = await query;
      if (error) throw acpDbError("collect collaboration properties", error);
      rows = (data ?? []) as unknown as PropertyRow[];
      for (const row of rows) {
        propertyRows.push({
          row,
          sourceType: "collaboration",
          sourceName: participating.get(row.organization_id) ?? ACP_SOURCE_TYPE_LABELS.collaboration,
        });
      }
    }
    stats.push({
      sourceType: "collaboration",
      sourceName: ACP_SOURCE_TYPE_LABELS.collaboration,
      itemsFound: rows.length,
    });
  }

  const images = await primaryImages(
    admin,
    propertyRows.map((p) => p.row.id),
  );

  for (const item of propertyRows) {
    candidates.push({
      key: `property:${item.row.id}`,
      sourceType: item.sourceType,
      sourceName: item.sourceName,
      propertyId: item.row.id,
      title: item.row.reference ? `${item.row.reference} · ${item.row.title}` : item.row.title,
      locationLabel: locationLabel(item.row),
      imagePath: images.get(item.row.id) ?? null,
      subject: propertyToSubject(item.row as never),
    });
  }

  // 3. Pool comun de oferte normalizate (alimentat prin importurile din faza 3).
  //    Ofertele active au prioritate, iar anunțurile aceleiași proprietăți
  //    apărute pe mai multe surse se numără o singură dată (entitate canonică).
  if (sources["portal"]) {
    let query = admin
      .from("market_listings")
      .select("*")
      .in("status", ["active", "inactive"])
      .order("last_seen_at", { ascending: false })
      .limit(400);
    if (target.propertyType) query = query.eq("property_type", target.propertyType);
    if (target.transactionType) query = query.eq("transaction_type", target.transactionType);
    if (target.city) query = query.eq("city", target.city);
    const { data, error } = await query;
    if (error) throw acpDbError("collect market listings", error);
    const rows = data ?? [];
    const deduped = dedupeMarketCandidates(rows as never);
    for (const item of deduped) {
      const row = item.row as unknown as Record<string, unknown> & {
        id: string;
        source: string;
        url: string | null;
        address: string | null;
        city: string | null;
        county: string | null;
        district: string | null;
        neighborhood: string | null;
        title: string | null;
        status: string;
      };
      const sourceNames = item.sources.map((s) => marketSourceName(s.source)).join(" + ");
      candidates.push({
        key: `market:${item.row.market_entity_id ?? row.id}`,
        sourceType: "portal",
        sourceName: item.active
          ? sourceNames || ACP_SOURCE_TYPE_LABELS.portal
          : `${sourceNames || ACP_SOURCE_TYPE_LABELS.portal} (dispărută din feed)`,
        marketListingId: row.id,
        title: row.title ?? row.address ?? row.url ?? "Ofertă de piață",
        locationLabel: locationLabel({
          district: row.neighborhood ?? row.district,
          city: row.city,
          county: row.county,
        }),
        url: row.url,
        subject: marketListingToSubject(row as never),
        // Stage 7: prospețime și istoric de preț din datele reale ale ofertei.
        meta: marketListingMeta(item.row as unknown as Record<string, unknown>, {
          status: row.status,
          duplicateCount: item.duplicateCount,
        }),
      });
    }
    stats.push({
      sourceType: "portal",
      sourceName: ACP_SOURCE_TYPE_LABELS.portal,
      itemsFound: deduped.length,
    });
  }


  // 4. Surse partenere întrebate live, în momentul rulării. Nimic nu se
  //    colectează în fundal: doar analiza curentă folosește răspunsul, iar din
  //    el se păstrează exclusiv câmpurile de mai jos.
  if (sources["market_query"] && engineSupportsLiveMarketQuery(params.engineVersion)) {
    const { runMarketQuery } = await import("./market-query/run.server");
    const live = await runMarketQuery(admin as never, target);
    for (const item of live.comparables) {
      candidates.push({
        key: `market_query:${item.sourceKey}:${item.url ?? `${item.price}-${item.area}`}`,
        sourceType: "market_query",
        sourceName: item.sourceLabel,
        title: item.url ?? `Ofertă ${item.sourceLabel}`,
        locationLabel: locationLabel({
          district: item.zone,
          city: item.locality,
          county: target.county ?? null,
        }),
        url: item.url,
        subject: {
          propertyType: target.propertyType ?? null,
          transactionType: target.transactionType ?? null,
          city: item.locality,
          county: target.county ?? null,
          neighborhood: item.zone,
          rooms: item.rooms,
          usableArea: item.area,
          price: item.price,
        },
      });
    }
    for (const outcome of live.outcomes) {
      stats.push({
        sourceType: "market_query",
        sourceName: outcome.sourceLabel,
        itemsFound: outcome.comparables,
        outcome: outcome.outcome,
        outcomeDetail: outcome.detail,
      });
    }
    // Cifrele agregate ale surselor nu intră în nicio medie a noastră: se
    // păstrează ca bloc separat, etichetat, cu data citirii.
    marketQueryContexts.push(...live.marketContexts);
  }

  return { candidates, stats, marketQueryContexts };
}

/** Salvează rezultatul motorului: comparabile, surse, statistici, estimare. */
async function persistRun(params: {
  admin: Awaited<ReturnType<typeof loadAdmin>>;
  analysisId: string;
  organizationId: string;
  actorId: string;
  target: AcpSubject;
  sources: Record<string, boolean>;
  overrides: Record<string, AcpManualOverride>;
  stats: SourceStat[];
  result: ReturnType<typeof runAcpAnalysis>;
  version: number;
  /** Versiunea motorului cu care a fost calculat rezultatul. */
  engineVersion: number;
  history: unknown[];
  /** Cifrele publicate de surse, doar pentru afișare. */
  marketQueryContexts?: MarketQueryMarketContext[];
  /** Stage 7: modelul de calibrare folosit la rulare (null = fără calibrare). */
  calibration?: AcpCalibrationModel | null;
}) {
  const { admin, analysisId, result } = params;

  // Snapshot Market Intelligence (Stage 4): statisticile pieței valabile la
  // momentul rulării. Raportul unei versiuni istorice folosește acest snapshot,
  // nu datele live. Eșecul acestui pas nu blochează analiza.
  let marketIntelligence: {
    capturedAt: string;
    filters: MarketIntelligenceFilters;
    aggregate: MarketIntelligenceAggregate;
    insights: ReturnType<typeof buildAcpMarketInsights>;
  } | null = null;
  try {
    const { computeMarketIntelligence } = await import("@/lib/market/intelligence.server");
    const filters = marketFiltersFromSubject(params.target);
    const market = await computeMarketIntelligence(admin, filters, {
      includeTrend: false,
      includeSources: false,
    });

    marketIntelligence = {
      capturedAt: market.computedAt,
      filters,
      aggregate: market.aggregate,
      insights: buildAcpMarketInsights({
        aggregate: market.aggregate,
        samplePricePerSqm: market.samplePricePerSqm,
        targetPricePerSqm: targetPricePerSqm(params.target),
        estimatedValue: result.estimate.estimatedValue,
        recommendedListingPrice: result.estimate.recommendedListingPrice,
        usableArea: params.target.usableArea ?? null,
        comparables: result.comparables.map((c) => ({
          isSelected: c.isSelected,
          isOutlier: c.isOutlier,
        })),
      }),
    };
  } catch {
    marketIntelligence = null;
  }

  await admin.from("acp_comparables").delete().eq("analysis_id", analysisId);


  if (result.comparables.length > 0) {
    const rows = result.comparables.map((c) => ({
      analysis_id: analysisId,
      market_listing_id: c.marketListingId,
      source_property_id: c.propertyId,
      source_type: c.sourceType,
      source_name: c.sourceName,
      similarity_score: c.similarityScore,
      location_score: c.components["location"] ?? null,
      area_score: c.components["area"] ?? null,
      rooms_score: c.components["rooms"] ?? null,
      distance_score: c.components["distance"] ?? null,
      floor_score: c.components["floor"] ?? null,
      year_score: c.components["year"] ?? null,
      condition_score: c.components["condition"] ?? null,
      features_score: c.components["features"] ?? null,
      other_score: c.components["other"] ?? null,
      component_scores: c.components as never,
      adjustments: c.adjustments as never,
      adjustment_amount: c.adjustmentAmount,
      adjustment_percent: c.adjustmentPercent,
      adjusted_price: c.adjustedPrice,
      adjusted_price_per_sqm: c.adjustedPricePerSqm,
      is_selected: c.isSelected,
      is_outlier: c.isOutlier,
      outlier_reason: c.outlierReason,
      selection_reason: c.selectionReason,
      manual_override: c.manualOverride,
      tier: c.tier,
      image_path: c.imagePath,
      snapshot: {
        key: c.key,
        title: c.title,
        locationLabel: c.locationLabel,
        url: c.url,
        subject: c.subject,
        skippedAdjustments: c.skippedAdjustments,
        // Stage 7: indicatorii de precizie fac parte din snapshot-ul versiunii.
        dataQuality: c.dataQuality,
        freshness: c.freshness,
        priceHistory: c.priceHistory,
        relevanceScore: c.relevanceScore,
        timeAdjustment: c.timeAdjustment ?? null,
      } as never,
    }));
    const { error } = await admin.from("acp_comparables").insert(rows);
    if (error) throw acpDbError("insert comparables", error);
  }

  await admin.from("acp_analysis_sources").delete().eq("analysis_id", analysisId);
  if (params.stats.length > 0) {
    const usedBySource = new Map<AcpSourceType, number>();
    for (const c of result.comparables) {
      if (!c.isSelected) continue;
      usedBySource.set(c.sourceType, (usedBySource.get(c.sourceType) ?? 0) + 1);
    }
    const usedByName = new Map<string, number>();
    for (const c of result.comparables) {
      if (!c.isSelected) continue;
      const key = `${c.sourceType}|${c.sourceName}`;
      usedByName.set(key, (usedByName.get(key) ?? 0) + 1);
    }
    const { error } = await admin.from("acp_analysis_sources").insert(
      params.stats.map((s) => {
        // Sursele live sunt raportate pe numele sursei (fiecare portal separat).
        const used =
          s.sourceType === "market_query"
            ? (usedByName.get(`market_query|${s.sourceName}`) ?? 0)
            : (usedBySource.get(s.sourceType) ?? 0);
        return {
          analysis_id: analysisId,
          source_type: s.sourceType,
          source_name: s.sourceName,
          enabled: true,
          items_found: s.itemsFound,
          items_used: used,
          items_excluded: Math.max(0, s.itemsFound - used),
          outcome: s.outcome ?? null,
          outcome_detail: s.outcomeDetail ?? null,
        };
      }),
    );
    if (error) throw acpDbError("insert analysis sources", error);
  }

  const { error: updateError } = await admin
    .from("acp_analyses")
    .update({
      status: "completed",
      sources: params.sources as never,
      comparables_count: result.comparables.length,
      comparables_used: result.comparablesUsed,
      confidence_score: result.confidence.score,
      estimated_min: result.estimate.estimatedMin,
      estimated_value: result.estimate.estimatedValue,
      estimated_max: result.estimate.estimatedMax,
      recommended_listing_price: result.estimate.recommendedListingPrice,
      average_price_per_sqm: result.statistics.averagePricePerSqm,
      median_price_per_sqm: result.statistics.medianPricePerSqm,
      price_min: result.statistics.minimum,
      price_max: result.statistics.maximum,
      price_average: result.statistics.average,
      price_median: result.statistics.median,
      price_p25: result.statistics.p25,
      price_p75: result.statistics.p75,
      error_message: null,
      version: params.version,
      engine_version: params.engineVersion,
      history: params.history as never,
      last_run_at: new Date().toISOString(),
      snapshot_at: new Date().toISOString(),

      analysis_data: {
        statistics: result.statistics,
        estimate: result.estimate,
        confidence: result.confidence,
        explanation: result.explanation,
        overrides: params.overrides,
        candidatesFound: result.candidatesFound,
        targetPricePerSqm: targetPricePerSqm(params.target),
        marketIntelligence,
        // Stage 7: calitatea datelor, estimarea calibrată și modelul folosit
        // intră în snapshot-ul versiunii, ca raportul istoric să fie reproductibil.
        quality: result.quality,
        advanced: result.advanced,
        calibration: params.calibration ?? null,
        // Motor v2: ajustarea în timp face parte din snapshot-ul versiunii.
        engineVersion: params.engineVersion,
        timeAdjustment: result.timeAdjustment ?? null,
        // Motor v3: cifrele publicate de sursele interogate live, separat.
        marketQueryContexts: params.marketQueryContexts ?? [],
      } as never,

    })
    .eq("id", analysisId);
  if (updateError) throw acpDbError("persist analysis run", updateError);
}

/** Stage 8: rulările ACP sunt operațiuni scumpe și au limită proprie. */
export const ACP_RUN_RATE_LIMITS = {
  perUser: { limit: 20, windowSeconds: 3600 },
  perOrganization: { limit: 60, windowSeconds: 3600 },
} as const;

async function enforceRunRateLimit(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
) {
  for (const [bucket, config] of [
    [`acp_run:user:${actor.userId}`, ACP_RUN_RATE_LIMITS.perUser],
    [`acp_run:org:${actor.organizationId}`, ACP_RUN_RATE_LIMITS.perOrganization],
  ] as const) {
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _bucket: bucket,
      _limit: config.limit,
      _window_seconds: config.windowSeconds,
    });
    if (allowed === false) {
      throw acpError("Prea multe analize pornite în ultima oră. Încearcă din nou mai târziu.");
    }
  }
}

/**
 * Stage 9: blochează rulările noi (analiză nouă sau versiune nouă) pentru o
 * proprietate retrasă din portofoliu. Istoricul existent rămâne accesibil.
 */
async function assertTargetRunnable(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: { organizationId: string; userId: string },
  propertyId: string | null,
) {
  if (!propertyId) return;
  const { data, error } = await admin
    .from("properties")
    .select("id,status,archived_at")
    .eq("id", propertyId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (error) throw acpDbError("load target property", error);
  if (!data) return;
  const verdict = canRunAcpForTarget({
    archivedAt: data.archived_at ?? null,
    status: data.status ?? null,
  });
  if (verdict.allowed) return;
  await logAcpAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: ACP_AUDIT_ACTIONS.runBlocked,
    details: { propertyId, reason: verdict.reason },
  });
  throw acpError(verdict.message);
}


const createSchema = z.object({
  propertyId: z.string().uuid(),
  title: z.string().trim().max(200).optional(),
  sources: acpSourcesSchema,
});

/** Creează analiza (snapshot al proprietății) și rulează imediat motorul. */
export const createAcpAnalysis = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ context, data }): Promise<{ analysisId: string }> => {
    const actor = await loadActor(context as AuthContext);
    const admin = await loadAdmin();

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select(PROPERTY_COLUMNS)
      .eq("id", data.propertyId)
      .eq("organization_id", actor.organizationId)
      .maybeSingle();
    if (propertyError) throw acpDbError("load property", propertyError);
    if (!property) throw acpError("Proprietatea analizată nu a fost găsită în agenția ta.");

    // Stage 9: o proprietate retrasă din portofoliu nu mai poate porni rulări noi.
    const targetVerdict = canRunAcpForTarget({
      archivedAt: (property as { archived_at?: string | null }).archived_at ?? null,
      status: (property as { status?: string | null }).status ?? null,
    });
    if (!targetVerdict.allowed) {
      await logAcpAudit({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: ACP_AUDIT_ACTIONS.runBlocked,
        details: { propertyId: data.propertyId, reason: targetVerdict.reason },
      });
      throw acpError(targetVerdict.message);
    }

    // Protecție la dublu-click / retry: o rulare pornită foarte recent pentru
    // aceeași proprietate este reutilizată în loc să creăm o analiză duplicat.
    const { data: runningRows } = await admin
      .from("acp_analyses")
      .select("id,status,created_at")
      .eq("organization_id", actor.organizationId)
      .eq("property_id", data.propertyId)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1);
    const running = (runningRows ?? [])[0];
    if (
      running &&
      shouldReuseRunningAnalysis({ status: running.status, createdAt: running.created_at })
    ) {
      return { analysisId: running.id };
    }

    await enforceRunRateLimit(admin, actor);

    const row = property as unknown as PropertyRow;
    const subject = propertyToSubject(row as never);
    const title = data.title?.trim() || `ACP · ${row.title}`;

    const { data: created, error: insertError } = await admin
      .from("acp_analyses")
      .insert({
        organization_id: actor.organizationId,
        created_by: actor.userId,
        property_id: row.id,
        title,
        status: "running",
        target_data: {
          propertyId: row.id,
          reference: row.reference,
          title: row.title,
          locationLabel: locationLabel(row),
          capturedAt: new Date().toISOString(),
          subject,
        } as never,
        sources: data.sources as never,
      })
      .select("id")
      .single();
    if (insertError) throw acpDbError("create analysis", insertError);

    // Versiunea 1 este propriul root al liniei de versiuni.
    await admin
      .from("acp_analyses")
      .update({ root_analysis_id: created.id, parent_analysis_id: null })
      .eq("id", created.id);



    try {
      const { candidates, stats, marketQueryContexts } = await collectCandidates({
        admin,
        actor,
        target: subject,
        targetPropertyId: row.id,
        sources: data.sources,
        engineVersion: ACP_CURRENT_ENGINE_VERSION,
      });
      const calibration = await loadCalibration(admin, actor.organizationId);
      const priceIndex = await loadPriceIndex(admin);
      const result = runAcpAnalysis(subject, candidates, {}, {
        calibration,
        priceIndex,
        engineVersion: ACP_CURRENT_ENGINE_VERSION,
      });
      await persistRun({
        admin,
        analysisId: created.id,
        organizationId: actor.organizationId,
        actorId: actor.userId,
        target: subject,
        sources: data.sources,
        overrides: {},
        stats,
        marketQueryContexts,
        result,
        version: 1,
        engineVersion: ACP_CURRENT_ENGINE_VERSION,
        history: [],
        calibration,
      });
    } catch (error) {
      await admin
        .from("acp_analyses")
        .update({
          status: "draft",
          error_message: acpSafeMessage(error, "Analiza nu a putut fi finalizată."),
        })
        .eq("id", created.id);
      throw error;
    }

    await logAcpAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: ACP_AUDIT_ACTIONS.analysisCreated,
      analysisId: created.id,
      details: { propertyId: row.id, sources: data.sources },
    });

    return { analysisId: created.id };
  });

/** Recalculează o analiză existentă, păstrând deciziile manuale. */
export const rerunAcpAnalysis = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ analysisId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const actor = await loadActor(context as AuthContext);
    const admin = await loadAdmin();
    await recalculate(admin, actor, data.analysisId);
    await logAcpAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: ACP_AUDIT_ACTIONS.analysisRun,
      analysisId: data.analysisId,
    });
    return { ok: true };
  });

/** Include sau exclude manual un comparabil, apoi recalculează analiza. */
export const setAcpComparableOverride = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        analysisId: z.string().uuid(),
        comparableKey: z.string().min(1).max(120),
        override: z.enum(["include", "exclude", "auto"]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const actor = await loadActor(context as AuthContext);
    const admin = await loadAdmin();
    const analysis = await loadAnalysis(admin, actor, data.analysisId);

    const overrides = readOverrides(analysis.analysis_data);
    if (data.override === "auto") delete overrides[data.comparableKey];
    else overrides[data.comparableKey] = data.override;

    await recalculate(admin, actor, data.analysisId, overrides);
    await logAcpAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: ACP_AUDIT_ACTIONS.analysisUpdated,
      analysisId: data.analysisId,
      details: { comparableKey: data.comparableKey, override: data.override },
    });
    return { ok: true };
  });

type AnalysisRow = {
  engine_version?: number | null;
  id: string;
  organization_id: string;
  property_id: string | null;
  status: string;
  version: number | null;
  target_data: unknown;
  sources: unknown;
  analysis_data: unknown;
  history: unknown;
  estimated_value: number | null;
  confidence_score: number | null;
};

async function loadAnalysis(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
  analysisId: string,
): Promise<AnalysisRow> {
  const { data, error } = await admin
    .from("acp_analyses")
    .select(
      "id,organization_id,property_id,status,version,target_data,sources,analysis_data,history,estimated_value,confidence_score",
    )
    .eq("id", analysisId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (error) throw acpDbError("load analysis", error);
  if (!data) throw acpError("Analiza nu a fost găsită în agenția ta.");
  return data as unknown as AnalysisRow;
}

function readOverrides(analysisData: unknown): Record<string, AcpManualOverride> {
  const raw = (analysisData as { overrides?: unknown } | null)?.overrides;
  const out: Record<string, AcpManualOverride> = {};
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === "include" || value === "exclude") out[key] = value;
    }
  }
  return out;
}

function readSubject(targetData: unknown): AcpSubject {
  const subject = (targetData as { subject?: AcpSubject } | null)?.subject;
  if (!subject) throw acpError("Analiza nu conține datele proprietății analizate.");
  return subject;
}

/**
 * Stage 8: verifică dacă versiunea are deja livrabile (raport sau interpretare
 * AI). Dacă are, rămâne imutabilă și recalcularea se face doar ca versiune nouă.
 */
async function versionDeliverables(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  analysisId: string,
): Promise<{ hasReport: boolean; hasAiInsight: boolean }> {
  const [reports, insights] = await Promise.all([
    admin.from("acp_reports").select("id").eq("analysis_id", analysisId).limit(1),
    admin.from("acp_ai_insights").select("id").eq("analysis_id", analysisId).limit(1),
  ]);
  return {
    hasReport: (reports.data ?? []).length > 0,
    hasAiInsight: (insights.data ?? []).length > 0,
  };
}

async function recalculate(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
  analysisId: string,
  overridesInput?: Record<string, AcpManualOverride>,
) {
  const analysis = await loadAnalysis(admin, actor, analysisId);
  const deliverables = await versionDeliverables(admin, analysisId);
  const verdict = canRecalculateInPlace({
    status: analysis.status,
    hasReport: deliverables.hasReport,
    hasAiInsight: deliverables.hasAiInsight,
  });
  if (!verdict.allowed) throw acpError(verdict.message);

  const previousStatus = analysis.status;
  const subject = readSubject(analysis.target_data);
  const sources = (analysis.sources as Record<string, boolean> | null) ?? {
    own_properties: true,
  };
  const overrides = overridesInput ?? readOverrides(analysis.analysis_data);

  // Blocare optimistă: doar un singur request poate marca analiza „running".
  const { data: claimed, error: claimError } = await admin
    .from("acp_analyses")
    .update({ status: "running" })
    .eq("id", analysisId)
    .eq("organization_id", actor.organizationId)
    .neq("status", "running")
    .select("id");
  if (claimError) throw acpDbError("claim analysis run", claimError);
  if ((claimed ?? []).length === 0) {
    throw acpError("Analiza rulează deja. Așteaptă finalizarea ei.");
  }

  const storedEngineVersion = normalizeAcpEngineVersion(analysis.engine_version);

  try {

    const { candidates, stats, marketQueryContexts } = await collectCandidates({
      admin,
      actor,
      target: subject,
      targetPropertyId: analysis.property_id,
      sources,
      // Recalcularea în loc păstrează versiunea motorului a analizei:
      // metodologia nu se schimbă în spatele utilizatorului, iar o analiză v1/v2
      // nu face nicio cerere de rețea.
      engineVersion: storedEngineVersion,
    });
    const calibration = await loadCalibration(admin, actor.organizationId);
    const engineVersion = storedEngineVersion;
    const priceIndex = await loadPriceIndex(admin);
    const result = runAcpAnalysis(subject, candidates, overrides, {
      calibration,
      priceIndex,
      engineVersion,
    });
    const previousHistory = Array.isArray(analysis.history) ? analysis.history : [];
    const history = [
      ...previousHistory.slice(-19),
      {
        version: analysis.version ?? 1,
        estimatedValue: analysis.estimated_value,
        confidenceScore: analysis.confidence_score,
        recordedAt: new Date().toISOString(),
      },
    ];
    await persistRun({
      admin,
      analysisId,
      organizationId: actor.organizationId,
      actorId: actor.userId,
      target: subject,
      sources,
      overrides,
      stats,
      marketQueryContexts,
      result,
      version: (analysis.version ?? 1) + 1,
      engineVersion,
      history,
      calibration,
    });
  } catch (error) {
    // Revenim exact la starea anterioară, cu un mesaj sigur pentru utilizator.
    await admin
      .from("acp_analyses")
      .update({
        status: previousStatus === "running" ? "draft" : previousStatus,
        error_message: acpSafeMessage(error, "Recalcularea nu a putut fi finalizată."),
      })
      .eq("id", analysisId);
    throw error;
  }
}

export type AcpComparableView = Omit<AcpComparableResult, "components"> & {
  id: string;
  components: Record<string, number>;
  imageUrl: string | null;
};

export type AcpAnalysisView = {
  id: string;
  title: string;
  status: string;
  version: number;
  errorMessage: string | null;
  createdAt: string;
  lastRunAt: string | null;
  propertyId: string | null;
  target: {
    title: string;
    reference: string | null;
    locationLabel: string | null;
    capturedAt: string | null;
    subject: AcpSubject;
    pricePerSqm: number | null;
  };
  sources: Record<string, boolean>;
  sourceStats: {
    sourceType: string;
    sourceName: string;
    itemsFound: number;
    itemsUsed: number;
    itemsExcluded: number;
    /** Starea sursei interogate live, în română, sau `null`. */
    outcomeLabel: string | null;
    outcomeDetail: string | null;
  }[];
  /** Versiunea motorului care a produs cifrele acestei analize. */
  engineVersion: number;
  /** Rezumatul ajustării în timp (doar motor v2; null pentru analizele v1). */
  timeAdjustment: AcpTimeAdjustmentSummary | null;
  /** Cifrele publicate de sursele interogate live, separat de calculul nostru. */
  marketQueryContexts: MarketQueryMarketContext[];
  statistics: ReturnType<typeof runAcpAnalysis>["statistics"] | null;
  estimate: ReturnType<typeof runAcpAnalysis>["estimate"] | null;
  confidence: ReturnType<typeof runAcpAnalysis>["confidence"] | null;
  explanation: string[];
  /** Stage 7: calitatea datelor și estimarea calibrată (null pentru analize vechi). */
  quality: ReturnType<typeof runAcpAnalysis>["quality"] | null;
  advanced: ReturnType<typeof runAcpAnalysis>["advanced"] | null;
  calibration: AcpCalibrationModel | null;
  comparables: AcpComparableView[];
  aiConfigured: boolean;
  ai: {
    provider: string | null;
    model: string | null;
    generatedAt: string | null;
    promptVersion: string | null;
    schemaVersion: string | null;
    analysisVersion: number | null;
    snapshotAt: string | null;
    legacy: boolean;
    insight: AcpAiInsight | null;
  } | null;
};

/** Detaliul complet al unei analize, cu imagini semnate pentru comparabile. */
export const getAcpAnalysis = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ analysisId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<AcpAnalysisView> => {
    const actor = await loadActor(context as AuthContext);
    const admin = await loadAdmin();

    const { data: analysis, error } = await admin
      .from("acp_analyses")
      .select("*")
      .eq("id", data.analysisId)
      .eq("organization_id", actor.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!analysis) throw new Error("Analiza nu a fost găsită în agenția ta.");

    const { data: comparables } = await admin
      .from("acp_comparables")
      .select("*")
      .eq("analysis_id", data.analysisId)
      .order("similarity_score", { ascending: false });

    const { data: sourceRows } = await admin
      .from("acp_analysis_sources")
      .select("source_type,source_name,items_found,items_used,items_excluded,outcome,outcome_detail")
      .eq("analysis_id", data.analysisId);

    const paths = (comparables ?? [])
      .map((c) => c.image_path)
      .filter((p): p is string => Boolean(p));
    const signedByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await admin.storage
        .from(MEDIA_BUCKET)
        .createSignedUrls([...new Set(paths)], 60 * 60);
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
      }
    }

    const analysisData = (analysis.analysis_data ?? {}) as {
      statistics?: AcpAnalysisView["statistics"];
      estimate?: AcpAnalysisView["estimate"];
      confidence?: AcpAnalysisView["confidence"];
      explanation?: string[];
      targetPricePerSqm?: number | null;
      engineVersion?: number | null;
      timeAdjustment?: AcpTimeAdjustmentSummary | null;
      marketQueryContexts?: MarketQueryMarketContext[] | null;
      quality?: AcpAnalysisView["quality"];
      advanced?: AcpAnalysisView["advanced"];
      calibration?: AcpCalibrationModel | null;
      ai?: {
        provider?: string | null;
        model?: string | null;
        generatedAt?: string | null;
        promptVersion?: string | null;
        schemaVersion?: string | null;
        analysisVersion?: number | null;
        snapshotAt?: string | null;
        insight?: unknown;
      } | null;
    };
    // Interpretările generate înainte de Stage 5 sunt aduse la schema actuală.
    const storedInsight = readStoredAcpAiInsight(analysisData.ai?.insight ?? null);
    const targetData = (analysis.target_data ?? {}) as {
      title?: string;
      reference?: string | null;
      locationLabel?: string | null;
      capturedAt?: string | null;
      subject?: AcpSubject;
    };

    return {
      id: analysis.id,
      title: analysis.title,
      status: analysis.status,
      version: analysis.version ?? 1,
      errorMessage: analysis.error_message ?? null,
      createdAt: analysis.created_at,
      lastRunAt: analysis.last_run_at ?? null,
      propertyId: analysis.property_id,
      target: {
        title: targetData.title ?? analysis.title,
        reference: targetData.reference ?? null,
        locationLabel: targetData.locationLabel ?? null,
        capturedAt: targetData.capturedAt ?? null,
        subject: targetData.subject ?? {},
        pricePerSqm:
          analysisData.targetPricePerSqm ??
          (targetData.subject ? targetPricePerSqm(targetData.subject) : null),
      },
      sources: (analysis.sources as Record<string, boolean> | null) ?? {},
      sourceStats: (sourceRows ?? []).map((s) => ({
        sourceType: s.source_type,
        sourceName: s.source_name,
        itemsFound: s.items_found ?? 0,
        itemsUsed: s.items_used ?? 0,
        itemsExcluded: s.items_excluded ?? 0,
        outcomeLabel: acpSourceOutcomeLabel(s.outcome ?? null),
        outcomeDetail: s.outcome_detail ?? null,
      })),
      engineVersion: normalizeAcpEngineVersion(
        analysis.engine_version ?? analysisData.engineVersion ?? null,
      ),
      timeAdjustment: analysisData.timeAdjustment ?? null,
      marketQueryContexts: analysisData.marketQueryContexts ?? [],
      statistics: analysisData.statistics ?? null,
      estimate: analysisData.estimate ?? null,
      confidence: analysisData.confidence ?? null,
      explanation: analysisData.explanation ?? [],
      quality: analysisData.quality ?? null,
      advanced: analysisData.advanced ?? null,
      calibration: analysisData.calibration ?? null,
      aiConfigured: Boolean(process.env["LOVABLE_API_KEY"]),
      ai: analysisData.ai
        ? {
            provider: analysisData.ai.provider ?? null,
            model: analysisData.ai.model ?? analysis.ai_model ?? null,
            generatedAt: analysisData.ai.generatedAt ?? analysis.ai_generated_at ?? null,
            promptVersion: analysisData.ai.promptVersion ?? null,
            schemaVersion: analysisData.ai.schemaVersion ?? null,
            analysisVersion: analysisData.ai.analysisVersion ?? null,
            snapshotAt: analysisData.ai.snapshotAt ?? null,
            legacy: storedInsight?.legacy ?? false,
            insight: storedInsight?.insight ?? null,
          }
        : null,
      comparables: (comparables ?? []).map((c) => {
        const snapshot = (c.snapshot ?? {}) as {
          key?: string;
          title?: string;
          locationLabel?: string | null;
          url?: string | null;
          subject?: AcpSubject;
          skippedAdjustments?: string[];
          dataQuality?: AcpComparableResult["dataQuality"];
          freshness?: AcpComparableResult["freshness"];
          priceHistory?: AcpComparableResult["priceHistory"];
          relevanceScore?: number;
          timeAdjustment?: AcpTimeAdjustment | null;
        };
        const subject = snapshot.subject ?? {};
        // Comparabilele salvate înainte de Stage 7 nu au indicatorii de precizie:
        // se recalculează determinist din snapshot, fără a inventa metadate.
        const dataQuality = snapshot.dataQuality ?? calculateDataQuality(subject);
        const freshness = snapshot.freshness ?? calculateFreshness(null, analysis.snapshot_at ?? undefined);
        const priceHistory =
          snapshot.priceHistory ?? calculatePriceHistory({ currentPrice: subject.price ?? null });
        const similarityScore = Number(c.similarity_score ?? 0);
        return {
          id: c.id,
          key: snapshot.key ?? c.id,
          sourceType: c.source_type as AcpSourceType,
          sourceName: c.source_name ?? "",
          propertyId: c.source_property_id,
          marketListingId: c.market_listing_id,
          title: snapshot.title ?? "Comparabil",
          locationLabel: snapshot.locationLabel ?? null,
          imagePath: c.image_path,
          imageUrl: c.image_path ? (signedByPath.get(c.image_path) ?? null) : null,
          url: snapshot.url ?? null,
          subject,
          similarityScore,
          components: (c.component_scores ?? {}) as Record<string, number>,
          tier: (c.tier ?? "excluded") as AcpComparableResult["tier"],
          adjustments: (c.adjustments ?? []) as AcpComparableResult["adjustments"],
          adjustmentAmount: c.adjustment_amount,
          adjustmentPercent: c.adjustment_percent,
          skippedAdjustments: (snapshot.skippedAdjustments ??
            []) as AcpComparableResult["skippedAdjustments"],
          adjustedPrice: c.adjusted_price,
          adjustedPricePerSqm: c.adjusted_price_per_sqm,
          isOutlier: Boolean(c.is_outlier),
          outlierReason: c.outlier_reason,
          isSelected: Boolean(c.is_selected),
          selectionReason: c.selection_reason ?? "",
          manualOverride: (c.manual_override ?? null) as AcpManualOverride | null,
          dataQuality,
          freshness,
          priceHistory,
          ...(snapshot.timeAdjustment ? { timeAdjustment: snapshot.timeAdjustment } : {}),
          relevanceScore:
            snapshot.relevanceScore ??
            comparableRelevance({
              similarityScore,
              dataQualityScore: dataQuality.score,
              freshnessScore: freshness.score,
            }),
        };
      }),
    };
  });

// ==================== Faza 3, Etapa 2: versionare + comparație ====================

/** Limită rezonabilă pentru recalculări (versiuni noi). */
export const ACP_VERSION_RATE_LIMITS = {
  perUser: { limit: 12, windowSeconds: 3600 },
  perOrganization: { limit: 40, windowSeconds: 3600 },
} as const;

const VERSION_COLUMNS =
  "id,organization_id,created_by,property_id,title,status,error_message,version," +
  "parent_analysis_id,root_analysis_id,snapshot_at,created_at,target_data,sources,analysis_data," +
  "estimated_value,estimated_min,estimated_max,recommended_listing_price," +
  "median_price_per_sqm,average_price_per_sqm,confidence_score," +
  "comparables_count,comparables_used,ai_summary,ai_model,ai_generated_at";

type VersionRow = {
  id: string;
  organization_id: string;
  created_by: string | null;
  property_id: string | null;
  title: string;
  status: string;
  error_message: string | null;
  version: number | null;
  parent_analysis_id: string | null;
  root_analysis_id: string | null;
  snapshot_at: string | null;
  created_at: string;
  target_data: unknown;
  sources: unknown;
  analysis_data: unknown;
  estimated_value: number | null;
  estimated_min: number | null;
  estimated_max: number | null;
  recommended_listing_price: number | null;
  median_price_per_sqm: number | null;
  average_price_per_sqm: number | null;
  confidence_score: number | null;
  comparables_count: number | null;
  comparables_used: number | null;
  ai_summary: string | null;
  ai_model: string | null;
  ai_generated_at: string | null;
  engine_version?: number | null;
};

async function loadVersionRow(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
  analysisId: string,
): Promise<VersionRow> {
  const { data, error } = await admin
    .from("acp_analyses")
    .select(VERSION_COLUMNS)
    .eq("id", analysisId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Analiza nu a fost găsită în agenția ta.");
  return data as unknown as VersionRow;
}

async function loadRootVersionRows(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
  rootId: string,
): Promise<VersionRow[]> {
  const { data, error } = await admin
    .from("acp_analyses")
    .select(VERSION_COLUMNS)
    .eq("organization_id", actor.organizationId)
    .or(`root_analysis_id.eq.${rootId},id.eq.${rootId}`)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as VersionRow[];
}

async function creatorNames(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await admin.from("profiles").select("id,full_name").in("id", unique);
  for (const row of data ?? []) {
    if (row.full_name) out.set(row.id, row.full_name);
  }
  return out;
}

function rowCurrency(row: VersionRow): string | null {
  const subject = (row.target_data as { subject?: { currency?: string | null } } | null)?.subject;
  return subject?.currency ?? null;
}

function rowToVersionItem(row: VersionRow, createdByName: string | null): AcpVersionListItem {
  return {
    id: row.id,
    version: row.version ?? 1,
    engineVersion: normalizeAcpEngineVersion(row.engine_version ?? null),
    status: row.status,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    snapshotAt: row.snapshot_at ?? null,
    createdByName,
    estimatedValue: row.estimated_value,
    estimatedMin: row.estimated_min,
    estimatedMax: row.estimated_max,
    recommendedListingPrice: row.recommended_listing_price,
    medianPricePerSqm: row.median_price_per_sqm,
    averagePricePerSqm: row.average_price_per_sqm,
    confidenceScore: row.confidence_score,
    comparablesCount: row.comparables_count ?? 0,
    comparablesUsed: row.comparables_used ?? 0,
    currency: rowCurrency(row),
    sources: [],
    ai: row.ai_model || row.ai_generated_at || row.ai_summary
      ? { model: row.ai_model, generatedAt: row.ai_generated_at, summary: row.ai_summary }
      : null,
  };
}

async function buildVersionSnapshot(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  row: VersionRow,
  createdByName: string | null,
): Promise<AcpVersionSnapshot> {
  const [{ data: comparables }, { data: sourceRows }] = await Promise.all([
    admin
      .from("acp_comparables")
      .select(
        "id,source_type,source_name,snapshot,similarity_score,tier,adjustment_amount,adjusted_price,adjusted_price_per_sqm,is_outlier,is_selected",
      )
      .eq("analysis_id", row.id)
      .order("similarity_score", { ascending: false }),
    admin
      .from("acp_analysis_sources")
      .select("source_type,source_name,items_found,items_used,items_excluded,outcome,outcome_detail")
      .eq("analysis_id", row.id),
  ]);

  const item = rowToVersionItem(row, createdByName);
  return {
    ...item,
    sources: (sourceRows ?? []).map((s) => ({
      sourceType: s.source_type,
      sourceName: s.source_name ?? "",
      itemsFound: s.items_found ?? 0,
      itemsUsed: s.items_used ?? 0,
      itemsExcluded: s.items_excluded ?? 0,
    })),
    comparables: (comparables ?? []).map((c) => {
      const snapshot = (c.snapshot ?? {}) as {
        key?: string;
        title?: string;
        subject?: { price?: number | null };
      };
      return {
        key: snapshot.key ?? c.id,
        title: snapshot.title ?? "Comparabil",
        sourceName: c.source_name ?? "",
        price: snapshot.subject?.price ?? null,
        adjustedPrice: c.adjusted_price,
        adjustedPricePerSqm: c.adjusted_price_per_sqm,
        similarityScore: Number(c.similarity_score ?? 0),
        tier: (c.tier ?? "excluded") as string,
        adjustmentAmount: c.adjustment_amount,
        isOutlier: Boolean(c.is_outlier),
        isSelected: Boolean(c.is_selected),
      };
    }),
  };
}

async function enforceVersionRateLimit(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
) {
  for (const [bucket, config] of [
    [`acp_version:user:${actor.userId}`, ACP_VERSION_RATE_LIMITS.perUser],
    [`acp_version:org:${actor.organizationId}`, ACP_VERSION_RATE_LIMITS.perOrganization],
  ] as const) {
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _bucket: bucket,
      _limit: config.limit,
      _window_seconds: config.windowSeconds,
    });
    if (allowed === false) {
      throw acpError("Prea multe recalculări în ultima oră. Încearcă din nou mai târziu.");
    }
  }
}

/** Lista versiunilor unei analize (root + toate versiunile derivate). */
export const listAcpVersions = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ analysisId: z.string().uuid() }).parse(data))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      rootAnalysisId: string;
      currentId: string;
      currentVersion: number;
      latestVersionId: string;
      versions: AcpVersionListItem[];
    }> => {
      const actor = await loadActor(context as AuthContext);
      const admin = await loadAdmin();
      const current = await loadVersionRow(admin, actor, data.analysisId);
      await assertTargetRunnable(admin, actor, current.property_id);
      const rootId = current.root_analysis_id ?? current.id;
      const rows = await loadRootVersionRows(admin, actor, rootId);
      const names = await creatorNames(
        admin,
        rows.map((r) => r.created_by),
      );
      const versions = rows.map((r) =>
        rowToVersionItem(r, r.created_by ? (names.get(r.created_by) ?? null) : null),
      );
      return {
        rootAnalysisId: rootId,
        currentId: current.id,
        currentVersion: current.version ?? 1,
        latestVersionId: versions[0]?.id ?? current.id,
        versions,
      };
    },
  );

/** Comparație deterministă între două versiuni ale aceleiași analize. */
export const compareAcpVersions = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ versionAId: z.string().uuid(), versionBId: z.string().uuid() })
      .refine((v) => v.versionAId !== v.versionBId, {
        message: "Alege două versiuni diferite.",
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<AcpVersionComparison> => {
    const actor = await loadActor(context as AuthContext);
    const admin = await loadAdmin();
    const [rowA, rowB] = await Promise.all([
      loadVersionRow(admin, actor, data.versionAId),
      loadVersionRow(admin, actor, data.versionBId),
    ]);
    const rootA = rowA.root_analysis_id ?? rowA.id;
    const rootB = rowB.root_analysis_id ?? rowB.id;
    if (rootA !== rootB) {
      throw new Error("Cele două versiuni nu aparțin aceleiași analize.");
    }

    const names = await creatorNames(admin, [rowA.created_by, rowB.created_by]);
    const [snapshotA, snapshotB] = await Promise.all([
      buildVersionSnapshot(
        admin,
        rowA,
        rowA.created_by ? (names.get(rowA.created_by) ?? null) : null,
      ),
      buildVersionSnapshot(
        admin,
        rowB,
        rowB.created_by ? (names.get(rowB.created_by) ?? null) : null,
      ),
    ]);

    await logAcpAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: ACP_AUDIT_ACTIONS.versionsCompared,
      analysisId: rootA,
      details: { versionA: snapshotA.version, versionB: snapshotB.version },
    });

    return compareAcpVersionSnapshots(snapshotA, snapshotB);
  });

/**
 * Inserează rândul noii versiuni. Indexul unic (root_analysis_id, version)
 * garantează la nivel de bază de date că două recalculări simultane nu obțin
 * același număr de versiune; la conflict reîncercăm cu următorul număr.
 */
async function insertNextVersionRow(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
  source: VersionRow,
  rootId: string,
): Promise<{ id: string; version: number }> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data: existing, error: existingError } = await admin
      .from("acp_analyses")
      .select("version")
      .eq("organization_id", actor.organizationId)
      .or(`root_analysis_id.eq.${rootId},id.eq.${rootId}`);
    if (existingError) throw acpDbError("list versions", existingError);
    const version =
      nextVersionNumber((existing ?? []).map((r) => Number(r.version ?? 1))) + attempt;

    const { data: created, error } = await admin
      .from("acp_analyses")
      .insert({
        organization_id: actor.organizationId,
        created_by: actor.userId,
        property_id: source.property_id,
        title: source.title,
        status: "running",
        target_data: source.target_data as never,
        sources: source.sources as never,
        version,
        parent_analysis_id: source.id,
        root_analysis_id: rootId,
      })
      .select("id")
      .single();

    if (!error && created) return { id: created.id, version };
    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") throw acpDbError("insert version", error);
  }
  throw acpError("Nu am putut crea o versiune nouă. Încearcă din nou.");
}

/**
 * „Recalculează cu date actuale": creează o versiune NOUĂ a analizei, folosind
 * aceeași proprietate țintă, aceleași surse și aceleași decizii manuale.
 * Versiunea anterioară rămâne intactă (snapshot istoric).
 */
export const recalculateAcpAsNewVersion = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ analysisId: z.string().uuid() }).parse(data))
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      analysisId: string;
      version: number;
      rootAnalysisId: string;
      ok: boolean;
      errorMessage: string | null;
    }> => {
      const actor = await loadActor(context as AuthContext);
      const admin = await loadAdmin();
      const source = await loadVersionRow(admin, actor, data.analysisId);
      await assertTargetRunnable(admin, actor, source.property_id);
      await enforceVersionRateLimit(admin, actor);

      const rootId = source.root_analysis_id ?? source.id;
      if (!source.root_analysis_id) {
        await admin.from("acp_analyses").update({ root_analysis_id: rootId }).eq("id", source.id);
      }

      const subject = readSubject(source.target_data);
      const sources = (source.sources as Record<string, boolean> | null) ?? {
        own_properties: true,
      };
      const overrides = readOverrides(source.analysis_data);

      const created = await insertNextVersionRow(admin, actor, source, rootId);

      try {
        const { candidates, stats, marketQueryContexts } = await collectCandidates({
          admin,
          actor,
          target: subject,
          targetPropertyId: source.property_id,
          sources,
          engineVersion: ACP_CURRENT_ENGINE_VERSION,
        });
        const calibration = await loadCalibration(admin, actor.organizationId);
        const priceIndex = await loadPriceIndex(admin);
        const result = runAcpAnalysis(subject, candidates, overrides, {
          calibration,
          priceIndex,
          engineVersion: ACP_CURRENT_ENGINE_VERSION,
        });
        await persistRun({
          admin,
          analysisId: created.id,
          organizationId: actor.organizationId,
          actorId: actor.userId,
          target: subject,
          sources,
          overrides,
          stats,
          marketQueryContexts,
          result,
          version: created.version,
          engineVersion: ACP_CURRENT_ENGINE_VERSION,
          history: [
            {
              version: source.version ?? 1,
              estimatedValue: source.estimated_value,
              confidenceScore: source.confidence_score,
              recordedAt: new Date().toISOString(),
            },
          ],
          calibration,
        });
      } catch (error) {
        const errorMessage = acpSafeMessage(error, "Recalcularea nu a putut fi finalizată.");
        await admin
          .from("acp_analyses")
          .update({ status: "draft", error_message: errorMessage })
          .eq("id", created.id);
        await logAcpAudit({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          action: ACP_AUDIT_ACTIONS.versionFailed,
          analysisId: created.id,
          details: { rootAnalysisId: rootId, version: created.version },
        });
        return {
          analysisId: created.id,
          version: created.version,
          rootAnalysisId: rootId,
          ok: false,
          errorMessage,
        };
      }

      await logAcpAudit({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: ACP_AUDIT_ACTIONS.versionCreated,
        analysisId: created.id,
        details: {
          rootAnalysisId: rootId,
          parentAnalysisId: source.id,
          version: created.version,
        },
      });

      return {
        analysisId: created.id,
        version: created.version,
        rootAnalysisId: rootId,
        ok: true,
        errorMessage: null,
      };
    },
  );
