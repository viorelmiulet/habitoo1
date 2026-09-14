/**
 * Runtime-ul workflow-ului `habitooDiagnosticWorkflow`.
 *
 * Backendul Habitoo rulează serverless (nu există proces Node permanent), deci
 * starea NU poate trăi în memoria procesului: fiecare pas o citește și o scrie
 * în `ai_workflow_runs`. SUSPEND înseamnă un rând cu `status = 'suspended'`,
 * iar RESUME reia exact din pasul salvat, chiar după un restart.
 */
import type { AiActor } from "../gateway/types";
import {
  applyApproval,
  completeStep,
  HABITOO_DIAGNOSTIC_WORKFLOW,
  initialWorkflowState,
  statusOf,
  validateWorkflowResult,
  type ProposedAction,
  type WorkflowState,
  type WorkflowStatus,
} from "./diagnostic";
import { AiTracer, newTraceId } from "../tracing/trace";
import { writeTraceEvents } from "../tracing/trace.server";
import { AI_AUDIT_ACTIONS, logAiAudit } from "../security/audit";

export type WorkflowRunView = {
  id: string;
  workflow: string;
  status: WorkflowStatus;
  currentStep: string;
  question: string;
  contextUsed: string[];
  proposal: ProposedAction | null;
  approved: boolean | null;
  toolSummary: string | null;
  answer: string | null;
  notes: string[];
  traceId: string | null;
  updatedAt: string;
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof loadAdmin>>;

function view(row: {
  id: string;
  workflow: string;
  status: string;
  current_step: string;
  state: unknown;
  trace_id: string | null;
  updated_at: string;
}): WorkflowRunView {
  const state = (row.state ?? {}) as WorkflowState;
  return {
    id: row.id,
    workflow: row.workflow,
    status: row.status as WorkflowStatus,
    currentStep: row.current_step,
    question: state.input?.question ?? "",
    contextUsed: state.contextCategories ?? [],
    proposal: state.proposal ?? null,
    approved: state.approval ? state.approval.approved : null,
    toolSummary: state.toolSummary ?? null,
    answer: state.answer ?? null,
    notes: state.notes ?? [],
    traceId: row.trace_id,
    updatedAt: row.updated_at,
  };
}

async function persist(
  admin: Admin,
  actor: AiActor,
  runId: string,
  state: WorkflowState,
  extra: { errorMessage?: string | null } = {},
): Promise<void> {
  await admin
    .from("ai_workflow_runs")
    .update({
      status: statusOf(state),
      current_step: state.step,
      state: state as never,
      pending_approval: (state.proposal ?? null) as never,
      result: state.answer ? ({ answer: state.answer } as never) : null,
      error_message: extra.errorMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId);
}

/** Propunerea de citire: derivată din întrebare, mereu read-only. */
function proposeAction(state: WorkflowState): ProposedAction | null {
  if (state.input.propertyId) {
    return {
      tool: "get_acp",
      arguments: { propertyId: state.input.propertyId },
      reason: "Citirea celei mai recente analize comparative de piață a proprietății selectate.",
      readOnly: true,
    };
  }
  const query = state.input.question.slice(0, 80);
  return {
    tool: "search_properties",
    arguments: { query, limit: 5 },
    reason: `Căutarea în portofoliul agenției după „${query}”.`,
    readOnly: true,
  };
}

/**
 * START → authenticate → resolve_organization → build_context → agent →
 * approval (SUSPEND). Actorul este deja verificat de server function.
 */
export async function startDiagnosticWorkflow(
  actor: AiActor,
  input: { question: string; propertyId?: string | null },
): Promise<{ ok: true; run: WorkflowRunView } | { ok: false; message: string }> {
  const admin = await loadAdmin();
  const { checkAiRateLimits } = await import("../gateway/gateway.server");
  if (!(await checkAiRateLimits(admin, actor, "workflow"))) {
    return {
      ok: false,
      message: "Ai atins limita de fluxuri AI pornite. Încearcă din nou în câteva minute.",
    };
  }

  const traceId = newTraceId();
  const { data: created, error } = await admin
    .from("ai_workflow_runs")
    .insert({
      organization_id: actor.organizationId,
      user_id: actor.userId,
      workflow: HABITOO_DIAGNOSTIC_WORKFLOW,
      status: "running",
      current_step: "authenticate",
      state: initialWorkflowState(input) as never,
      trace_id: traceId,
    })
    .select("id,workflow,status,current_step,state,trace_id,updated_at")
    .single();
  if (error || !created) {
    console.error("[ai] workflow insert failed", error?.message);
    return { ok: false, message: "Fluxul AI nu a putut fi pornit. Încearcă din nou." };
  }

  const tracer = new AiTracer(traceId, {
    organizationId: actor.organizationId,
    userId: actor.userId,
    runId: created.id,
  });
  tracer.record("workflow", `${HABITOO_DIAGNOSTIC_WORKFLOW}.start`);

  let state = initialWorkflowState(input);
  state = completeStep(state, "authenticate");
  tracer.record("step", "authenticate");
  state = completeStep(state, "resolve_organization");
  tracer.record("step", "resolve_organization");

  const { buildRequestContext } = await import("../gateway/gateway.server");
  const context = await tracer.span("step", "build_context", () =>
    buildRequestContext(admin, actor, input.propertyId ?? null),
  );
  state = { ...state, contextCategories: context.categories };
  state = completeStep(state, "build_context");

  // Pasul „agent": propune o citire, nu o execută. Decizia rămâne la om.
  const proposal = proposeAction(state);
  state = { ...state, proposal };
  state = completeStep(state, "agent");
  tracer.record("step", "agent", { details: { proposedTool: proposal?.tool ?? null } });
  tracer.record("workflow", `${HABITOO_DIAGNOSTIC_WORKFLOW}.suspended`, {
    details: { step: "approval" },
  });

  await persist(admin, actor, created.id, state);
  await writeTraceEvents(tracer.list());
  await logAiAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: AI_AUDIT_ACTIONS.workflowStarted,
    details: { workflow: HABITOO_DIAGNOSTIC_WORKFLOW, runId: created.id, traceId },
  });

  return {
    ok: true,
    run: view({ ...created, state: state as never, status: statusOf(state) }),
  };
}

