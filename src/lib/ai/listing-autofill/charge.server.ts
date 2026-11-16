/** Rezervă creditele, rulează modelul (cu rezerva existentă) și restituie la eșec. */
import {
  recordAiFailureUsage,
  withAiCredits,
  type AiCreditActor,
  type AiFailureUsageInfo,
  type UsageInsertClient,
} from "@/lib/ai/credits/credits.server";
import { shouldUseAiFallback } from "@/lib/ai/providers/fallback.server";
import { mistralSupportsImages } from "@/lib/ai/providers/mistral.server";
import type { AIProvider } from "@/lib/ai/providers/types";
import { runListingAutofill, type AutofillInput, type AutofillResult } from "./autofill.server";

type CreditClient = NonNullable<Parameters<typeof withAiCredits>[3]>["client"];

export function providerAcceptsImages(provider: AIProvider): boolean {
  if (provider.supportsImages !== undefined) return provider.supportsImages;
  return provider.id === "mistral" ? mistralSupportsImages(provider.model) : true;
}

/** Rezerva fără suport de imagini primește doar textul (descrierea agentului). */
export function inputForProvider(provider: AIProvider, input: AutofillInput): AutofillInput {
  return providerAcceptsImages(provider) ? input : { images: [], audio: null, text: input.text, context: input.context };
}

export async function executeListingAutofill(
  actor: AiCreditActor,
  provider: AIProvider,
  input: AutofillInput,
  options: { client?: CreditClient; usageClient?: UsageInsertClient; recordUsage?: boolean } = {},
): Promise<AutofillResult> {
  const started = Date.now();
  let used: AIProvider = provider;
  let fallbackUsed = false;
  let usage: { input: number | null; output: number | null } | undefined;
  // Citit de withAiCredits abia la eșec: reflectă providerul și modelul reale.
  const info: AiFailureUsageInfo = { provider: provider.id, model: provider.model, capability: "listing_autofill" };
  const track = (p: AIProvider) => {
    used = p;
    info.provider = p.id;
    info.model = p.model;
  };
  const attempt = async (p: AIProvider) => {
    track(p);
    try {
      return await runListingAutofill(p, inputForProvider(p, input));
    } finally {
      track(p); // modelul lazy e cunoscut abia după apel
    }
  };

  const result = await withAiCredits(actor, "listing_autofill", async () => {
    try {
      const r = await attempt(provider);
      usage = r.usage;
      return r;
    } catch (error) {
      if (!shouldUseAiFallback(error) || !provider.fallback) throw error;
      console.error(`[ai] listing_autofill: ${provider.id}/${provider.model} a eșuat, încerc rezerva`);
      fallbackUsed = true;
      const r = await attempt(provider.fallback);
      usage = r.usage;
      return r;
    }
  }, { isSuccess: (r) => r.ok, client: options.client, usage: info, usageClient: options.usageClient });

  if (options.recordUsage !== false) {
    if (!result.ok) {
      // Fără excepție, dar răspuns invalid: se jurnalizează cu motivul.
      await recordAiFailureUsage(actor, "listing_autofill", new Error(`Răspuns invalid: ${result.message}`), info, options.usageClient);
    } else {
      try {
        const writer = options.usageClient ?? ((await import("@/integrations/supabase/client.server")).supabaseAdmin as never);
        const { writeAiUsage } = await import("@/lib/ai/usage/tracking.server");
        await writeAiUsage(writer as never, {
          organization_id: actor.organizationId, user_id: actor.userId, provider: used.id, model: used.model,
          capability: "listing_autofill", input_tokens: usage?.input ?? null, output_tokens: usage?.output ?? null,
          latency_ms: Date.now() - started, success: true, tool_calls: 0, fallback_used: fallbackUsed,
        });
      } catch {
        /* best-effort */
      }
    }
  }
  return result.ok ? { ok: true, proposal: result.proposal } : { ok: false, message: result.message };
}
