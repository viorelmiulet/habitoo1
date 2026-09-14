/**
 * AI GATEWAY — singurul punct prin care aplicația poate solicita AI.
 *
 * Frontendul nu apelează niciodată Gemini: trimite un mesaj către server
 * functions, iar acestea intră aici. Gateway-ul:
 *  1. verifică providerul (altfel „AI nu este configurat.");
 *  2. validează dimensiunea cererii și aplică rate limiting + anti-dublu-click;
 *  3. construiește contextul minim necesar;
 *  4. rulează bucla de tool calling prin runtime-ul Mastra, cu autorizare
 *     Habitoo înaintea fiecărei execuții;
 *  5. persistă conversația, mesajele, utilizarea și auditul;
 *  6. returnează un `AIResponse` urmăribil.
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
import { buildMastraTools } from "../tools/mastra.server";
import { authorizeAiTool } from "../security/permissions";
import { aiToolCapability } from "../tools/registry";
import { AI_AUDIT_ACTIONS, logAiAudit } from "../security/audit";
import { writeAiUsage } from "../usage/tracking.server";
import {
  AI_HISTORY_MESSAGES,
  AI_MAX_TOOL_CALLS,
  AI_MAX_TOOL_STEPS,
  AI_RATE_LIMITS,
  isDuplicateAiRequest,
  validateAiRequestSize,
} from "../usage/limits";
import { safeAiProviderMessage, type AiProviderMessage } from "../providers/types";

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

async function checkRateLimits(admin: Admin, actor: AiActor): Promise<boolean> {
  for (const [bucket, config] of [
    [`ai_chat:user:min:${actor.userId}`, AI_RATE_LIMITS.perUserMinute],
    [`ai_chat:user:hour:${actor.userId}`, AI_RATE_LIMITS.perUserHour],
    [`ai_chat:org:hour:${actor.organizationId}`, AI_RATE_LIMITS.perOrganizationHour],
  ] as const) {
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _bucket: bucket,
      _limit: config.limit,
      _window_seconds: config.windowSeconds,
    });
    if (allowed === false) return false;
  }
  return true;
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

async function loadHistory(
  admin: Admin,
  actor: AiActor,
  conversationId: string,
): Promise<{ role: string; content: string; createdAt: string }[]> {
  const { data } = await admin
    .from("ai_messages")
    .select("role,content,created_at")
    .eq("conversation_id", conversationId)
    .eq("organization_id", actor.organizationId)
    .order("created_at", { ascending: false })
    .limit(AI_HISTORY_MESSAGES);
  return (data ?? [])
    .reverse()
    .map((row) => ({ role: row.role, content: row.content, createdAt: row.created_at }));
}

/** Contextul de start: doar proprietatea de focus, dacă a fost cerută explicit. */
async function buildRequestContext(
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

function summarizeToolResult(result: {
  ok: boolean;
  data?: unknown;
  error?: string;
  summary?: string;
}): string {
  return result.ok ? (result.summary ?? "rezultat") : (result.error ?? "eroare");
}

function confidenceOf(toolCalls: AiToolCallRecord[], sources: AiSource[]): AIResponse["confidence"] {
  if (sources.length > 0 && toolCalls.some((call) => call.ok)) return "high";
  if (toolCalls.length > 0) return "medium";
  return "low";
}

/** Rulează o cerere de chat prin gateway. */
export async function runAiChat(actor: AiActor, request: AiChatRequest): Promise<AIResponse> {
  const started = Date.now();

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

  if (!(await checkRateLimits(admin, actor))) {
    return emptyAiResponse(
      "rate_limited",
      "Ai atins limita de cereri AI. Încearcă din nou în câteva minute.",
    );
  }

  const conversationId = await ensureConversation(admin, actor, request.conversationId, message);
  if (!conversationId) {
    return emptyAiResponse("failed", "Conversația nu a fost găsită. Începe o conversație nouă.");
  }

  const history = await loadHistory(admin, actor, conversationId);

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

  const context = await buildRequestContext(admin, actor, request.propertyId);
  const declarations = aiToolDeclarations();
  const system = buildAiSystemPrompt(declarations);
  const tools = buildMastraTools(actor);

  const messages: AiProviderMessage[] = [];
  for (const row of history) {
    if (row.role === "user") messages.push({ role: "user", content: row.content });
    else if (row.role === "assistant") messages.push({ role: "assistant", content: row.content });
  }
  messages.push({ role: "user", content: buildAiUserPrompt(context, message) });

  const toolCalls: AiToolCallRecord[] = [];
  const sources: AiSource[] = [];
  const warnings: string[] = [];
  let answer = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let failure: string | null = null;

  try {
    for (let step = 0; step < AI_MAX_TOOL_STEPS; step += 1) {
      const result = await provider.generate({ system, messages, tools: declarations });
      inputTokens = result.inputTokens ?? inputTokens;
      outputTokens = result.outputTokens ?? outputTokens;

      if (result.toolCalls.length === 0) {
        answer = result.text;
        break;
      }

      for (const call of result.toolCalls) {
        if (toolCalls.length >= AI_MAX_TOOL_CALLS) {
          warnings.push("Am oprit căutările suplimentare pentru a limita costul.");
          break;
        }
        // Habitoo decide, nu modelul: autorizare înainte de execuție.
        const authorization = authorizeAiTool(actor, call.name, aiToolCapability);
        const toolStart = Date.now();
        if (!authorization.allowed) {
          toolCalls.push({
            name: call.name,
            arguments: JSON.stringify(call.arguments),
            ok: false,
            durationMs: Date.now() - toolStart,
            summary: authorization.message,
            error: authorization.reason,
          });
          messages.push({
            role: "assistant_tool_call",
            toolName: call.name,
            arguments: call.arguments,
          });
          messages.push({
            role: "tool_result",
            toolName: call.name,
            content: JSON.stringify({ ok: false, error: authorization.message }),
          });
          await logAiAudit({
            organizationId: actor.organizationId,
            actorId: actor.userId,
            action: AI_AUDIT_ACTIONS.toolDenied,
            conversationId,
            details: { tool: call.name, reason: authorization.reason },
          });
          continue;
        }

        const runner = tools[call.name];
        const execution = runner
          ? await runner.execute(call.arguments)
          : ({ ok: false, error: "Instrumentul cerut nu există.", code: "denied" } as const);
        const durationMs = Date.now() - toolStart;

        toolCalls.push({
          name: call.name,
          arguments: JSON.stringify(call.arguments),
          ok: execution.ok,
          durationMs,
          summary: summarizeToolResult(execution),
          ...(execution.ok ? {} : { error: execution.code }),
        });
        if (execution.ok) sources.push(...execution.sources);

        messages.push({
          role: "assistant_tool_call",
          toolName: call.name,
          arguments: call.arguments,
        });
        messages.push({
          role: "tool_result",
          toolName: call.name,
          content: JSON.stringify(
            execution.ok ? { ok: true, data: execution.data } : { ok: false, error: execution.error },
          ).slice(0, 12_000),
        });

        await logAiAudit({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          action: AI_AUDIT_ACTIONS.toolExecuted,
          conversationId,
          details: { tool: call.name, ok: execution.ok, durationMs },
        });
      }

      if (step === AI_MAX_TOOL_STEPS - 1 && answer === "") {
        warnings.push("Am limitat numărul de pași pentru această cerere.");
      }
    }
  } catch (error) {
    failure = safeAiProviderMessage(error);
  }

  const latencyMs = Date.now() - started;
  const success = failure === null && answer.trim() !== "";

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
      toolCalls: toolCalls.map((call) => call.name),
      success,
    },
  });

  if (!success) {
    const safeMessage =
      failure ?? "Serviciul AI nu a putut genera un răspuns. Încearcă din nou.";
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
