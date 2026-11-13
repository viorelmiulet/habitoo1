import type { DraftDeps } from "./draft.server";

export async function createDraftDeps(): Promise<DraftDeps> {
  const { resolveAiProvider } = await import("@/lib/ai/providers/registry.server");
  const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
  const { withAiCredits, aiCreditsBlockedMessage } = await import("@/lib/ai/credits/credits.server");
  const { withAiProviderFallback } = await import("@/lib/ai/providers/fallback.server");
  const primary = resolveAiProvider("fast");
  return {
    provider: primary ? { generate: async (req) => (await withAiProviderFallback(primary, (p) => p.generate(req))).result } : null,
    isFeatureEnabled: (org) => isAiFeatureEnabled(org, "ai_active_matching"),
    creditsBlocked: (org) => aiCreditsBlockedMessage(org),
    withCredits: (actor, run, isSuccess) => withAiCredits(actor, "match_message", run, { isSuccess }),
  };
}
