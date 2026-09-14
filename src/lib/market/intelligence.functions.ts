/**
 * Server functions pentru Market Intelligence (ACP Stage 4).
 *
 * Toate agregările rulează server-side, cu validare Zod, autentificare și
 * izolare pe agenție pentru analizele ACP. Pool-ul de piață este comun, dar
 * analiza (target, comparabile, estimare) aparține unei singure agenții.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { AcpSubject } from "@/lib/acp/scoring";
import {
  buildAcpMarketInsights,
  marketFiltersFromSubject,
  type AcpMarketInsights,
  type MarketIntelligenceFilters,
} from "./intelligence";
import { computeMarketIntelligence, type MarketIntelligenceResult } from "./intelligence.server";

/** Citirile agregate sunt ieftine, dar nu nelimitate. */
export const MARKET_INTELLIGENCE_RATE_LIMITS = {
  perUser: { limit: 240, windowSeconds: 3600 },
} as const;

type AuthContext = { userId: string };

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadOrganizationId(context: AuthContext): Promise<string> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!data?.organization_id) {
    throw new Error("Datele de piață sunt disponibile doar utilizatorilor unei agenții.");
  }
  return data.organization_id;
}

async function enforceRateLimit(userId: string) {
  const admin = await loadAdmin();
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    _bucket: `market_intelligence:user:${userId}`,
    _limit: MARKET_INTELLIGENCE_RATE_LIMITS.perUser.limit,
    _window_seconds: MARKET_INTELLIGENCE_RATE_LIMITS.perUser.windowSeconds,
  });
  if (allowed === false) {
    throw new Error("Prea multe interogări de piață în ultima oră. Încearcă din nou mai târziu.");
  }
}

const nullableNumber = z.number().finite().nullable().optional();

export const marketFiltersSchema = z.object({
  city: z.string().trim().max(120).nullable().optional(),
  county: z.string().trim().max(120).nullable().optional(),
  area: z.string().trim().max(160).nullable().optional(),
  propertyType: z.string().trim().max(60).nullable().optional(),
  transactionType: z.string().trim().max(60).nullable().optional(),
  roomsMin: nullableNumber,
  roomsMax: nullableNumber,
  areaMin: nullableNumber,
  areaMax: nullableNumber,
  priceMin: nullableNumber,
  priceMax: nullableNumber,
  pricePerSqmMin: nullableNumber,
  pricePerSqmMax: nullableNumber,
  sources: z.array(z.string().trim().max(60)).max(20).nullable().optional(),
  status: z.enum(["active", "inactive", "archived", "all"]).nullable().optional(),
  seenWithinDays: z.number().int().min(1).max(730).nullable().optional(),
});

/** Piața globală, cu filtrele alese de utilizator (Centrul de date de piață). */
export const getMarketIntelligence = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        filters: marketFiltersSchema.optional(),
        includeTrend: z.boolean().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }): Promise<MarketIntelligenceResult> => {
    await loadOrganizationId(context as AuthContext);
    await enforceRateLimit((context as AuthContext).userId);
    const admin = await loadAdmin();
    const filters = (data.filters ?? { status: "active" }) as MarketIntelligenceFilters;
    return computeMarketIntelligence(admin, filters, { includeTrend: data.includeTrend !== false });
  });

export type AcpMarketIntelligence = {
  analysisId: string;
  analysisVersion: number;
  /** Filtrele efective (derivate din proprietate + suprascrierile utilizatorului). */
  filters: MarketIntelligenceFilters;
  live: MarketIntelligenceResult;
  insights: AcpMarketInsights;
  /**
   * Statisticile de piață salvate la momentul rulării versiunii. Un raport
   * istoric folosește acest snapshot, nu datele live.
   */
  snapshot: {
    capturedAt: string | null;
    filters: MarketIntelligenceFilters | null;
    aggregate: MarketIntelligenceResult["aggregate"] | null;
    insights: AcpMarketInsights | null;
  } | null;
};

/** Market Intelligence pentru o versiune ACP concretă, cu poziționare. */
export const getAcpMarketIntelligence = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        analysisId: z.string().uuid(),
        filters: marketFiltersSchema.optional(),
        includeTrend: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<AcpMarketIntelligence> => {
    const organizationId = await loadOrganizationId(context as AuthContext);
    await enforceRateLimit((context as AuthContext).userId);
    const admin = await loadAdmin();

    const { data: analysis, error } = await admin
      .from("acp_analyses")
      .select(
        "id,organization_id,version,target_data,analysis_data,estimated_value,recommended_listing_price",
      )
      .eq("id", data.analysisId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!analysis) throw new Error("Analiza nu a fost găsită în agenția ta.");

    const targetData = (analysis.target_data ?? {}) as { subject?: AcpSubject };
    const subject = targetData.subject ?? {};
    const analysisData = (analysis.analysis_data ?? {}) as {
      targetPricePerSqm?: number | null;
      marketIntelligence?: AcpMarketIntelligence["snapshot"];
    };

    const filters = marketFiltersFromSubject(
      subject,
      (data.filters ?? {}) as MarketIntelligenceFilters,
    );
    const live = await computeMarketIntelligence(admin, filters, {
      includeTrend: data.includeTrend !== false,
    });

    const { data: comparables } = await admin
      .from("acp_comparables")
      .select("is_selected,is_outlier")
      .eq("analysis_id", analysis.id);

    const insights = buildAcpMarketInsights({
      aggregate: live.aggregate,
      samplePricePerSqm: live.samplePricePerSqm,
      targetPricePerSqm: analysisData.targetPricePerSqm ?? subject.pricePerSqm ?? null,
      estimatedValue: analysis.estimated_value,
      recommendedListingPrice: analysis.recommended_listing_price,
      usableArea: subject.usableArea ?? null,
      comparables: (comparables ?? []).map((c) => ({
        isSelected: Boolean(c.is_selected),
        isOutlier: Boolean(c.is_outlier),
      })),
    });

    return {
      analysisId: analysis.id,
      analysisVersion: analysis.version ?? 1,
      filters,
      live,
      insights,
      snapshot: analysisData.marketIntelligence ?? null,
    };
  });
