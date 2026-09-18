/**
 * Runtime-ul Habitoo Manager Agent (Stage 17).
 *
 * Managerul orchestrează agenții existenți; nu primește privilegii noi și nu
 * calculează niciodată valori ACP. Fiecare pas trece prin `executeAiTool`
 * (allowlist + permisiuni + RLS) sau prin runtime-ul agentului respectiv, iar
 * orice scriere se oprește într-o aprobare umană legată de payload-ul exact.
 * Starea trăiește în `ai_workflow_runs`, deci un plan suspendat supraviețuiește
 * reîncărcării paginii și repornirii serverului.
 */
import { PROSPECTING_NO_LIVE_SOURCE_NOTE } from "@/lib/prospecting/workflow";
import type { AiActor } from "../../gateway/types";
import { AI_AUDIT_ACTIONS, logAiAudit } from "../../security/audit";
import { sanitizeUserRequest } from "../../security/injection";
import { checkActionPolicy } from "../../security/policy";
import { AiTracer, newTraceId } from "../../tracing/trace";
import { writeTraceEvents } from "../../tracing/trace.server";
import { validateAiRequestSize } from "../../usage/limits";
import { writeAiUsage } from "../../usage/tracking.server";
import { classifyAiError } from "../../reliability/retry";
import {
  MANAGER_AGENT_LABELS,
  MANAGER_INTENT_LABELS,
  routeManagerRequest,
  type ManagerRouting,
} from "./intent";
import {
  applyApproval,
  budgetExceeded,
  buildManagerPlan,
  canRetryStep,
  completeStep,
  failPlan,
  failStep,
  findStep,
  isApprovedForExecution,
  MANAGER_MAX_RETRIES,
  MANAGER_WORKFLOW,
  nextPendingStep,
  retryStep,
  skipRemainingSteps,
  startStep,
  statusOfPlan,
  suspendForApproval,
  type ManagerPlanState,
  type ManagerRunStatus,
  type ManagerJson,
  type ManagerStep,
} from "./plan";


async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof loadAdmin>>;

export type ManagerRunView = {
  id: string;
  status: ManagerRunStatus;
  intent: string;
  intentLabel: string;
  agents: string[];
  request: string;
  previewOnly: boolean;
  currentStepId: string | null;
  steps: ManagerStep[];
  approval: ManagerPlanState["approval"];
  approved: boolean | null;
  execution: ManagerPlanState["execution"];
  summary: string | null;
  sources: string[];
  notes: string[];
  message: string | null;
  updatedAt: string;
};

export type ManagerTurnResult = {
  status: "ok" | "not_configured" | "rate_limited" | "failed";
  run: ManagerRunView | null;
  message?: string;
};

/** Referințele agentului de marketing folosite la reluare. */
type ManagerLinks = { marketingRunId: string | null; marketingResultIndex: number };

type ManagerState = ManagerPlanState & { links: ManagerLinks };

function view(row: {
  id: string;
  status: string;
  current_step: string;
  state: unknown;
  error_message?: string | null;
  updated_at: string;
}): ManagerRunView {
  const state = (row.state ?? {}) as ManagerState;
  return {
    id: row.id,
    status: statusOfPlan(state),
    intent: state.intent,
    intentLabel: MANAGER_INTENT_LABELS[state.intent] ?? state.intent,
    agents: (state.agents ?? []).map((agent) => MANAGER_AGENT_LABELS[agent] ?? agent),
    request: state.request ?? "",
    previewOnly: state.previewOnly ?? false,
    currentStepId: state.currentStepId ?? null,
    steps: state.steps ?? [],
    approval: state.approval ?? null,
    approved: state.approvalDecision ? state.approvalDecision.approved : null,
    execution: state.execution ?? null,
    summary: state.summary ?? null,
    sources: state.sources ?? [],
    notes: state.notes ?? [],
    message: state.failure ?? row.error_message ?? null,
    updatedAt: row.updated_at,
  };
}

