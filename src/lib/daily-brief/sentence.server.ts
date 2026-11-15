import { maybeAiSentence, type BriefCounts } from "./brief";

export async function generateDailySentence(organizationId: string, userId: string, counts: BriefCounts): Promise<string | null> {
  const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
  const { aiCreditsBlockedMessage, withAiCredits } = await import("@/lib/ai/credits/credits.server");
  return maybeAiSentence({
    featureEnabled: () => isAiFeatureEnabled(organizationId, "ai_daily_brief"),
    creditsBlocked: () => aiCreditsBlockedMessage(organizationId),
    generate: () => withAiCredits({ organizationId, userId }, "text_fast", async () => {
      const { resolveAiProvider } = await import("@/lib/ai/providers/registry.server");
      const { withAiProviderFallback } = await import("@/lib/ai/providers/fallback.server");
      const provider = resolveAiProvider("fast");
      if (!provider) throw new Error("AI indisponibil");
      const started = Date.now();
      const r = await withAiProviderFallback(provider, p => p.generate({
        system: "Scrie o singură propoziție scurtă în română pentru ziua agentului imobiliar. Folosește exclusiv numărătorile primite. Prioritizează restanțele și lead-urile nerăspunse. Nu inventa cifre, nume sau activități. Fără markdown. Răspunde numai cu propoziția.",
        messages: [{ role: "user", content: JSON.stringify(counts) }], tools: [], maxOutputTokens: 200,
      }));
      const text = r.result.text.trim().replace(/\s+/g, " ");
      const allowed = new Set(Object.values(counts).map(String));
      const valid = !!text && text.length <= 300 && !(text.match(/\d+/g) ?? []).some(n => !allowed.has(n));
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("ai_usage_events").insert({ organization_id: organizationId, user_id: userId, provider: r.provider.id, model: r.provider.model, capability: "ai_daily_brief", input_tokens: r.result.inputTokens, output_tokens: r.result.outputTokens, tokens_unknown: r.result.inputTokens === null && r.result.outputTokens === null, latency_ms: Date.now() - started, success: valid, fallback_used: r.fallbackUsed, tool_calls: 0 });
      if (!valid) throw new Error("Rezumat invalid");
      return text;
    }),
  });
}