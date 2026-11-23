/** Dependențele reale ale asistentului de lead-uri (model rapid, credite, funcții). */
import type { LeadAiDeps } from "./process.server";

export async function createLeadAiDeps(): Promise<LeadAiDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveAiProvider } = await import("@/lib/ai/providers/registry.server");
  const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
  const { withAiCredits } = await import("@/lib/ai/credits/credits.server");
  const { withAiProviderFallback } = await import("@/lib/ai/providers/fallback.server");
  const primary = resolveAiProvider("fast");
  let usedProvider = primary;
  return {
    db: supabaseAdmin,
    provider: primary
      ? {
          get id() { return primary.id; },
          get model() { return primary.model; },
          supportsTools: false,
          generate: async (req) => { const result = await withAiProviderFallback(primary, (p) => p.generate(req)); usedProvider = result.provider; return result.result; },
        }
      : null,
    isFeatureEnabled: (org) => isAiFeatureEnabled(org, "ai_lead_assist"),
    withCredits: (actor, run, isSuccess) => withAiCredits(actor, "lead_message_analysis", run, { isSuccess }),
    recordUsage: async (actor, usage) => {
      await supabaseAdmin.from("ai_usage_events").insert({ organization_id: actor.organizationId, user_id: actor.userId,
        provider: usedProvider?.id ?? "unknown", model: usedProvider?.model ?? "unknown", capability: "lead_message_analysis",
        success: usage.success, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, tokens_unknown: usage.inputTokens === null,
        latency_ms: 0, tool_calls: 0 });
    },
  };
}
