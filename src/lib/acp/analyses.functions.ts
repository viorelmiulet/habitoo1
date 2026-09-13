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
import { marketListingToSubject, propertyToSubject } from "./adapters";
import { runAcpAnalysis, targetPricePerSqm, type AcpCandidate, type AcpManualOverride } from "./engine";
import type { AcpSubject } from "./scoring";
import type { AcpComparableResult } from "./engine";
import { ACP_AUDIT_ACTIONS, logAcpAudit } from "./audit";
import { dedupeMarketCandidates } from "@/lib/market/acp";
import { marketSourceName } from "@/lib/market/sources";

const MEDIA_BUCKET = "property-media";

/** Statusuri de proprietate care pot servi ca dovadă de piață. */
const CANDIDATE_STATUSES = ["active", "reserved", "negotiation", "sold", "rented"] as const;

const PROPERTY_COLUMNS =
  "id,organization_id,title,reference,property_type,transaction_kind,status,city,county,district,lat,lng,rooms,usable_surface,surface,floor,building_floors,build_year,finish_state,parking,parking_spaces,balcony,furnishing,price,currency";

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
}): Promise<{ candidates: AcpCandidate[]; stats: SourceStat[] }> {
  const { admin, actor, target, targetPropertyId, sources } = params;
  const candidates: AcpCandidate[] = [];
  const stats: SourceStat[] = [];

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
    if (error) throw error;
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
      if (error) throw error;
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
    if (error) throw error;
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
      });
    }
    stats.push({
      sourceType: "portal",
      sourceName: ACP_SOURCE_TYPE_LABELS.portal,
      itemsFound: deduped.length,
    });
  }


  return { candidates, stats };
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
  history: unknown[];
}) {
  const { admin, analysisId, result } = params;

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
      } as never,
    }));
    const { error } = await admin.from("acp_comparables").insert(rows);
    if (error) throw error;
  }

  await admin.from("acp_analysis_sources").delete().eq("analysis_id", analysisId);
  if (params.stats.length > 0) {
    const usedBySource = new Map<AcpSourceType, number>();
    for (const c of result.comparables) {
      if (!c.isSelected) continue;
      usedBySource.set(c.sourceType, (usedBySource.get(c.sourceType) ?? 0) + 1);
    }
    const { error } = await admin.from("acp_analysis_sources").insert(
      params.stats.map((s) => ({
        analysis_id: analysisId,
        source_type: s.sourceType,
        source_name: s.sourceName,
        enabled: true,
        items_found: s.itemsFound,
        items_used: usedBySource.get(s.sourceType) ?? 0,
        items_excluded: Math.max(0, s.itemsFound - (usedBySource.get(s.sourceType) ?? 0)),
      })),
    );
    if (error) throw error;
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
      history: params.history as never,
      last_run_at: new Date().toISOString(),
      analysis_data: {
        statistics: result.statistics,
        estimate: result.estimate,
        confidence: result.confidence,
        explanation: result.explanation,
        overrides: params.overrides,
        candidatesFound: result.candidatesFound,
        targetPricePerSqm: targetPricePerSqm(params.target),
      } as never,
    })
    .eq("id", analysisId);
  if (updateError) throw updateError;
}

const createSchema = z.object({
  propertyId: z.string().uuid(),
  title: z.string().trim().max(200).optional(),
  sources: z.record(z.string(), z.boolean()).default({ own_properties: true }),
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
    if (propertyError) throw propertyError;
    if (!property) throw new Error("Proprietatea analizată nu a fost găsită în agenția ta.");

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
    if (insertError) throw insertError;

    try {
      const { candidates, stats } = await collectCandidates({
        admin,
        actor,
        target: subject,
        targetPropertyId: row.id,
        sources: data.sources,
      });
      const result = runAcpAnalysis(subject, candidates, {});
      await persistRun({
        admin,
        analysisId: created.id,
        organizationId: actor.organizationId,
        actorId: actor.userId,
        target: subject,
        sources: data.sources,
        overrides: {},
        stats,
        result,
        version: 1,
        history: [],
      });
    } catch (error) {
      await admin
        .from("acp_analyses")
        .update({
          status: "draft",
          error_message: error instanceof Error ? error.message : "Eroare necunoscută",
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
  if (error) throw error;
  if (!data) throw new Error("Analiza nu a fost găsită în agenția ta.");
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
  if (!subject) throw new Error("Analiza nu conține datele proprietății analizate.");
  return subject;
}

async function recalculate(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  actor: Actor,
  analysisId: string,
  overridesInput?: Record<string, AcpManualOverride>,
) {
  const analysis = await loadAnalysis(admin, actor, analysisId);
  const subject = readSubject(analysis.target_data);
  const sources = (analysis.sources as Record<string, boolean> | null) ?? {
    own_properties: true,
  };
  const overrides = overridesInput ?? readOverrides(analysis.analysis_data);

  await admin.from("acp_analyses").update({ status: "running" }).eq("id", analysisId);

  try {
    const { candidates, stats } = await collectCandidates({
      admin,
      actor,
      target: subject,
      targetPropertyId: analysis.property_id,
      sources,
    });
    const result = runAcpAnalysis(subject, candidates, overrides);
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
      result,
      version: (analysis.version ?? 1) + 1,
      history,
    });
  } catch (error) {
    await admin
      .from("acp_analyses")
      .update({
        status: "completed",
        error_message: error instanceof Error ? error.message : "Eroare necunoscută",
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
  }[];
  statistics: ReturnType<typeof runAcpAnalysis>["statistics"] | null;
  estimate: ReturnType<typeof runAcpAnalysis>["estimate"] | null;
  confidence: ReturnType<typeof runAcpAnalysis>["confidence"] | null;
  explanation: string[];
  comparables: AcpComparableView[];
  aiConfigured: boolean;
  ai: {
    provider: string | null;
    model: string | null;
    generatedAt: string | null;
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
      .select("source_type,source_name,items_found,items_used,items_excluded")
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
    };
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
      })),
      statistics: analysisData.statistics ?? null,
      estimate: analysisData.estimate ?? null,
      confidence: analysisData.confidence ?? null,
      explanation: analysisData.explanation ?? [],
      comparables: (comparables ?? []).map((c) => {
        const snapshot = (c.snapshot ?? {}) as {
          key?: string;
          title?: string;
          locationLabel?: string | null;
          url?: string | null;
          subject?: AcpSubject;
          skippedAdjustments?: string[];
        };
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
          subject: snapshot.subject ?? {},
          similarityScore: Number(c.similarity_score ?? 0),
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
        };
      }),
    };
  });