async function persist(
  admin: Admin,
  actor: AiActor,
  runId: string,
  state: ManagerState,
  errorMessage: string | null = null,
): Promise<void> {
  await admin
    .from("ai_workflow_runs")
    .update({
      status: statusOfPlan(state),
      current_step: state.currentStepId ?? "complete",
      state: state as never,
      pending_approval: (state.approval ?? null) as never,
      result: state.summary ? ({ summary: state.summary } as never) : null,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId);
}

/** Citire prin registry: allowlist, capabilitate de rol și RLS pe organizație. */
async function readTool(
  actor: AiActor,
  tracer: AiTracer,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; data: unknown; summary: string } | { ok: false; message: string; retryable: boolean }> {
  const { executeAiTool } = await import("../../tools/executors.server");
  let lastMessage = "Instrumentul nu a răspuns.";
  let retryable = false;
  // Retry doar pentru erori tranzitorii; o citire este idempotentă.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const execution = await tracer.span("tool", tool, () => executeAiTool(actor, tool, args));
      if (execution.ok) return { ok: true, data: execution.data, summary: execution.summary };
      lastMessage = execution.error;
      retryable = execution.code === "failed";
      if (!retryable) return { ok: false, message: lastMessage, retryable: false };
    } catch (error) {
      const classified = classifyAiError(error);
      lastMessage = "Instrumentul nu a putut fi folosit acum.";
      retryable = classified.retryable;
      if (!retryable) return { ok: false, message: lastMessage, retryable: false };
    }
  }
  return { ok: false, message: lastMessage, retryable };
}

export type ManagerTurnInput = {
  request: string;
  propertyIds?: string[];
  channel?: string;
  contentType?: string;
  tone?: string;
  length?: string;
};

/**
 * Un plan complet: rutare → plan → execuție pas cu pas. Se oprește la prima
 * acțiune persistentă și cere aprobare; citirile nu cer niciodată aprobare.
 */
export async function runManagerTurn(
  actor: AiActor,
  input: ManagerTurnInput,
): Promise<ManagerTurnResult> {
  const started = Date.now();
  const request = sanitizeUserRequest(input.request ?? "");
  const size = validateAiRequestSize(request);
  if (!size.ok) return { status: "failed", run: null, message: size.message };
  if (request.trim() === "") {
    return { status: "failed", run: null, message: "Scrie ce ai nevoie de la Habitoo Manager." };
  }

  const { resolveAiProvider } = await import("../../providers/registry.server");
  const provider = resolveAiProvider();
  if (!provider) {
    return { status: "not_configured", run: null, message: "AI nu este configurat." };
  }

  const admin = await loadAdmin();
  const { checkAiQuota } = await import("../../gateway/gateway.server");
  const quota = await checkAiQuota(admin as never, actor, "chat");
  if (!quota.allowed) {
    return {
      status: "rate_limited",
      run: null,
      message: quota.message,
    };
  }


  // Rutare: reguli deterministe + clasificare semantică (allowlist de intenții).
  const keywordRouting: ManagerRouting = routeManagerRequest(request);
  const { routeManagerRequestSemantic } = await import("./semantic.server");
  const routed = await routeManagerRequestSemantic(provider, request, keywordRouting);
  const routing: ManagerRouting = routed.routing;
  const traceId = newTraceId();
  const tracer = new AiTracer(traceId, {
    organizationId: actor.organizationId,
    userId: actor.userId,
  });
  tracer.record("workflow", `${MANAGER_WORKFLOW}.routing`, {
    details: {
      intent: routing.intent,
      keywordIntent: keywordRouting.intent,
      semantic: routed.semantic,
    },
  });


  const propertyIds = [...new Set(input.propertyIds ?? [])].slice(0, 5);
  const plan = buildManagerPlan({
    planId: traceId,
    request,
    routing,
    propertyIds,
    channel: input.channel ?? "olx",
    contentType: input.contentType ?? "listing",
    tone: input.tone ?? "professional",
    length: input.length ?? "standard",
  });
  let state: ManagerState = { ...plan, links: { marketingRunId: null, marketingResultIndex: 0 } };

  const { data: created } = await admin
    .from("ai_workflow_runs")
    .insert({
      organization_id: actor.organizationId,
      user_id: actor.userId,
      workflow: MANAGER_WORKFLOW,
      status: "running",
      current_step: state.currentStepId ?? "plan",
      state: state as never,
      trace_id: traceId,
    })
    .select("id,status,current_step,state,updated_at")
    .single();
  if (!created) {
    return { status: "failed", run: null, message: "Planul nu a putut fi pornit." };
  }

  tracer.record("workflow", `${MANAGER_WORKFLOW}.start`, {
    details: { runId: created.id, intent: routing.intent, steps: state.steps.length },
  });
  await logAiAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: AI_AUDIT_ACTIONS.managerRunStarted,
    details: {
      runId: created.id,
      traceId,
      intent: routing.intent,
      agents: routing.agents,
      steps: state.steps.length,
      previewOnly: routing.previewOnly,
    },
  });

  state = await executePlan(admin, actor, tracer, created.id, state, input);

  const latencyMs = Date.now() - started;
  await writeAiUsage(admin as never, {
    organization_id: actor.organizationId,
    user_id: actor.userId,
    provider: provider.id,
    model: provider.model,
    capability: "manager_agent",
    input_tokens: null,
    output_tokens: null,
    latency_ms: latencyMs,
    success: statusOfPlan(state) !== "failed",
    tool_calls: state.steps.filter((item) => item.status === "completed").length,
  });

  await persist(admin, actor, created.id, state, state.failure);
  tracer.record("workflow", `${MANAGER_WORKFLOW}.${statusOfPlan(state)}`, { latencyMs });
  await writeTraceEvents(tracer.list());
  await logAiAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action:
      statusOfPlan(state) === "failed"
        ? AI_AUDIT_ACTIONS.managerRunFailed
        : AI_AUDIT_ACTIONS.managerRunFinished,
    details: {
      runId: created.id,
      status: statusOfPlan(state),
      completed: state.steps.filter((item) => item.status === "completed").length,
      latencyMs,
    },
  });

  return {
    status: statusOfPlan(state) === "failed" ? "failed" : "ok",
    run: view({ ...created, state: state as never, updated_at: new Date().toISOString() }),
    message: state.failure ?? undefined,
  };
}

