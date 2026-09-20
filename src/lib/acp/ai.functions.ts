/**
 * Server functions pentru analistul AI al modulului ACP (Stage 5).
 *
 * Reguli centrale:
 * - clientul trimite doar `analysisId`; serverul reconstruiește contextul din
 *   baza de date, deci motorul determinist rămâne sursa unică de adevăr;
 * - contextul este legat de versiunea ACP și de snapshot-ul acelei versiuni,
 *   nu de datele de piață curente;
 * - providerul este apelat exclusiv server-side, iar răspunsul este validat cu
 *   Zod înainte de a fi salvat;
 * - fiecare generare (reușită sau eșuată) este auditată și păstrată în istoric,
 *   fără să suprascrie rezultatul anterior.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { aiFeatureDisabledMessage } from "@/lib/ai/features/keys";
import { ACP_AUDIT_ACTIONS, logAcpAudit } from "./audit";
import { buildAcpAiContext, type AcpAiContextInput } from "./ai/context";
import {
  ACP_AI_SCHEMA_VERSION,
  parseAcpAiInsight,
  readStoredAcpAiInsight,
  type AcpAiInsight,
  type AcpAiInsightRecord,
} from "./ai/schema";
import type { AcpReportMarketInput } from "./report/model";

/** Limite de generare: pe utilizator și pe agenție, pe oră. */
export const ACP_AI_RATE_LIMITS = {
  perUser: { limit: 10, windowSeconds: 3600 },
  perOrganization: { limit: 40, windowSeconds: 3600 },
} as const;

/** Cod stabil pentru lipsa configurării providerului. */
export const AI_NOT_CONFIGURED = "AI_NOT_CONFIGURED" as const;

export type AcpAiGenerateResult =
  | {
      status: "ok";
      insight: AcpAiInsight;
      provider: string;
      model: string;
      generatedAt: string;
      promptVersion: string;
      schemaVersion: string;
      analysisVersion: number;
      snapshotAt: string | null;
    }
  | { status: "not_configured"; code: typeof AI_NOT_CONFIGURED; message: string }
  | { status: "rate_limited"; message: string }
  | { status: "failed"; message: string };

type AuthContext = { userId: string };

type AnalysisData = Record<string, unknown> & {
  statistics?: AcpAiContextInput["statistics"];
  estimate?: AcpAiContextInput["estimate"];
  confidence?: AcpAiContextInput["confidence"];
  explanation?: string[];
  targetPricePerSqm?: number | null;
  marketIntelligence?: AcpReportMarketInput | null;
  ai?: Record<string, unknown> | null;
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Organizația utilizatorului curent; fără ea, modulul ACP nu este disponibil. */
async function loadOrganizationId(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  userId: string,
): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  const organizationId = profile?.organization_id ?? null;
  if (!organizationId) {
    throw new Error("Analiza comparativă este disponibilă doar utilizatorilor unei agenții.");
  }
  return organizationId;
}

/** Starea providerului AI, ca UI-ul să poată explica lipsa configurării. */
export const getAcpAiStatus = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(
    async ({
      context,
    }): Promise<{ configured: boolean; code?: typeof AI_NOT_CONFIGURED }> => {
      const admin = await loadAdmin();
      const organizationId = await loadOrganizationId(admin, (context as AuthContext).userId);
      const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
      if (!(await isAiFeatureEnabled(organizationId, "acp_ai"))) {
        return { configured: false, code: AI_NOT_CONFIGURED };
      }
      const { isAcpAiConfigured } = await import("./ai/provider.server");
      const configured = isAcpAiConfigured();
      return configured ? { configured } : { configured, code: AI_NOT_CONFIGURED };
    },
  );

/** Istoricul interpretărilor AI ale unei versiuni ACP (regenerările se păstrează). */
export const listAcpAiInsights = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ analysisId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<AcpAiInsightRecord[]> => {
    const userId = (context as AuthContext).userId;
    const admin = await loadAdmin();
    const organizationId = await loadOrganizationId(admin, userId);

    const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
    if (!(await isAiFeatureEnabled(organizationId, "acp_ai"))) return [];

    const { data: rows, error } = await admin
      .from("acp_ai_insights")
      .select(
        "id,provider,model,prompt_version,schema_version,analysis_version,snapshot_at,insight,status,created_at",
      )
      .eq("analysis_id", data.analysisId)
      .eq("organization_id", organizationId)
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const records: AcpAiInsightRecord[] = [];
    for (const row of rows ?? []) {
      const stored = readStoredAcpAiInsight(row.insight);
      if (!stored) continue;
      records.push({
        id: row.id,
        insight: stored.insight,
        provider: row.provider,
        model: row.model,
        generatedAt: row.created_at,
        promptVersion: row.prompt_version,
        schemaVersion: row.schema_version,
        analysisVersion: row.analysis_version ?? null,
        snapshotAt: row.snapshot_at,
        legacy: stored.legacy,
      });
    }
    return records;
  });

