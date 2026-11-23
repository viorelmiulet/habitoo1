import type { AIProvider } from "../providers/types";
import { safeAiProviderMessage } from "../providers/types";
import { AI_DISABLED_MESSAGE, isAiFeatureEnabled } from "../features/features.server";

export async function assertClientAiEnabled(organizationId: string) {
  if (!(await isAiFeatureEnabled(organizationId, "ai_crm"))) throw new Error(AI_DISABLED_MESSAGE);
}
export function clientAiError(error: unknown): string {
  return error instanceof Error && (error.message === AI_DISABLED_MESSAGE || error.message === "Fișa nu este disponibilă." || error.message.includes("Gemini nu este configurat")) ? error.message : safeAiProviderMessage(error);
}
export async function paidClientAnalysis<T>(organizationId: string, userId: string, capability: string, run: (provider: AIProvider) => Promise<{ value: T | null; usage: { inputTokens: number | null; outputTokens: number | null } }>): Promise<T | null> {
  await assertClientAiEnabled(organizationId);
  const { resolveAiProvider } = await import("../providers/registry.server");
  const { withAiCredits } = await import("../credits/credits.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { writeAiUsage } = await import("../usage/tracking.server");
  const provider = resolveAiProvider("standard");
  if (!provider || provider.id !== "gemini") throw new Error("Gemini nu este configurat.");
  const start = Date.now();
  return withAiCredits({ organizationId, userId }, "text_standard", async () => {
    const { withAiProviderFallback } = await import("../providers/fallback.server");
    const completed = await withAiProviderFallback(provider, run);
    const result = completed.result;
    const used = completed.provider;
    await writeAiUsage({ from: () => ({ insert: async row => await supabaseAdmin.from("ai_usage_events").insert({ ...row, extra_info: JSON.parse(JSON.stringify(row.extra_info ?? {})) as import("@/integrations/supabase/types").Json }) }) }, { organization_id: organizationId, user_id: userId, provider: used.id, model: used.model, fallback_used: completed.fallbackUsed, capability, input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens, success: result.value !== null, latency_ms: Date.now() - start, tool_calls: 0 });
    return result.value;
  }, { isSuccess: result => result !== null, usage: { provider: provider.id, model: provider.model, capability } });
}