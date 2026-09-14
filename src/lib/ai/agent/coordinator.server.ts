/**
 * Habitoo AI Coordinator.
 *
 * Rolul agentului: înțelege cererea, decide dacă are nevoie de un tool, cere
 * execuția lui și produce un răspuns structurat. Agentul NU decide dacă are
 * dreptul la date: fiecare cerere de tool trece prin `authorizeAiTool` înainte
 * de execuție, iar tool-urile rulează pe runtime-ul Mastra cu actorul verificat
 * capturat în closure.
 *
 * Agentul nu cunoaște providerul: primește un `AIProvider` gata construit, deci
 * Gemini poate fi înlocuit cu OpenAI sau Anthropic fără modificări aici.
 */
import type { AIProvider, AiProviderMessage, AiToolDeclaration } from "../providers/types";
import { safeAiProviderMessage } from "../providers/types";
import type { AiActor, AiSource, AiToolCallRecord } from "../gateway/types";
import { authorizeAiTool } from "../security/permissions";
import { aiToolCapability } from "../tools/registry";
import { buildMastraTools, MASTRA_RUNTIME, type HabitooMastraTool } from "../tools/mastra.server";
import { AI_AUDIT_ACTIONS, logAiAudit } from "../security/audit";
import { AI_MAX_TOOL_CALLS, AI_MAX_TOOL_STEPS } from "../usage/limits";
import { withRetry } from "../reliability/retry";
import type { AiTracer } from "../tracing/trace";

export const HABITOO_COORDINATOR = "habitooCoordinator" as const;
export const HABITOO_COORDINATOR_RUNTIME = MASTRA_RUNTIME;

export type CoordinatorRun = {
  actor: AiActor;
  provider: AIProvider;
  system: string;
  messages: AiProviderMessage[];
  declarations: AiToolDeclaration[];
  tracer: AiTracer;
  conversationId?: string | null;
  tools?: Record<string, HabitooMastraTool>;
  maxSteps?: number;
  maxToolCalls?: number;
};

export type CoordinatorResult = {
  answer: string;
  toolCalls: AiToolCallRecord[];
  sources: AiSource[];
  warnings: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  /** Mesaj sigur pentru utilizator când agentul nu a putut răspunde. */
  failure: string | null;
};

function summarize(execution: { ok: boolean; summary?: string; error?: string }): string {
  return execution.ok ? (execution.summary ?? "rezultat") : (execution.error ?? "eroare");
}

/** Rulează bucla agentului: model → tool-uri autorizate → model → răspuns. */
export async function runCoordinator(run: CoordinatorRun): Promise<CoordinatorResult> {
  const {
    actor,
    provider,
    system,
    declarations,
    tracer,
    conversationId = null,
    maxSteps = AI_MAX_TOOL_STEPS,
    maxToolCalls = AI_MAX_TOOL_CALLS,
  } = run;
  const messages = [...run.messages];
  const tools = run.tools ?? buildMastraTools(actor);

  const toolCalls: AiToolCallRecord[] = [];
  const sources: AiSource[] = [];
  const warnings: string[] = [];
  let answer = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      const modelStart = Date.now();
      // Reîncercare doar pentru erori tranzitorii de provider (fără efecte secundare).
      const result = await withRetry(
        () => provider.generate({ system, messages, tools: declarations }),
        {
          onRetry: (attempt) =>
            tracer.record("model", `${provider.id}.retry`, {
              status: "failed",
              details: { attempt: attempt.attempt, reason: attempt.reason },
            }),
        },
      );
      tracer.record("model", `${provider.id}:${provider.model}`, {
        latencyMs: Date.now() - modelStart,
        details: { step, toolCalls: result.toolCalls.length },
      });
      inputTokens = result.inputTokens ?? inputTokens;
      outputTokens = result.outputTokens ?? outputTokens;

      if (result.toolCalls.length === 0) {
        answer = result.text;
        break;
      }

      for (const call of result.toolCalls) {
        if (toolCalls.length >= maxToolCalls) {
          warnings.push("Am oprit căutările suplimentare pentru a limita costul.");
          break;
        }
        // Habitoo decide, nu modelul.
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
          tracer.record("tool", call.name, {
            status: "failed",
            details: { denied: authorization.reason },
          });
          messages.push({
            role: "assistant_tool_call",
            toolName: call.name,
            arguments: call.arguments,
            signature: call.signature ?? null,
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
          summary: summarize(execution),
          ...(execution.ok ? {} : { error: execution.code }),
        });
        tracer.record("tool", call.name, {
          status: execution.ok ? "ok" : "failed",
          latencyMs: durationMs,
          details: { summary: summarize(execution) },
        });
        if (execution.ok) sources.push(...execution.sources);

        messages.push({
          role: "assistant_tool_call",
          toolName: call.name,
          arguments: call.arguments,
          signature: call.signature ?? null,
        });
        messages.push({
          role: "tool_result",
          toolName: call.name,
          content: JSON.stringify(
            execution.ok
              ? { ok: true, data: execution.data }
              : { ok: false, error: execution.error },
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

      if (step === maxSteps - 1 && answer === "") {
        warnings.push("Am limitat numărul de pași pentru această cerere.");
      }
    }
  } catch (error) {
    tracer.record("error", HABITOO_COORDINATOR, {
      status: "failed",
      details: { stage: "model" },
    });
    return {
      answer: "",
      toolCalls,
      sources,
      warnings,
      inputTokens,
      outputTokens,
      failure: safeAiProviderMessage(error),
    };
  }

  return { answer, toolCalls, sources, warnings, inputTokens, outputTokens, failure: null };
}