/** Rulează pașii în ordine până la final, la o aprobare sau la un blocaj. */
async function executePlan(
  admin: Admin,
  actor: AiActor,
  tracer: AiTracer,
  runId: string,
  input: ManagerState,
  turn: ManagerTurnInput,
): Promise<ManagerState> {
  let state = input;
  let guard = 0;
  // Bucla permite reluarea aceluiași pas de câte ori îngăduie bugetul de retry.
  const maxIterations = state.steps.length * (MANAGER_MAX_RETRIES + 1) + 2;

  while (guard < maxIterations) {
    guard += 1;
    const budget = budgetExceeded(state);
    if (budget) {
      state = skipRemainingSteps(failPlan(state, budget), budget) as ManagerState;
      break;
    }
    const step = nextPendingStep(state);
    if (!step) break;

    state = startStep(state, step.id) as ManagerState;
    tracer.record("step", `${MANAGER_WORKFLOW}.${step.kind}`, {
      details: { stepId: step.id, attempt: step.retryCount + 1 },
    });
    const result = await runStep(admin, actor, tracer, runId, state, step, turn);
    state = result.state;

    if (result.retry) {
      if (canRetryStep(state, step.id)) {
        // RETRY REAL: același pas, același input, contor persistat.
        state = retryStep(state, step.id, result.retryMessage ?? null) as ManagerState;
        tracer.record("step", `${MANAGER_WORKFLOW}.retry`, {
          details: { stepId: step.id, attempt: (findStep(state, step.id)?.retryCount ?? 0) + 1 },
        });
        await persist(admin, actor, runId, state, null);
        continue;
      }
      const reason =
        result.retryMessage ??
        "Pasul a eșuat repetat. Planul s-a oprit și necesită atenție.";
      state = failStep(state, step.id, reason) as ManagerState;
      state = skipRemainingSteps(failPlan(state, reason), reason) as ManagerState;
      await persist(admin, actor, runId, state, reason);
      break;
    }

    // Persistăm după fiecare pas: o întrerupere nu pierde progresul.
    await persist(admin, actor, runId, state, state.failure);
    if (result.stop) break;
  }

  return { ...state, summary: state.summary ?? summarize(state) };
}


function summarize(state: ManagerState): string {
  const done = state.steps.filter((item) => item.status === "completed").length;
  if (state.failure) return state.failure;
  if (state.approval) {
    return `Planul este pregătit și așteaptă decizia ta pentru: ${state.approval.label}.`;
  }
  const blocked = state.steps.find((item) => item.status === "blocked");
  if (blocked) return blocked.errorMessage ?? "O parte din plan nu a putut fi făcută.";
  return `Am rulat ${done} pași din planul „${MANAGER_INTENT_LABELS[state.intent]}”.`;
}

type StepOutcome = {
  state: ManagerState;
  stop: boolean;
  /** `true` cere reluarea ACELUIAȘI pas (eroare tranzitorie). */
  retry?: boolean;
  retryMessage?: string;
};


