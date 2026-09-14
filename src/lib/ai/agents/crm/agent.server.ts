/**
 * CRM Agent — bucla de agent (Stage 14).
 *
 * Frontend → server function autentificat → AI Gateway → Mastra (Coordinator)
 * → CRM Agent → Tool Registry → executori server-side → Supabase.
 *
 * Agentul primește un `AIProvider` gata construit (Gemini azi, alt provider
 * mâine) și lucrează numai cu tool-urile CRM de CITIRE. Acțiunile nu se execută
 * aici: sunt propuse și așteaptă aprobarea umană.
 */
import type { AIProvider, AiProviderMessage, AiToolDeclaration } from "../../providers/types";
import { safeAiProviderMessage } from "../../providers/types";
import type { AiActor } from "../../gateway/types";
import { AI_TOOLS } from "../../tools/registry";
import { buildMastraTools } from "../../tools/mastra.server";
import { runCoordinator, type CoordinatorResult } from "../../agent/coordinator.server";
import type { AiTracer } from "../../tracing/trace";
import { withRetry } from "../../reliability/retry";
import { buildCrmSystemPrompt, buildCrmUserPrompt, HABITOO_CRM_AGENT } from "./instructions";
import { validateCrmAction, type CrmActionTool } from "./actions";
import type { AiContext } from "../../context/builder";

export { HABITOO_CRM_AGENT };

/** Doar tool-urile CRM: agentul este specializat, nu generalist. */
export function crmReadDeclarations(): AiToolDeclaration[] {
  return AI_TOOLS.filter((tool) => tool.category === "crm" && tool.kind === "read").map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export function crmActionDeclarations(): AiToolDeclaration[] {
  return AI_TOOLS.filter((tool) => tool.category === "crm" && tool.kind === "action").map(
    (tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }),
  );
}

/** Tool-urile executabile de agent: exclusiv citiri CRM. */
function crmReadTools(actor: AiActor) {
  const all = buildMastraTools(actor);
  const allowed = new Set(
    AI_TOOLS.filter((tool) => tool.category === "crm" && tool.kind === "read").map(
      (tool) => tool.name as string,
    ),
  );
  const out: typeof all = {};
  for (const [name, tool] of Object.entries(all)) {
    if (allowed.has(name)) out[name] = tool;
  }
  return out;
}

export type CrmTurnInput = {
  actor: AiActor;
  provider: AIProvider;
  context: AiContext;
  filters: Record<string, unknown>;
  question: string;
  history: AiProviderMessage[];
  tracer: AiTracer;
  conversationId?: string | null;
};

/** Răspunsul agentului la o întrebare CRM (numai citiri). */
export async function runCrmAgent(input: CrmTurnInput): Promise<CoordinatorResult> {
  const declarations = crmReadDeclarations();
  const system = buildCrmSystemPrompt(declarations);
  const messages: AiProviderMessage[] = [
    ...input.history,
    { role: "user", content: buildCrmUserPrompt(input.context, input.question, input.filters) },
  ];
  input.tracer.record("agent", HABITOO_CRM_AGENT, { details: { capability: "crm_chat" } });
  return runCoordinator({
    actor: input.actor,
    provider: input.provider,
    system,
    messages,
    declarations,
    tracer: input.tracer,
    conversationId: input.conversationId ?? null,
    tools: crmReadTools(input.actor),
  });
}

const ACTION_INTENT =
  /(cre(e|ea)z[ăa]?|creaz[ăa]|adaug[ăa]?|planific[ăa]?|programeaz[ăa]?|seteaz[ăa]?|schimb[ăa]?|mut[ăa]?|treci|marcheaz[ăa]?|aloc[ăa]?|atribuie|repartizeaz[ăa]?|noteaz[ăa]?|(înregistrează|inregistreaza))/i;

/** `true` doar când utilizatorul cere explicit o modificare în CRM. */
export function requestsCrmAction(question: string): boolean {
  return ACTION_INTENT.test(question);
}

export type CrmActionRequest = {
  tool: CrmActionTool;
  data: Record<string, unknown>;
};

/**
 * Cere modelului să PROPUNĂ o singură acțiune. Tool-urile de acțiune nu sunt
 * executabile în acest pas: răspunsul modelului este doar o intenție, validată
 * apoi cu Zod și transformată în propunere de către server.
 */
export async function proposeCrmAction(input: {
  actor: AiActor;
  provider: AIProvider;
  context: AiContext;
  question: string;
  readSummary: string;
  tracer: AiTracer;
}): Promise<{ ok: true; request: CrmActionRequest } | { ok: false; message: string }> {
  const declarations = crmActionDeclarations();
  const system = [
    buildCrmSystemPrompt(declarations),
    [
      "# ACTION PROPOSAL",
      "Utilizatorul a cerut o modificare în CRM. Ceri EXACT un instrument de acțiune, cu parametri completi și corecți, folosind ID-urile reale din datele primite.",
      "Nu explici, nu ceri instrumente de citire, nu propui mai multe acțiuni. Dacă datele nu permit o acțiune clară, răspunzi în text ce lipsește.",
      "Acțiunea NU se execută acum: utilizatorul o va aproba sau respinge.",
    ].join("\n"),
  ].join("\n\n");

  const messages: AiProviderMessage[] = [
    {
      role: "user",
      content: buildCrmUserPrompt(input.context, input.question, {
        rezultate_citiri: input.readSummary,
      }),
    },
  ];

  try {
    const result = await withRetry(() =>
      input.provider.generate({ system, messages, tools: declarations }),
    );
    input.tracer.record("model", `${input.provider.id}.action_proposal`, {
      details: { toolCalls: result.toolCalls.length },
    });
    const call = result.toolCalls[0];
    if (!call) {
      return {
        ok: false,
        message:
          result.text.trim() === ""
            ? "Nu am putut construi o acțiune clară pentru această cerere."
            : result.text.trim().slice(0, 500),
      };
    }
    const validation = validateCrmAction(call.name, call.arguments);
    if (!validation.ok) return { ok: false, message: validation.message };
    return { ok: true, request: { tool: validation.tool, data: validation.data } };
  } catch (error) {
    input.tracer.record("error", `${HABITOO_CRM_AGENT}.proposal`, { status: "failed" });
    return { ok: false, message: safeAiProviderMessage(error) };
  }
}
