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
      const r = await withAiProviderFallback(provider, p => p.generate({
        system: "Scrie o singură propoziție scurtă în română pentru ziua agentului imobiliar. Folosește exclusiv numărătorile primite. Prioritizează restanțele și lead-urile nerăspunse. Nu inventa cifre, nume sau activități. Fără markdown. Răspunde numai cu propoziția.",
        messages: [{ role: "user", content: JSON.stringify(counts) }], tools: [], maxOutputTokens: 200,
      }));
      const text = r.result.text.trim().replace(/\s+/g, " ");
      const allowed = new Set(Object.values(counts).map(String));
      if (!text || text.length > 300 || (text.match(/\d+/g) ?? []).some(n => !allowed.has(n))) throw new Error("Rezumat invalid");
      return text;
    }),
  });
}