async function runStep(
  admin: Admin,
  actor: AiActor,
  tracer: AiTracer,
  runId: string,
  input: ManagerState,
  step: ManagerStep,
  turn: ManagerTurnInput,
): Promise<StepOutcome> {
  let state = input;

  switch (step.kind) {
    case "unavailable": {
      const reason =
        (step.input["reason"] as string | null | undefined) ??
        "Această capabilitate nu există încă în Habitoo.";
      state = failStep(state, step.id, reason, "blocked") as ManagerState;
      state = { ...state, summary: reason };
      return { state, stop: true };
    }

    case "prospecting_check": {
      const read = await readTool(actor, tracer, "list_prospecting_sources", { limit: 10 });
      if (!read.ok) {
        if (read.retryable) {
          return { state, stop: false, retry: true, retryMessage: read.message };
        }
        state = failStep(state, step.id, read.message, "blocked") as ManagerState;
        return { state, stop: false };
      }

      const rows = Array.isArray(read.data) ? read.data : [];
      // Doar o sursă activă cu provider `live` înseamnă sursă externă reală.
      const liveSources = rows.filter(
        (row) =>
          (row as { enabled?: boolean }).enabled === true &&
          (row as { availability?: string }).availability === "live",
      ).length;
      state = completeStep(
        state,
        step.id,
        { sources: rows.length, liveSources } as Record<string, ManagerJson>,
        "Prospecting Agent",
      ) as ManagerState;
      if (liveSources === 0) {
        // Onest: fără sursă reală conectată nu pretindem că am găsit anunțuri.
        const reason = PROSPECTING_NO_LIVE_SOURCE_NOTE;
        state = failStep(state, step.id, reason, "blocked") as ManagerState;
        state = { ...state, notes: [...state.notes, reason], summary: reason };
        return { state, stop: true };
      }
      return { state, stop: false };
    }

    case "crm_context": {
      const ids = (step.input["propertyIds"] as string[] | undefined) ?? [];
      const found: Record<string, unknown>[] = [];
      let transient: string | null = null;
      for (const propertyId of ids) {
        const read = await readTool(actor, tracer, "get_property", { propertyId });
        if (!read.ok) {
          if (read.retryable) transient = read.message;
          continue;
        }
        const row = (read.data ?? null) as Record<string, unknown> | null;
        if (row) found.push(row);
      }
      if (found.length === 0 && transient) {
        // Eroare tranzitorie: pasul se reia identic, nu sărim la pasul următor.
        return { state, stop: false, retry: true, retryMessage: transient };
      }
      if (found.length === 0) {
        state = failStep(
          state,
          step.id,
          "Proprietățile cerute nu sunt disponibile (arhivate, șterse sau din altă agenție).",
          "blocked",
        ) as ManagerState;
        state = { ...state, summary: "Nu am găsit proprietăți pe care le pot folosi." };
        return { state, stop: true };
      }

      state = completeStep(
        state,
        step.id,
        {
          properties: found.map((row) => ({
            id: String(row["id"] ?? ""),
            reference: (row["reference"] as string | null) ?? null,
            city: (row["city"] as string | null) ?? null,
          })),
        } as Record<string, ManagerJson>,
        "CRM Habitoo",
      ) as ManagerState;
      return { state, stop: false };
    }

    case "crm_answer": {
      const { runCrmTurn } = await import("../crm/runtime.server");
      const turnResult = await runCrmTurn(actor, { question: state.request });
      if (turnResult.status !== "ok") {
        state = failStep(state, step.id, turnResult.message ?? "CRM Agent nu a răspuns.") as ManagerState;
        return { state, stop: true };
      }
      state = completeStep(
        state,
        step.id,
        { answer: turnResult.answer, intent: turnResult.intent } as Record<string, ManagerJson>,
        "CRM Agent",
      ) as ManagerState;
      state = { ...state, summary: turnResult.answer };
      return { state, stop: false };
    }

    case "acp_read": {
      // Managerul CITEȘTE rezultatul motorului determinist. Nu calculează nimic.
      const ids = (step.input["propertyIds"] as string[] | undefined) ?? [];
      const analyses: Record<string, unknown>[] = [];
      for (const propertyId of ids) {
        const read = await readTool(actor, tracer, "get_acp", { propertyId });
        if (!read.ok) continue;
        const row = (read.data ?? null) as Record<string, unknown> | null;
        if (row) analyses.push({ propertyId, ...row });
      }
      if (analyses.length === 0) {
        state = failStep(
          state,
          step.id,
          "Nu există o analiză ACP finalizată. Rulează ACP din pagina proprietății, apoi reia planul.",
          "blocked",
        ) as ManagerState;
        return { state, stop: false };
      }
      state = completeStep(
        state,
        step.id,
        { analyses } as unknown as Record<string, ManagerJson>,
        "Motor ACP determinist",
      ) as ManagerState;
      return { state, stop: false };
    }

    case "marketing_generate": {
      const { runMarketingTurn } = await import("../marketing/runtime.server");
      const marketing = await runMarketingTurn(actor, {
        propertyIds: (step.input["propertyIds"] as string[] | undefined) ?? [],
        channel: (turn.channel ?? "olx") as never,
        contentType: (turn.contentType ?? "listing") as never,
        tone: (turn.tone ?? "professional") as never,
        length: (turn.length ?? "standard") as never,
        notes: null,
      });
      if (marketing.status !== "ok" || !marketing.run) {
        state = failStep(
          state,
          step.id,
          marketing.message ?? "Textele de marketing nu au putut fi generate.",
        ) as ManagerState;
        return { state, stop: true };
      }
      const results = marketing.run.results;
      state = {
        ...state,
        links: { marketingRunId: marketing.run.id, marketingResultIndex: 0 },
      };
      state = completeStep(
        state,
        step.id,
        {
          marketingRunId: marketing.run.id,
          texts: results.map((item) => ({
            propertyId: item.propertyId,
            propertyLabel: item.propertyLabel,
            title: item.content.title,
            body: item.content.body,
            validationStatus: item.validationStatus,
            missingData: item.missingData,
          })),
        } as unknown as Record<string, ManagerJson>,
        "Marketing Agent",
      ) as ManagerState;
      if (results.every((item) => item.validationStatus === "invalid")) {
        state = skipRemainingSteps(
          state,
          "Textele nu au trecut verificarea factuală, deci nu propun nicio salvare.",
        ) as ManagerState;
        return { state, stop: true };
      }
      return { state, stop: false };
    }

    case "propose_action": {
      const tool = step.tool ?? "";
      const policy = checkActionPolicy(tool);
      if (!policy.allowed) {
        state = failStep(state, step.id, policy.message, "blocked") as ManagerState;
        return { state, stop: true };
      }
      const marketingRunId = state.links.marketingRunId;
      if (!marketingRunId) {
        state = failStep(state, step.id, "Nu există un text de salvat.", "blocked") as ManagerState;
        return { state, stop: true };
      }
      // Propunerea este creată de agentul de marketing: managerul nu ocolește
      // aprobarea agentului, ci o expune utilizatorului.
      const { proposeMarketingWrite } = await import("../marketing/runtime.server");
      const proposal = await proposeMarketingWrite(actor, marketingRunId, {
        resultIndex: state.links.marketingResultIndex,
        mode: "save_draft",
      });
      if (!proposal.ok) {
        state = failStep(state, step.id, proposal.message, "blocked") as ManagerState;
        return { state, stop: true };
      }
      const pending = proposal.run.proposal;
      if (!pending) {
        state = failStep(state, step.id, "Propunerea nu a putut fi creată.", "blocked") as ManagerState;
        return { state, stop: true };
      }
      const payload = { tool, marketingRunId, argumentsJson: pending.argumentsJson };
      state = suspendForApproval(state, {
        stepId: step.id,
        tool,
        label: proposal.run.proposalLabel ?? "Salvare ciornă de marketing",
        argumentsJson: pending.argumentsJson,
        changes: pending.changes,
        warnings: pending.warnings,
        payload,
      }) as ManagerState;
      await logAiAudit({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: AI_AUDIT_ACTIONS.managerApprovalRequested,
        details: { runId, tool, marketingRunId },
      });
      state = { ...state, summary: summarize(state) };
      return { state, stop: true };
    }

    default: {
      state = failStep(state, step.id, "Pas necunoscut.", "blocked") as ManagerState;
      return { state, stop: true };
    }
  }
}

