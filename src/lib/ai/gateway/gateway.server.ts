/**
 * AI GATEWAY — singurul punct prin care aplicația poate solicita AI.
 *
 * Frontend → server function autentificat → AI Gateway → Coordinator (Mastra)
 * → provider (Gemini). Frontendul nu apelează niciodată providerul.
 *
 * Gateway-ul stabilește: utilizator, agenție, permisiuni, context, rate limit,
 * agent, tool-uri; apoi persistă conversația, utilizarea, auditul și trasarea.
 */
import {
  AI_NOT_CONFIGURED,
  AI_NOT_CONFIGURED_MESSAGE,
  emptyAiResponse,
  type AIResponse,
  type AiActor,
  type AiSource,
  type AiToolCallRecord,
} from "./types";
import { buildAiContext, type AiContext } from "../context/builder";
import { buildAiSystemPrompt, buildAiUserPrompt } from "../prompts/system";
import { aiToolDeclarations } from "../tools/registry";
import { AI_AUDIT_ACTIONS, logAiAudit } from "../security/audit";
import { writeAiUsage } from "../usage/tracking.server";
import { AI_RATE_LIMITS, isDuplicateAiRequest, validateAiRequestSize } from "../usage/limits";
import { loadConversationMemory } from "../memory/conversation.server";
import { AiTracer, newTraceId } from "../tracing/trace";
import { writeTraceEvents } from "../tracing/trace.server";
import { runCoordinator, HABITOO_COORDINATOR } from "../agent/coordinator.server";
import type { AiProviderMessage } from "../providers/types";