/**
 * RESUME → read_tool (dacă a fost aprobat) → validate → respond → END.
 * Starea vine din baza de date, deci reluarea funcționează după restart.
 */
export async function resumeDiagnosticWorkflow(
  actor: AiActor,
  runId: string,
  approved: boolean,
): Promise<{ ok: true; run: WorkflowRunView } | { ok: false; message: string }> {
  const admin = await loadAdmin();
  const { data: row } = await admin
    .from("ai_workflow_runs")
    .select("id,workflow,status,current_step,state,trace_id,updated_at")
    .eq("id", runId)
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .maybeSingle();
  if (!row) return { ok: false, message: "Fluxul nu a fost găsit." };
  if (row.status !== "suspended") {
    return { ok: false, message: "Fluxul nu așteaptă o aprobare." };
  }

  const traceId = row.trace_id ?? newTraceId();
  const tracer = new AiTracer(traceId, {
    organizationId: actor.organizationId,
    userId: actor.userId,
    runId: row.id,
  });
  tracer.record("workflow", `${HABITOO_DIAGNOSTIC_WORKFLOW}.resume`, { details: { approved } });

  let state = applyApproval(row.state as unknown as WorkflowState, approved);

  if (approved && state.proposal) {
    const { executeAiTool } = await import("../tools/executors.server");
    const proposal = state.proposal;
    const execution = await tracer.span("tool", proposal.tool, () =>
      executeAiTool(actor, proposal.tool, proposal.arguments),
    );
    state = {
      ...state,
      toolSummary: execution.ok ? execution.summary : execution.error,
    };
    state = completeStep(state, "read_tool");
  }

  const validation = validateWorkflowResult(state);
  state = { ...state, notes: [...state.notes, ...validation.notes] };
  state = completeStep(state, "validate");
  tracer.record("step", "validate", { status: validation.ok ? "ok" : "failed" });

  const answer = approved
    ? `Citirea aprobată a fost executată: ${state.toolSummary ?? "fără rezultat"}.`
    : "Citirea propusă a fost respinsă, așa că fluxul s-a încheiat fără date noi.";
  state = { ...state, answer };
  state = completeStep(state, "respond");
  tracer.record("workflow", `${HABITOO_DIAGNOSTIC_WORKFLOW}.completed`);

  await persist(admin, actor, row.id, state);
  await writeTraceEvents(tracer.list());
  await logAiAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: approved ? AI_AUDIT_ACTIONS.workflowApproved : AI_AUDIT_ACTIONS.workflowRejected,
    details: { workflow: HABITOO_DIAGNOSTIC_WORKFLOW, runId: row.id, traceId },
  });

  return { ok: true, run: view({ ...row, state: state as never, status: "completed" }) };
}

export async function getDiagnosticWorkflow(
  actor: AiActor,
  runId: string,
): Promise<WorkflowRunView | null> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("ai_workflow_runs")
    .select("id,workflow,status,current_step,state,trace_id,updated_at")
    .eq("id", runId)
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .maybeSingle();
  return data ? view(data) : null;
}

export async function listDiagnosticWorkflows(actor: AiActor): Promise<WorkflowRunView[]> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("ai_workflow_runs")
    .select("id,workflow,status,current_step,state,trace_id,updated_at")
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .order("updated_at", { ascending: false })
    .limit(10);
  return (data ?? []).map(view);
}
