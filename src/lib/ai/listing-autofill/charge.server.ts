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
import { AiProviderError, type AIProvider } from "@/lib/ai/providers/types";
import { resolveAutofillReserve } from "@/lib/ai/providers/registry.server";
import { buildAutofillRequest, runListingAutofill, type AutofillInput, type AutofillResult } from "./autofill.server";
import { AUTOFILL_INVALID_MESSAGE } from "./schema";

export const AUTOFILL_OVERLOADED_MESSAGE = "AI-ul este momentan supraîncărcat. Încearcă din nou peste un minut.";
export function autofillFailureMessage(error: unknown): string {
  return error instanceof AiProviderError && (error.status === 503 || error.status === 504)
    ? AUTOFILL_OVERLOADED_MESSAGE : AUTOFILL_INVALID_MESSAGE;
}

type CreditClient = NonNullable<Parameters<typeof withAiCredits>[3]>["client"];

export function providerAcceptsImages(provider: AIProvider): boolean {
  if (provider.supportsImages !== undefined) return provider.supportsImages;
  return provider.id === "mistral" ? mistralSupportsImages(provider.model) : true;
}

/** Rezerva fără suport de imagini primește doar textul (descrierea agentului). */
export function inputForProvider(provider: AIProvider, input: AutofillInput): AutofillInput {
  return providerAcceptsImages(provider) ? input : { ...input, images: [] };
}

export async function executeListingAutofill(
  actor: AiCreditActor,
  provider: AIProvider,
  input: AutofillInput,
  options: { client?: CreditClient; usageClient?: UsageInsertClient; recordUsage?: boolean; primaryTimeoutMs?: number; fallbackTimeoutMs?: number; fallbackDelayMs?: number; resolveReserve?: typeof resolveAutofillReserve } = {},
): Promise<AutofillResult> {
  const started = Date.now();
  let used: AIProvider = provider;
  let fallbackUsed = false;
  let usage: { input: number | null; output: number | null } | undefined;
  // Citit de withAiCredits abia la eșec: reflectă providerul și modelul reale.
  const attempts: NonNullable<AiFailureUsageInfo["attempts"]> = [];
  const info: AiFailureUsageInfo = { provider: provider.id, model: provider.model, capability: "listing_autofill", attempts };
  const track = (p: AIProvider) => {
    used = p;
    info.provider = p.id;
    info.model = p.model;
  };
  const attempt = async (p: AIProvider, timeoutMs: number) => {
    track(p);
    const attemptStarted = Date.now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let status: number | string = "error";
    const actualInput = inputForProvider(p, input);
    const request = buildAutofillRequest(actualInput);
    const metadata = { photos: actualInput.images.length, prompt_chars: request.system.length + request.messages.reduce((n, m) => n + m.content.length, 0), image_base64_chars: actualInput.images.reduce((n, i) => n + i.base64.length, 0), maxOutputTokens: request.maxOutputTokens };
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new AiProviderError("Serviciul AI nu a răspuns în timp util.", 504, true));
          controller.abort();
        }, timeoutMs);
      });
      const result = await Promise.race([runListingAutofill(p, actualInput, { signal: controller.signal, timeoutMs }), deadline]);
      status = result.ok ? 200 : "invalid";
      return result;
    } catch (error) {
      status = error instanceof AiProviderError ? error.status ?? "network" : "error";
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      track(p); // modelul lazy e cunoscut abia după apel
      const entry = { provider: p.id, model: p.model, status, ms: Date.now() - attemptStarted };
      attempts.push(entry);
      info.latencyMs = Date.now() - started;
      console.info("[ai_listing_autofill] attempt", JSON.stringify({ ...entry, ...metadata }));
    }
  };

  const result = await withAiCredits(actor, "listing_autofill", async () => {
    try {
      const r = await attempt(provider, options.primaryTimeoutMs ?? 15_000);
      usage = r.usage;
      return r;
    } catch (error) {
      if (!shouldUseAiFallback(error)) throw error;
      const reserve = (options.resolveReserve ?? resolveAutofillReserve)(provider);
      if (!reserve) throw error;
      // Never replay immediately; one reserve attempt, no same-model retry.
      await new Promise((resolve) => setTimeout(resolve, options.fallbackDelayMs ?? 500));
      console.error(`[ai] listing_autofill: ${provider.id}/${provider.model} a eșuat, încerc rezerva`);
      fallbackUsed = true;
      const r = await attempt(reserve, options.fallbackTimeoutMs ?? 8_000);
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
          extra_info: { attempts },
        });
      } catch {
        /* best-effort */
      }
    }
  }
  return result.ok ? { ok: true, proposal: result.proposal } : { ok: false, message: result.message };
}