export type AiChatRequest = {
  conversationId?: string | null;
  message: string;
  /** Focus opțional: proprietatea din care a pornit conversația. */
  propertyId?: string | null;
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof loadAdmin>>;

export type AiQuotaDecision = { allowed: true } | { allowed: false; message: string };

export const AI_RATE_LIMIT_MESSAGE =
  "Ai atins limita de cereri AI. Încearcă din nou în câteva minute.";

type RateLimitClient = {
  rpc: (
    fn: "rate_limit_hit",
    args: { _bucket: string; _limit: number; _window_seconds: number },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Limitele de rată, aplicate „fail closed": orice eroare de bază de date sau
 * rezultat non-boolean refuză cererea, ca o defecțiune să nu dezactiveze
 * limitele.
 */
export async function checkAiRateLimits(
  admin: RateLimitClient,
  actor: AiActor,
  scope: "chat" | "workflow" = "chat",
): Promise<boolean> {
  for (const [bucket, config] of [
    [`ai_${scope}:user:min:${actor.userId}`, AI_RATE_LIMITS.perUserMinute],
    [`ai_${scope}:user:hour:${actor.userId}`, AI_RATE_LIMITS.perUserHour],
    [`ai_${scope}:org:hour:${actor.organizationId}`, AI_RATE_LIMITS.perOrganizationHour],
  ] as const) {
    let allowed: unknown;
    let failure: string | null = null;
    try {
      const result = await admin.rpc("rate_limit_hit", {
        _bucket: bucket,
        _limit: config.limit,
        _window_seconds: config.windowSeconds,
      });
      allowed = result.data;
      failure = result.error?.message ?? null;
    } catch (error) {
      failure = error instanceof Error ? error.message : "unknown";
    }
    if (failure !== null || typeof allowed !== "boolean") {
      console.error("[ai] rate limit check failed closed", bucket, failure);
      return false;
    }
    if (allowed === false) return false;
  }
  return true;
}

type UsageReader = {
  from: (table: "ai_usage_events") => {
    select: (columns: string) => {
      eq: (
        column: "organization_id",
        value: string,
      ) => {
        gte: (
          column: "created_at",
          value: string,
        ) => Promise<{
          data:
            | { input_tokens: number | null; output_tokens: number | null }[]
            | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

/** Consumul agenției pe fereastra glisantă. `null` = nu am putut citi. */
export async function readAiOrgUsage(
  admin: UsageReader,
  organizationId: string,
  now: Date = new Date(),
): Promise<AiOrgUsageSnapshot | null> {
  const since = new Date(now.getTime() - AI_ORG_USAGE_CEILING.windowSeconds * 1000).toISOString();
  try {
    const { data, error } = await admin
      .from("ai_usage_events")
      .select("input_tokens, output_tokens")
      .eq("organization_id", organizationId)
      .gte("created_at", since);
    if (error || !data) return null;
    let tokens = 0;
    let unknownTokenRequests = 0;
    for (const row of data) {
      if (row.input_tokens === null && row.output_tokens === null) unknownTokenRequests += 1;
      tokens += (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    }
    return { requests: data.length, tokens, unknownTokenRequests };
  } catch (error) {
    console.error("[ai] usage ceiling read failed", error);
    return null;
  }
}

/**
 * Poarta unică de consum: limite de rată (fail closed) + plafonul agenției,
 * verificate înainte de orice apel către provider.
 */
export async function checkAiQuota(
  admin: RateLimitClient & UsageReader,
  actor: AiActor,
  scope: "chat" | "workflow" = "chat",
): Promise<AiQuotaDecision> {
  if (!(await checkAiRateLimits(admin, actor, scope))) {
    return { allowed: false, message: AI_RATE_LIMIT_MESSAGE };
  }
  const usage = await readAiOrgUsage(admin, actor.organizationId);
  if (usage === null) return { allowed: true };
  const ceiling = evaluateAiOrgCeiling(usage);
  if (ceiling.exceeded) return { allowed: false, message: ceiling.message };
  return { allowed: true };
}


/** Conversația curentă, creată dacă lipsește. Mereu legată de user + agenție. */
async function ensureConversation(
  admin: Admin,
  actor: AiActor,
  conversationId: string | null | undefined,
  title: string,
): Promise<string | null> {
  if (conversationId) {
    const { data } = await admin
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("organization_id", actor.organizationId)
      .eq("user_id", actor.userId)
      .maybeSingle();
    if (data?.id) return data.id;
    return null;
  }
  const { data, error } = await admin
    .from("ai_conversations")
    .insert({
      organization_id: actor.organizationId,
      user_id: actor.userId,
      title: title.slice(0, 120),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[ai] conversation insert failed", error.message);
    return null;
  }
  return data.id;
}

/** Contextul de start: doar proprietatea de focus, dacă a fost cerută explicit. */
export async function buildRequestContext(
  admin: Admin,
  actor: AiActor,
  propertyId: string | null | undefined,
): Promise<AiContext> {
  let property: Record<string, unknown> | null = null;
  if (propertyId) {
    const { executeAiTool } = await import("../tools/executors.server");
    const result = await executeAiTool(actor, "get_property", { propertyId });
    if (result.ok) property = result.data as Record<string, unknown>;
  }
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", actor.organizationId)
    .maybeSingle();
  return buildAiContext({ organizationName: org?.name ?? null, property });
}

function confidenceOf(toolCalls: AiToolCallRecord[], sources: AiSource[]): AIResponse["confidence"] {
  if (sources.length > 0 && toolCalls.some((call) => call.ok)) return "high";
  if (toolCalls.length > 0) return "medium";
  return "low";
}

/** Rulează o cerere de chat prin gateway. */
export async function runAiChat(actor: AiActor, request: AiChatRequest): Promise<AIResponse> {
  const started = Date.now();
  const tracer = new AiTracer(newTraceId(), {
    organizationId: actor.organizationId,
    userId: actor.userId,
  });
  tracer.record("agent", HABITOO_COORDINATOR, { details: { capability: "chat" } });

  const { resolveAiProvider } = await import("../providers/registry.server");
  const provider = resolveAiProvider();
  if (!provider) {
    const response = emptyAiResponse("not_configured", AI_NOT_CONFIGURED_MESSAGE);
    return { ...response, warnings: [AI_NOT_CONFIGURED] };
  }

  const validation = validateAiRequestSize(request.message);
  if (!validation.ok) return emptyAiResponse("failed", validation.message);
  const message = validation.message;

  const admin = await loadAdmin();

  if (!(await checkAiRateLimits(admin, actor, "chat"))) {
    return emptyAiResponse(
      "rate_limited",
      "Ai atins limita de cereri AI. Încearcă din nou în câteva minute.",
    );
  }

  const conversationId = await ensureConversation(admin, actor, request.conversationId, message);
  if (!conversationId) {
    return emptyAiResponse("failed", "Conversația nu a fost găsită. Începe o conversație nouă.");
  }

  const history = await loadConversationMemory(admin as never, actor, conversationId);

  // Anti dublu-click: același mesaj în fereastra scurtă → răspunsul deja dat.
  const lastUser = [...history].reverse().find((row) => row.role === "user") ?? null;
  if (isDuplicateAiRequest(lastUser, message)) {
    const lastAssistant = [...history].reverse().find((row) => row.role === "assistant");
    if (lastAssistant) {
      return {
        ...emptyAiResponse("ok"),
        answer: lastAssistant.content,
        conversationId,
        provider: provider.id,
        model: provider.model,
        warnings: ["Cerere duplicată: am reafișat răspunsul anterior."],
        confidence: "medium",
      };
    }
  }

  const context = await tracer.span("step", "build_context", () =>
    buildRequestContext(admin, actor, request.propertyId),
  );
  const declarations = aiToolDeclarations();
  const system = buildAiSystemPrompt(declarations);

  const messages: AiProviderMessage[] = [];
  for (const row of history) {
    if (row.role === "user") messages.push({ role: "user", content: row.content });
    else if (row.role === "assistant") messages.push({ role: "assistant", content: row.content });
  }
  messages.push({ role: "user", content: buildAiUserPrompt(context, message) });

  const outcome = await runCoordinator({
    actor,
    provider,
    system,
    messages,
    declarations,
    tracer,
    conversationId,
  });

  const { toolCalls, sources, warnings, inputTokens, outputTokens } = outcome;
  const answer = outcome.answer;
  const latencyMs = Date.now() - started;
  const success = outcome.failure === null && answer.trim() !== "";

  await writeAiUsage(admin as never, {
    organization_id: actor.organizationId,
    user_id: actor.userId,
    provider: provider.id,
    model: provider.model,
    capability: "chat",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: latencyMs,
    success,
    tool_calls: toolCalls.length,
  });

  await logAiAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: success ? AI_AUDIT_ACTIONS.chatRequest : AI_AUDIT_ACTIONS.chatFailed,
    conversationId,
    details: {
      provider: provider.id,
      model: provider.model,
      capability: "chat",
      latencyMs,
      traceId: tracer.traceId,
      toolCalls: toolCalls.map((call) => call.name),
      success,
    },
  });

  tracer.record("agent", `${HABITOO_COORDINATOR}.done`, {
    status: success ? "ok" : "failed",
    latencyMs,
    details: { tools: toolCalls.length },
  });
  await writeTraceEvents(tracer.list());

  if (!success) {
    const safeMessage =
      outcome.failure ?? "Serviciul AI nu a putut genera un răspuns. Încearcă din nou.";
    await admin.from("ai_messages").insert([
      {
        conversation_id: conversationId,
        organization_id: actor.organizationId,
        user_id: actor.userId,
        role: "user",
        content: message,
      },
    ]);
    return {
      ...emptyAiResponse("failed", safeMessage),
      conversationId,
      provider: provider.id,
      model: provider.model,
      toolCalls,
      warnings,
    };
  }

  const contextUsed = context.categories;
  const uniqueSources = sources.filter(
    (source, index) => sources.findIndex((s) => s.id === source.id) === index,
  );

  await admin.from("ai_messages").insert([
    {
      conversation_id: conversationId,
      organization_id: actor.organizationId,
      user_id: actor.userId,
      role: "user",
      content: message,
    },
    {
      conversation_id: conversationId,
      organization_id: actor.organizationId,
      user_id: actor.userId,
      role: "assistant",
      content: answer,
      provider: provider.id,
      model: provider.model,
      tool_calls: toolCalls as never,
      context_used: contextUsed as never,
      sources: uniqueSources as never,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
    },
  ]);

  await admin
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("organization_id", actor.organizationId);

  return {
    status: "ok",
    answer,
    toolCalls,
    contextUsed,
    sources: uniqueSources,
    suggestions: [],
    warnings,
    confidence: confidenceOf(toolCalls, uniqueSources),
    conversationId,
    provider: provider.id,
    model: provider.model,
    usage: { inputTokens, outputTokens, latencyMs },
  };
}