async function loadRun(admin: Admin, actor: AiActor, runId: string) {
  const { data } = await admin
    .from("ai_workflow_runs")
    .select("id,workflow,status,current_step,state,trace_id,error_message,updated_at")
    .eq("id", runId)
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .maybeSingle();
  if (!data || data.workflow !== MANAGER_WORKFLOW) return null;
  return data;
}

export type ManagerDecision = { ok: true; run: ManagerRunView } | { ok: false; message: string };

/** RESUME după decizia umană: se execută exact acțiunea aprobată, o singură dată. */
export async function decideManagerAction(
  actor: AiActor,
  runId: string,
  approved: boolean,
): Promise<ManagerDecision> {
  const admin = await loadAdmin();
  const row = await loadRun(admin, actor, runId);
  if (!row) return { ok: false, message: "Planul nu a fost găsit." };
  if (row.status !== "suspended") {
    return { ok: false, message: "Această acțiune a fost deja procesată." };
  }

  let state = row.state as unknown as ManagerState;
  const approval = state.approval;
  if (!approval) return { ok: false, message: "Planul nu așteaptă o aprobare." };

  const tracer = new AiTracer(row.trace_id ?? newTraceId(), {
    organizationId: actor.organizationId,
    userId: actor.userId,
    runId: row.id,
  });
  tracer.record("workflow", `${MANAGER_WORKFLOW}.resume`, { details: { approved } });

  state = applyApproval(state, approved) as ManagerState;

  const payload = {
    tool: approval.tool,
    marketingRunId: state.links?.marketingRunId ?? null,
    argumentsJson: approval.argumentsJson,
  };

  if (approved && isApprovedForExecution(state, payload) && state.links?.marketingRunId) {
    const { decideMarketingWrite } = await import("../marketing/runtime.server");
    const execution = await tracer.span("tool", approval.tool, () =>
      decideMarketingWrite(actor, state.links.marketingRunId!, true),
    );
    const ok = execution.ok && execution.run.execution?.ok === true;
    state = {
      ...state,
      execution: {
        ok,
        message: execution.ok
          ? (execution.run.execution?.message ?? "Acțiune executată.")
          : execution.message,
        entityId: execution.ok ? (execution.run.execution?.entityId ?? null) : null,
      },
    };
    state = ok
      ? (completeStep(state, approval.stepId, { executed: approval.tool }, "Marketing Agent") as ManagerState)
      : (failStep(state, approval.stepId, state.execution?.message ?? "Acțiunea a eșuat.") as ManagerState);
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: ok ? AI_AUDIT_ACTIONS.managerApprovalGranted : AI_AUDIT_ACTIONS.managerActionFailed,
      details: { runId: row.id, tool: approval.tool },
    });
  } else if (approved) {
    state = failStep(
      state,
      approval.stepId,
      "Acțiunea s-a schimbat între aprobare și execuție. Cere aprobarea din nou.",
      "blocked",
    ) as ManagerState;
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AI_AUDIT_ACTIONS.managerActionFailed,
      details: { runId: row.id, reason: "payload_changed" },
    });
  } else {
    const { decideMarketingWrite } = await import("../marketing/runtime.server");
    if (state.links?.marketingRunId) {
      await decideMarketingWrite(actor, state.links.marketingRunId, false);
    }
    state = failStep(state, approval.stepId, "Acțiune respinsă.", "blocked") as ManagerState;
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AI_AUDIT_ACTIONS.managerApprovalRejected,
      details: { runId: row.id, tool: approval.tool },
    });
  }

  // RESUME: pașii deja finalizați nu se reexecută; planul continuă de unde a
  // rămas. Doar dacă nu mai există pași rămași se închide.
  state = { ...state, approval: null, currentStepId: null };
  if (state.execution?.ok === true && nextPendingStep(state)) {
    state = await executePlan(admin, actor, tracer, row.id, state, {
      request: state.request,
    });
  } else {
    state = skipRemainingSteps(state, "Plan finalizat.") as ManagerState;
  }
  state = { ...state, summary: state.execution?.message ?? summarize(state) };


  await persist(admin, actor, row.id, state, state.failure);
  await writeTraceEvents(tracer.list());

  return {
    ok: true,
    run: view({ ...row, state: state as never, updated_at: new Date().toISOString() }),
  };
}

export async function getManagerRun(actor: AiActor, runId: string): Promise<ManagerRunView | null> {
  const admin = await loadAdmin();
  const row = await loadRun(admin, actor, runId);
  return row ? view(row) : null;
}

export async function listManagerRuns(actor: AiActor, limit = 10): Promise<ManagerRunView[]> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("ai_workflow_runs")
    .select("id,workflow,status,current_step,state,error_message,updated_at")
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .eq("workflow", MANAGER_WORKFLOW)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(view);
}
