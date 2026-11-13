/** Rezervă creditele, rulează modelul (cu rezerva existentă) și restituie la eșec. */
import { withAiCredits, type AiCreditActor } from "@/lib/ai/credits/credits.server";
import { withAiProviderFallback } from "@/lib/ai/providers/fallback.server";
import type { AIProvider } from "@/lib/ai/providers/types";
import { runListingAutofill, type AutofillInput, type AutofillResult } from "./autofill.server";

type CreditClient = NonNullable<Parameters<typeof withAiCredits>[3]>["client"];

export async function executeListingAutofill(
  actor: AiCreditActor,
  provider: AIProvider,
  input: AutofillInput,
  options: { client?: CreditClient; recordUsage?: boolean } = {},
): Promise<AutofillResult> {
  const started = Date.now();
  let used: AIProvider = provider;
  let fallbackUsed = false;
  let success = false;
  let usage: { input: number | null; output: number | null } | undefined;
  try {
    const result = await withAiCredits(actor, "listing_autofill", async () => {
      const run = await withAiProviderFallback(provider, (p) => runListingAutofill(p, input));
      used = run.provider;
      fallbackUsed = run.fallbackUsed;
      usage = run.result.usage;
      return run.result;
    }, { isSuccess: (r) => r.ok, client: options.client });
    success = result.ok;
    return result.ok ? { ok: true, proposal: result.proposal } : { ok: false, message: result.message };
  } finally {
    if (options.recordUsage !== false) {
      void (async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { writeAiUsage } = await import("@/lib/ai/usage/tracking.server");
        await writeAiUsage(supabaseAdmin as never, {
          organization_id: actor.organizationId, user_id: actor.userId, provider: used.id, model: used.model,
          capability: "listing_autofill", input_tokens: usage?.input ?? null, output_tokens: usage?.output ?? null,
          latency_ms: Date.now() - started, success, tool_calls: 0, fallback_used: fallbackUsed,
        });
      })().catch(() => undefined);
    }
  }
}
