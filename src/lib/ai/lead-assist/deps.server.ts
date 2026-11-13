/** Dependențele reale ale asistentului de lead-uri (model rapid, credite, funcții). */
import type { LeadAiDeps } from "./process.server";

export async function createLeadAiDeps(): Promise<LeadAiDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveAiProvider } = await import("@/lib/ai/providers/registry.server");
  const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
  const { withAiCredits } = await import("@/lib/ai/credits/credits.server");
  const { withAiProviderFallback } = await import("@/lib/ai/providers/fallback.server");
  const primary = resolveAiProvider("fast");
  return {
    db: supabaseAdmin,
    provider: primary
      ? {
          get id() { return primary.id; },
          get model() { return primary.model; },
          supportsTools: false,
          generate: async (req) => (await withAiProviderFallback(primary, (p) => p.generate(req))).result,
        }
      : null,
    isFeatureEnabled: (org) => isAiFeatureEnabled(org, "ai_lead_assist"),
    withCredits: (actor, run, isSuccess) => withAiCredits(actor, "lead_message_analysis", run, { isSuccess }),
  };
}