export const generateAcpAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ analysisId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<AcpAiGenerateResult> => {
    const userId = (context as AuthContext).userId;
    const admin = await loadAdmin();
    const organizationId = await loadOrganizationId(admin, userId);

    const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
    if (!(await isAiFeatureEnabled(organizationId, "acp_ai"))) {
      return { status: "failed", message: aiFeatureDisabledMessage("acp_ai") };
    }

    // RLS/multi-tenancy: analiza trebuie să aparțină agenției utilizatorului.
    const { data: analysis, error } = await admin
      .from("acp_analyses")
      .select(
        "id,organization_id,status,version,root_analysis_id,snapshot_at,last_run_at,target_data,analysis_data",
      )
      .eq("id", data.analysisId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!analysis) throw new Error("Analiza nu a fost găsită în agenția ta.");

    const { resolveAcpAiProvider, safeAiErrorMessage } = await import("./ai/provider.server");
    const provider = resolveAcpAiProvider();
    if (!provider) {
      return {
        status: "not_configured",
        code: AI_NOT_CONFIGURED,
        message: "Analiza AI indisponibilă — configurează providerul.",
      };
    }

    // Rate limit rezonabil: pe utilizator și pe agenție.
    for (const [bucket, config] of [
      [`acp_ai:user:${userId}`, ACP_AI_RATE_LIMITS.perUser],
      [`acp_ai:org:${organizationId}`, ACP_AI_RATE_LIMITS.perOrganization],
    ] as const) {
      const { data: allowed } = await admin.rpc("rate_limit_hit", {
        _bucket: bucket,
        _limit: config.limit,
        _window_seconds: config.windowSeconds,
      });
      if (allowed === false) {
        return {
          status: "rate_limited",
          message: "Ai atins limita de generări AI pentru această oră. Încearcă mai târziu.",
        };
      }
    }

    const { data: comparables } = await admin
      .from("acp_comparables")
      .select(
        "source_type,source_name,similarity_score,component_scores,tier,adjustment_percent,adjusted_price,adjusted_price_per_sqm,is_selected,is_outlier,outlier_reason,snapshot",
      )
      .eq("analysis_id", data.analysisId)
      .order("similarity_score", { ascending: false });

    const { data: sourceRows } = await admin
      .from("acp_analysis_sources")
      .select("source_type,source_name,items_found,items_used,items_excluded")
      .eq("analysis_id", data.analysisId);

    const analysisData = (analysis.analysis_data ?? {}) as AnalysisData;
    const targetData = (analysis.target_data ?? {}) as {
      title?: string;
      locationLabel?: string | null;
      subject?: AcpAiContextInput["target"]["subject"];
    };

    const analysisVersion = analysis.version ?? 1;
    // Snapshot-ul versiunii, nu momentul generării: o versiune istorică
    // rămâne interpretată pe datele ei, nu pe piața de azi.
    const snapshotAt = analysis.snapshot_at ?? analysis.last_run_at ?? null;

    const aiContext = buildAcpAiContext({
      acpVersion: analysisVersion,
      snapshotAt,
      target: {
        title: targetData.title ?? null,
        locationLabel: targetData.locationLabel ?? null,
        subject: targetData.subject ?? {},
        pricePerSqm: analysisData.targetPricePerSqm ?? null,
      },
      statistics: analysisData.statistics ?? null,
      estimate: analysisData.estimate ?? null,
      confidence: analysisData.confidence ?? null,
      explanation: analysisData.explanation ?? [],
      // Market Intelligence exclusiv din snapshot-ul versiunii (Stage 4).
      market: analysisData.marketIntelligence ?? null,
      comparables: (comparables ?? []).map((c) => {
        const snapshot = (c.snapshot ?? {}) as {
          title?: string;
          locationLabel?: string | null;
          subject?: AcpAiContextInput["target"]["subject"];
        };
        return {
          title: snapshot.title ?? null,
          sourceType: c.source_type,
          sourceName: c.source_name,
          locationLabel: snapshot.locationLabel ?? null,
          subject: snapshot.subject ?? {},
          similarityScore: Number(c.similarity_score ?? 0),
          components: (c.component_scores ?? null) as Record<string, number> | null,
          tier: c.tier ?? "excluded",
          adjustmentPercent: c.adjustment_percent,
          adjustedPrice: c.adjusted_price,
          adjustedPricePerSqm: c.adjusted_price_per_sqm,
          isSelected: Boolean(c.is_selected),
          isOutlier: Boolean(c.is_outlier),
          outlierReason: c.outlier_reason,
        };
      }),
      sourceStats: (sourceRows ?? []).map((s) => ({
        sourceType: s.source_type,
        sourceName: s.source_name ?? s.source_type,
        itemsFound: s.items_found ?? 0,
        itemsUsed: s.items_used ?? 0,
        itemsExcluded: s.items_excluded ?? 0,
      })),
    });

    const inputSummary = {
      contextVersion: aiContext.contextVersion,
      comparablesTotal: aiContext.comparablesTotal,
      comparablesUsed: aiContext.comparablesUsed,
      outliers: aiContext.outliersCount,
      marketSnapshot: aiContext.market !== null,
      sources: aiContext.sources.length,
    };

    /** Istoric + audit pentru un eșec, fără scurgeri de secrete. */
    const recordFailure = async (reason: string, message: string): Promise<AcpAiGenerateResult> => {
      await admin.from("acp_ai_insights").insert({
        organization_id: organizationId,
        analysis_id: analysis.id,
        root_analysis_id: analysis.root_analysis_id ?? analysis.id,
        analysis_version: analysisVersion,
        snapshot_at: snapshotAt,
        status: "failed",
        provider: provider.id,
        model: provider.model,
        prompt_version: provider.promptVersion,
        schema_version: ACP_AI_SCHEMA_VERSION,
        insight: null,
        input_summary: inputSummary as never,
        error_reason: reason,
        created_by: userId,
      });
      await logAcpAudit({
        organizationId,
        actorId: userId,
        action: ACP_AUDIT_ACTIONS.aiGenerated,
        analysisId: analysis.id,
        details: {
          provider: provider.id,
          model: provider.model,
          promptVersion: provider.promptVersion,
          analysisVersion,
          success: false,
          reason,
        },
      });
      return { status: "failed", message };
    };

    let raw: string;
    try {
      raw = await provider.generate(aiContext);
    } catch (providerError) {
      return await recordFailure("provider_error", safeAiErrorMessage(providerError));
    }

    const parsed = parseAcpAiInsight(raw);
    if (!parsed.ok) {
      return await recordFailure(
        parsed.reason,
        "Răspunsul AI nu a respectat formatul așteptat, așa că nu a fost salvat.",
      );
    }

    const generatedAt = new Date().toISOString();

    // Istoricul: fiecare regenerare adaugă un rând nou, nu suprascrie nimic.
    const { data: inserted, error: insertError } = await admin
      .from("acp_ai_insights")
      .insert({
        organization_id: organizationId,
        analysis_id: analysis.id,
        root_analysis_id: analysis.root_analysis_id ?? analysis.id,
        analysis_version: analysisVersion,
        snapshot_at: snapshotAt,
        status: "ok",
        provider: provider.id,
        model: provider.model,
        prompt_version: provider.promptVersion,
        schema_version: ACP_AI_SCHEMA_VERSION,
        insight: parsed.insight as never,
        input_summary: inputSummary as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    // Cifrele motorului rămân neatinse: interpretarea trăiește într-o cheie separată.
    const { error: updateError } = await admin
      .from("acp_analyses")
      .update({
        ai_summary: parsed.insight.executive_summary,
        ai_model: provider.model,
        ai_generated_at: generatedAt,
        analysis_data: {
          ...analysisData,
          ai: {
            insightId: inserted.id,
            provider: provider.id,
            model: provider.model,
            generatedAt,
            promptVersion: provider.promptVersion,
            schemaVersion: ACP_AI_SCHEMA_VERSION,
            analysisVersion,
            snapshotAt,
            insight: parsed.insight,
          },
        } as never,
      })
      .eq("id", analysis.id)
      .eq("organization_id", organizationId);
    if (updateError) throw updateError;

    await logAcpAudit({
      organizationId,
      actorId: userId,
      action: ACP_AUDIT_ACTIONS.aiGenerated,
      analysisId: analysis.id,
      details: {
        provider: provider.id,
        model: provider.model,
        promptVersion: provider.promptVersion,
        analysisVersion,
        snapshotAt,
        success: true,
        comparablesUsed: aiContext.comparablesUsed,
        marketSnapshot: aiContext.market !== null,
      },
    });

    return {
      status: "ok",
      insight: parsed.insight,
      provider: provider.id,
      model: provider.model,
      generatedAt,
      promptVersion: provider.promptVersion,
      schemaVersion: ACP_AI_SCHEMA_VERSION,
      analysisVersion,
      snapshotAt,
    };
  });
