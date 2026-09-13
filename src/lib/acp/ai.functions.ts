/**
 * Server functions pentru analistul AI al modulului ACP (faza 2).
 *
 * Regula centrală: clientul trimite doar `analysisId`. Serverul reconstruiește
 * contextul din baza de date (motorul determinist rămâne sursa unică de adevăr
 * pentru cifre), apelează providerul AI server-side, validează schema
 * răspunsului și salvează exclusiv rezultatul validat.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { ACP_AUDIT_ACTIONS, logAcpAudit } from "./audit";
import { buildAcpAiContext, type AcpAiContextInput } from "./ai/context";
import { parseAcpAiInsight, type AcpAiInsight } from "./ai/schema";


/** Limite de generare: pe utilizator și pe agenție, pe oră. */
export const ACP_AI_RATE_LIMITS = {
  perUser: { limit: 10, windowSeconds: 3600 },
  perOrganization: { limit: 40, windowSeconds: 3600 },
} as const;

export type AcpAiGenerateResult =
  | { status: "ok"; insight: AcpAiInsight; model: string; generatedAt: string }
  | { status: "unavailable"; message: string }
  | { status: "rate_limited"; message: string }
  | { status: "failed"; message: string };

type AuthContext = { userId: string };

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Starea providerului AI, ca UI-ul să poată explica lipsa configurării. */
export const getAcpAiStatus = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async (): Promise<{ configured: boolean }> => {
    const { isAcpAiConfigured } = await import("./ai/provider.server");
    return { configured: isAcpAiConfigured() };
  });

export const generateAcpAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ analysisId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<AcpAiGenerateResult> => {
    const userId = (context as AuthContext).userId;
    const admin = await loadAdmin();

    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    const organizationId = profile?.organization_id ?? null;
    if (!organizationId) {
      throw new Error("Analiza comparativă este disponibilă doar utilizatorilor unei agenții.");
    }

    // RLS/multi-tenancy: analiza trebuie să aparțină agenției utilizatorului.
    const { data: analysis, error } = await admin
      .from("acp_analyses")
      .select("id,organization_id,status,target_data,analysis_data")
      .eq("id", data.analysisId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!analysis) throw new Error("Analiza nu a fost găsită în agenția ta.");

    const { resolveAcpAiProvider, safeAiErrorMessage } = await import("./ai/provider.server");
    const provider = resolveAcpAiProvider();
    if (!provider) {
      return {
        status: "unavailable",
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

    const analysisData = (analysis.analysis_data ?? {}) as Record<string, unknown> & {
      statistics?: AcpAiContextInput["statistics"];
      estimate?: AcpAiContextInput["estimate"];
      confidence?: AcpAiContextInput["confidence"];
      explanation?: string[];
      targetPricePerSqm?: number | null;
    };
    const targetData = (analysis.target_data ?? {}) as {
      title?: string;
      locationLabel?: string | null;
      subject?: AcpAiContextInput["target"]["subject"];
    };

    const aiContext = buildAcpAiContext({
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

    let raw: string;
    try {
      raw = await provider.generate(aiContext);
    } catch (providerError) {
      const message = safeAiErrorMessage(providerError);
      await logAcpAudit({
        organizationId,
        actorId: userId,
        action: ACP_AUDIT_ACTIONS.aiGenerated,
        analysisId: data.analysisId,
        details: { provider: provider.id, model: provider.model, success: false, reason: "provider_error" },
      });
      return { status: "failed", message };
    }

    const parsed = parseAcpAiInsight(raw);
    if (!parsed.ok) {
      await logAcpAudit({
        organizationId,
        actorId: userId,
        action: ACP_AUDIT_ACTIONS.aiGenerated,
        analysisId: data.analysisId,
        details: { provider: provider.id, model: provider.model, success: false, reason: parsed.reason },
      });
      return {
        status: "failed",
        message: "Răspunsul AI nu a respectat formatul așteptat, așa că nu a fost salvat.",
      };
    }

    const generatedAt = new Date().toISOString();
    // Cifrele motorului rămân neatinse: salvăm interpretarea într-o cheie separată.
    const { error: updateError } = await admin
      .from("acp_analyses")
      .update({
        ai_summary: parsed.insight.executive_summary,
        ai_model: provider.model,
        ai_generated_at: generatedAt,
        analysis_data: {
          ...analysisData,
          ai: {
            provider: provider.id,
            model: provider.model,
            generatedAt,
            insight: parsed.insight,
          },
        } as never,
      })
      .eq("id", data.analysisId)
      .eq("organization_id", organizationId);
    if (updateError) throw updateError;

    await logAcpAudit({
      organizationId,
      actorId: userId,
      action: ACP_AUDIT_ACTIONS.aiGenerated,
      analysisId: data.analysisId,
      details: {
        provider: provider.id,
        model: provider.model,
        success: true,
        comparablesUsed: aiContext.comparablesUsed,
      },
    });

    return { status: "ok", insight: parsed.insight, model: provider.model, generatedAt };
  });
