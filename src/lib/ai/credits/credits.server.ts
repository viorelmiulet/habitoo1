/**
 * Rezervarea creditelor AI înainte de apelul către provider și restituirea lor
 * la eșec. Atomicitatea este în funcția SQL `ai_credit_reserve` (blochează
 * rândul agenției), deci cereri simultane nu pot depăși bugetul.
 */
import { AiCreditsExhaustedError, parseAiCreditError, textCreditAction, type AiCreditAction } from "./credits";
import type { AiModelClass } from "@/lib/ai/providers/models";
import type { AIProvider } from "@/lib/ai/providers/types";

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type AiCreditActor = { organizationId: string; userId: string };

async function loadAdmin(): Promise<RpcClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as RpcClient;
}

export async function reserveAiCredits(
  actor: AiCreditActor,
  action: AiCreditAction,
  client?: RpcClient,
): Promise<string> {
  const admin = client ?? (await loadAdmin());
  const { data, error } = await admin.rpc("ai_credit_reserve", {
    p_org: actor.organizationId,
    p_user: actor.userId,
    p_action: action,
  });
  if (error) {
    const exhausted = parseAiCreditError(error.message);
    throw new AiCreditsExhaustedError(exhausted ?? "Creditele AI nu au putut fi verificate. Încearcă din nou.");
  }
  return String(data);
}

export async function settleAiCredits(id: string, success: boolean, client?: RpcClient): Promise<void> {
  const admin = client ?? (await loadAdmin());
  await admin.rpc("ai_credit_settle", { p_id: id, p_success: success });
}

export type AiFailureUsageInfo = { provider?: string; model?: string; capability?: string; attempts?: { provider: string; model: string; status: number | string; ms: number }[]; latencyMs?: number };
export type UsageInsertClient = {
  from: (table: "ai_usage_events") => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> };
};

/** Mesaj scurt, fără chei/tokenuri, pentru jurnalul de eșec. */
export function shortAiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return raw
    .replace(/(key|token|bearer|authorization)[=:\s]+\S+/gi, "$1=[redactat]")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redactat]")
    .slice(0, 300);
}

/** Scrie un eveniment `success:false` (best-effort: nu aruncă niciodată). */
export async function recordAiFailureUsage(
  actor: AiCreditActor,
  action: AiCreditAction,
  error: unknown,
  info: AiFailureUsageInfo = {},
  client?: UsageInsertClient,
): Promise<void> {
  try {
    const writer = client ?? ((await loadAdmin()) as unknown as UsageInsertClient);
    const status = (error as { status?: unknown } | null)?.status;
    const { error: insertError } = await writer.from("ai_usage_events").insert({
      organization_id: actor.organizationId,
      user_id: actor.userId,
      provider: info.provider ?? "unknown",
      model: info.model ?? "unknown",
      capability: info.capability ?? action,
      success: false,
      input_tokens: null,
      output_tokens: null,
      tokens_unknown: true,
      latency_ms: info.latencyMs ?? 0,
      tool_calls: 0,
      extra_info: { action, http_status: typeof status === "number" ? status : null, error: shortAiErrorMessage(error), ...(info.attempts ? { attempts: info.attempts } : {}) },
    });
    if (insertError) console.error("[ai] failure usage insert failed", insertError.message);
  } catch (writeError) {
    console.error("[ai] failure usage insert threw", (writeError as Error)?.message ?? "");
  }
}

/**
 * Rulează un apel AI plătit: rezervă, execută, consumă la succes și restituie
 * la eroare (sau când `isSuccess` întoarce false).
 */
export async function withAiCredits<T>(
  actor: AiCreditActor,
  action: AiCreditAction,
  run: () => Promise<T>,
  options: { isSuccess?: (result: T) => boolean; client?: RpcClient; usage?: AiFailureUsageInfo; usageClient?: UsageInsertClient } = {},
): Promise<T> {
  const id = await reserveAiCredits(actor, action, options.client);
  let result: T;
  try {
    result = await run();
  } catch (error) {
    await recordAiFailureUsage(actor, action, error, options.usage, options.usageClient);
    await settleAiCredits(id, false, options.client).catch(() => undefined);
    throw error;
  }
  const success = options.isSuccess ? options.isSuccess(result) : true;
  await settleAiCredits(id, success, options.client).catch(() => undefined);
  return result;
}

/** Mesajul de blocare când luna curentă nu mai are credite, altfel null. */
export async function aiCreditsBlockedMessage(organizationId: string, client?: RpcClient): Promise<string | null> {
  try {
    const admin = client ?? (await loadAdmin());
    const { data, error } = await admin.rpc("ai_credit_usage", { p_org: organizationId });
    if (error || !data) return null;
    const usage = data as { used: number; limit: number; resetOn: string };
    if (usage.used >= usage.limit) {
      const { aiCreditsExhaustedMessage } = await import("./credits");
      return aiCreditsExhaustedMessage(usage.used, usage.limit, usage.resetOn);
    }
    return null;
  } catch {
    return null;
  }
}

/** `withAiProviderFallback` cu credite: un apel AI de text taxat după clasa modelului. */
export async function chargedAiFallback<T>(
  actor: AiCreditActor,
  modelClass: AiModelClass,
  primary: AIProvider,
  run: (provider: AIProvider) => Promise<T>,
): Promise<{ result: T; provider: AIProvider; fallbackUsed: boolean }> {
  const { withAiProviderFallback } = await import("@/lib/ai/providers/fallback.server");
  return withAiCredits(actor, textCreditAction(modelClass), () => withAiProviderFallback(primary, run), {
    usage: { provider: primary.id, model: primary.model },
  });
}
