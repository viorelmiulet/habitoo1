/**
 * Runtime-ul `habitooCrmWorkflow` (Stage 14).
 *
 * Backendul rulează serverless, fără proces Node permanent: starea fluxului
 * trăiește în `ai_workflow_runs`, deci SUSPEND (așteptare aprobare) și RESUME
 * funcționează și după reîncărcarea paginii sau repornirea serverului.
 *
 * Fluxul: authenticate → resolve_organization → classify_request →
 * build_context → read_tools → analyze → respond → [action_proposal → approval
 * (SUSPEND) → execute_action → validate] → audit → complete.
 */
import type { AiActor, AiSource, AiToolCallRecord } from "../../gateway/types";
import { AI_AUDIT_ACTIONS, logAiAudit } from "../../security/audit";
import {
  APPROVAL_ALREADY_APPLIED,
  APPROVAL_TAMPERED,
  claimSuspendedRun,
  fingerprintMatches,
  releaseClaimedRun,
} from "../../security/approval";

import { AiTracer, newTraceId } from "../../tracing/trace";
import { writeTraceEvents } from "../../tracing/trace.server";
import { writeAiUsage } from "../../usage/tracking.server";
import { validateAiRequestSize } from "../../usage/limits";
import { buildAiContext } from "../../context/builder";
import {
  buildCrmProposal,
  crmActionIdempotencyKey,
  CRM_ACTION_LABELS,
  LEAD_STAGE_LABELS,
  isAllowedLeadTransition,
  type CrmActionChange,
  type CrmActionProposal,
  type CrmActionTool,
} from "./actions";
import { parseCrmQuery } from "./filters";
import {
  applyCrmApproval,
  completeCrmStep,
  finishWithoutAction,
  failCrmState,
  HABITOO_CRM_WORKFLOW,
  initialCrmState,
  isCrmActionAllowed,
  statusOfCrmState,
  validateCrmResult,
  type CrmWorkflowState,
  type CrmWorkflowStatus,
} from "./workflow";
import { HABITOO_CRM_AGENT, proposeCrmAction, requestsCrmAction, runCrmAgent } from "./agent.server";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof loadAdmin>>;

export type CrmRunView = {
  id: string;
  status: CrmWorkflowStatus;
  currentStep: string;
  question: string;
  intent: string | null;
  answer: string | null;
  proposal: CrmActionProposal | null;
  proposalLabel: string | null;
  approved: boolean | null;
  execution: CrmWorkflowState["execution"];
  notes: string[];
  updatedAt: string;
};

export type CrmTurnResult = {
  status: "ok" | "not_configured" | "rate_limited" | "failed";
  answer: string;
  toolCalls: AiToolCallRecord[];
  sources: AiSource[];
  warnings: string[];
  contextUsed: string[];
  intent: string;
  run: CrmRunView | null;
  message?: string;
};

function view(row: {
  id: string;
  status: string;
  current_step: string;
  state: unknown;
  updated_at: string;
}): CrmRunView {
  const state = (row.state ?? {}) as CrmWorkflowState;
  return {
    id: row.id,
    status: row.status as CrmWorkflowStatus,
    currentStep: state.step ?? row.current_step,
    question: state.input?.question ?? "",
    intent: state.intent ?? null,
    answer: state.answer ?? null,
    proposal: state.proposal ?? null,
    proposalLabel: state.proposal ? CRM_ACTION_LABELS[state.proposal.tool] : null,
    approved: state.approval ? state.approval.approved : null,
    execution: state.execution ?? null,
    notes: state.notes ?? [],
    updatedAt: row.updated_at,
  };
}

async function persist(
  admin: Admin,
  actor: AiActor,
  runId: string,
  state: CrmWorkflowState,
  errorMessage: string | null = null,
): Promise<void> {
  await admin
    .from("ai_workflow_runs")
    .update({
      status: statusOfCrmState(state),
      current_step: state.step,
      state: state as never,
      pending_approval: (state.proposal ?? null) as never,
      result: state.answer ? ({ answer: state.answer } as never) : null,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId);
}

/**
 * Descrie propunerea exact cum o vede utilizatorul: entitatea, valoarea
 * actuală → valoarea nouă, responsabilul, termenul și motivul. Valorile
 * actuale sunt citite din baza de date, nu de la model.
 */
async function describeProposal(
  admin: Admin,
  actor: AiActor,
  tool: CrmActionTool,
  data: Record<string, unknown>,
  reason: string,
): Promise<{ ok: true; proposal: CrmActionProposal } | { ok: false; message: string }> {
  const org = actor.organizationId;
  const changes: CrmActionChange[] = [];

  if (tool === "update_lead_status" || tool === "assign_lead") {
    const leadId = String(data["leadId"]);
    const { data: lead } = await admin
      .from("leads")
      .select("id,name,stage,assigned_to")
      .eq("id", leadId)
      .eq("organization_id", org)
      .maybeSingle();
    if (!lead) return { ok: false, message: "Leadul nu există în agenția ta." };

    if (tool === "update_lead_status") {
      const stage = String(data["stage"]);
      const current = String(lead.stage);
      if (!isAllowedLeadTransition(current, stage)) {
        return {
          ok: false,
          message:
            current === stage
              ? `Leadul este deja în etapa ${LEAD_STAGE_LABELS[stage] ?? stage}.`
              : "Tranziția de etapă cerută nu este permisă.",
        };
      }
      changes.push({
        field: "stage",
        label: "Etapă",
        from: LEAD_STAGE_LABELS[current] ?? current,
        to: LEAD_STAGE_LABELS[stage] ?? stage,
      });
      return {
        ok: true,
        proposal: buildCrmProposal({
          tool,
          // Etapa citită acum devine precondiție: la aprobare se verifică din nou.
          args: { ...data, expectedStage: current },
          entity: { type: "lead", id: lead.id, label: lead.name },
          changes,
          reason,
          precondition: {
            field: "stage",
            label: "Etapă la momentul propunerii",
            value: LEAD_STAGE_LABELS[current] ?? current,
          },
        }),
      };
    }

    const assigneeId = String(data["assigneeId"]);
    const [{ data: assignee }, { data: current }] = await Promise.all([
      admin
        .from("profiles")
        .select("id,full_name")
        .eq("id", assigneeId)
        .eq("organization_id", org)
        .maybeSingle(),
      lead.assigned_to
        ? admin.from("profiles").select("id,full_name").eq("id", lead.assigned_to).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!assignee) return { ok: false, message: "Persoana aleasă nu face parte din agenția ta." };
    changes.push({
      field: "assigned_to",
      label: "Responsabil",
      from: current?.full_name ?? "Nealocat",
      to: assignee.full_name ?? "Membru al agenției",
    });
    return {
      ok: true,
      proposal: buildCrmProposal({
        tool,
        args: data,
        entity: { type: "lead", id: lead.id, label: lead.name },
        changes,
        reason,
        assigneeLabel: assignee.full_name ?? null,
      }),
    };
  }

  if (tool === "create_property_match") {
    const [{ data: request }, { data: property }] = await Promise.all([
      admin
        .from("requests")
        .select("id,title")
        .eq("id", String(data["requestId"]))
        .eq("organization_id", org)
        .maybeSingle(),
      admin
        .from("properties")
        .select("id,reference,title")
        .eq("id", String(data["propertyId"]))
        .eq("organization_id", org)
        .maybeSingle(),
    ]);
    if (!request) return { ok: false, message: "Cererea nu există în agenția ta." };
    if (!property) return { ok: false, message: "Proprietatea nu există în agenția ta." };
    changes.push({
      field: "match",
      label: "Potrivire",
      from: null,
      to: `${property.reference ?? property.title ?? "Proprietate"} → ${request.title}`,
    });
    return {
      ok: true,
      proposal: buildCrmProposal({
        tool,
        args: data,
        entity: { type: "request", id: request.id, label: request.title },
        changes,
        reason,
      }),
    };
  }

  if (tool === "create_client_property_match") {
    const [{ data: contact }, { data: property }] = await Promise.all([
      admin
        .from("contacts")
        .select("id,first_name,last_name")
        .eq("id", String(data["contactId"]))
        .eq("organization_id", org)
        .maybeSingle(),
      admin
        .from("properties")
        .select("id,reference,title")
        .eq("id", String(data["propertyId"]))
        .eq("organization_id", org)
        .maybeSingle(),
    ]);
    if (!contact) return { ok: false, message: "Clientul nu există în agenția ta." };
    if (!property) return { ok: false, message: "Proprietatea nu există în agenția ta." };
    const clientLabel = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Client";
    const propertyLabel = property.reference ?? property.title ?? "Proprietate";
    changes.push({
      field: "match",
      label: "Potrivire client ↔ proprietate",
      from: null,
      to: `${propertyLabel} → ${clientLabel}`,
    });
    return {
      ok: true,
      proposal: buildCrmProposal({
        tool,
        args: data,
        entity: { type: "contact", id: contact.id, label: clientLabel },
        changes,
        reason,
        warnings: ["Dacă potrivirea activă există deja, nu se creează un duplicat."],
      }),
    };
  }

  if (tool === "generate_property_description" || tool === "generate_offer_draft") {
    const { data: property } = await admin
      .from("properties")
      .select("id,reference,title,description")
      .eq("id", String(data["propertyId"]))
      .eq("organization_id", org)
      .maybeSingle();
    if (!property) return { ok: false, message: "Proprietatea nu există în agenția ta." };
    const propertyLabel = property.reference ?? property.title ?? "Proprietate";
    const draft = String(data["draft"] ?? "");
    changes.push({
      field: "draft",
      label:
        tool === "generate_property_description" ? "Ciornă de descriere" : "Ciornă de ofertă",
      from: null,
      to: draft.length > 400 ? `${draft.slice(0, 400)}…` : draft,
    });
    return {
      ok: true,
      proposal: buildCrmProposal({
        tool,
        args: data,
        entity: { type: "property", id: property.id, label: propertyLabel },
        changes,
        reason,
        warnings: [
          tool === "generate_property_description"
            ? "Textul se salvează ca ciornă separată. Descrierea publicată a proprietății rămâne neschimbată."
            : "Ciorna nu se publică pe portaluri și nu modifică valorile din analiza ACP.",
        ],
      }),
    };
  }



  // create_task / create_note
  const leadId = (data["leadId"] as string | null) ?? null;
  const contactId = (data["contactId"] as string | null) ?? null;
  const propertyId = (data["propertyId"] as string | null) ?? null;
  let label = "Activitate";
  let entityType: CrmActionProposal["entity"]["type"] = "lead";
  let entityId = leadId ?? contactId ?? propertyId ?? "";

  if (leadId) {
    const { data: lead } = await admin
      .from("leads")
      .select("id,name")
      .eq("id", leadId)
      .eq("organization_id", org)
      .maybeSingle();
    if (!lead) return { ok: false, message: "Leadul nu există în agenția ta." };
    label = lead.name;
    entityType = "lead";
    entityId = lead.id;
  } else if (contactId) {
    const { data: contact } = await admin
      .from("contacts")
      .select("id,first_name,last_name")
      .eq("id", contactId)
      .eq("organization_id", org)
      .maybeSingle();
    if (!contact) return { ok: false, message: "Clientul nu există în agenția ta." };
    label = `${contact.first_name} ${contact.last_name}`.trim();
    entityType = "contact";
    entityId = contact.id;
  } else if (propertyId) {
    const { data: property } = await admin
      .from("properties")
      .select("id,reference,title")
      .eq("id", propertyId)
      .eq("organization_id", org)
      .maybeSingle();
    if (!property) return { ok: false, message: "Proprietatea nu există în agenția ta." };
    label = property.reference ?? property.title ?? "Proprietate";
    entityType = "property";
    entityId = property.id;
  }

  const dueAt = tool === "create_task" ? String(data["dueAt"]) : null;
  changes.push({
    field: tool === "create_task" ? "activity" : "note",
    label: tool === "create_task" ? "Activitate nouă" : "Notă nouă",
    from: null,
    to: String(data["title"]),
  });
  if (dueAt) {
    changes.push({ field: "dueAt", label: "Termen", from: null, to: dueAt });
  }

  return {
    ok: true,
    proposal: buildCrmProposal({
      tool,
      args: data,
      entity: { type: entityType, id: entityId, label },
      changes,
      reason,
      dueAt,
    }),
  };
}

/** Contextul CRM al cererii: doar entitatea de focus, pe listă albă de câmpuri. */
async function buildCrmContext(
  admin: Admin,
  actor: AiActor,
  input: { leadId: string | null; contactId: string | null },
) {
  const { executeAiTool } = await import("../../tools/executors.server");
  let lead: Record<string, unknown> | null = null;
  let client: Record<string, unknown> | null = null;
  if (input.leadId) {
    const result = await executeAiTool(actor, "get_crm_lead", { leadId: input.leadId });
    if (result.ok) lead = result.data as Record<string, unknown>;
  }
  if (input.contactId) {
    const result = await executeAiTool(actor, "get_crm_contact", { contactId: input.contactId });
    if (result.ok) client = result.data as Record<string, unknown>;
  }
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", actor.organizationId)
    .maybeSingle();
  return buildAiContext({ organizationName: org?.name ?? null, lead, client });
}

/**
 * Un tur complet al CRM Agent: răspunde la întrebare cu date reale și, dacă
 * utilizatorul a cerut o modificare, creează un flux SUSPENDAT cu propunerea.
 * Nicio dată CRM nu se modifică în acest pas.
 */
export async function runCrmTurn(
  actor: AiActor,
  input: { question: string; leadId?: string | null; contactId?: string | null },
): Promise<CrmTurnResult> {
  const started = Date.now();
  const filters = parseCrmQuery(input.question);
  const base: CrmTurnResult = {
    status: "failed",
    answer: "",
    toolCalls: [],
    sources: [],
    warnings: [],
    contextUsed: [],
    intent: filters.intent,
    run: null,
  };

  const validation = validateAiRequestSize(input.question);
  if (!validation.ok) return { ...base, message: validation.message };

  const { resolveAiProvider } = await import("../../providers/registry.server");
  const provider = resolveAiProvider();
  if (!provider) {
    return { ...base, status: "not_configured", message: "AI nu este configurat." };
  }

  const admin = await loadAdmin();
  const { checkAiQuota } = await import("../../gateway/gateway.server");
  const quota = await checkAiQuota(admin as never, actor, "chat");
  if (!quota.allowed) {
    return {
      ...base,
      status: "rate_limited",
      message: quota.message,
    };
  }


  const traceId = newTraceId();
  const tracer = new AiTracer(traceId, {
    organizationId: actor.organizationId,
    userId: actor.userId,
  });

  let state = initialCrmState(input);
  const { data: created } = await admin
    .from("ai_workflow_runs")
    .insert({
      organization_id: actor.organizationId,
      user_id: actor.userId,
      workflow: HABITOO_CRM_WORKFLOW,
      status: "running",
      current_step: "authenticate",
      state: state as never,
      trace_id: traceId,
    })
    .select("id,status,current_step,state,updated_at")
    .single();
  if (!created) {
    return { ...base, message: "Cererea nu a putut fi pornită. Încearcă din nou." };
  }

  tracer.record("workflow", `${HABITOO_CRM_WORKFLOW}.start`, { details: { runId: created.id } });
  state = completeCrmStep(state, "authenticate");
  state = completeCrmStep(state, "resolve_organization");
  state = { ...state, intent: filters.intent };
  state = completeCrmStep(state, "classify_request");
  tracer.record("step", "classify_request", { details: { intent: filters.intent } });

  const context = await tracer.span("step", "build_context", () =>
    buildCrmContext(admin, actor, {
      leadId: input.leadId ?? null,
      contactId: input.contactId ?? null,
    }),
  );
  state = { ...state, contextCategories: context.categories };
  state = completeCrmStep(state, "build_context");

  const outcome = await runCrmAgent({
    actor,
    provider,
    context,
    filters: filters as unknown as Record<string, unknown>,
    question: input.question,
    history: [],
    tracer,
    conversationId: null,
  });
  state = {
    ...state,
    readSummary:
      outcome.toolCalls.map((call) => `${call.name}: ${call.summary}`).join(" · ") || null,
  };
  state = completeCrmStep(state, "read_tools");
  state = completeCrmStep(state, "analyze");

  const latencyMs = Date.now() - started;
  const success = outcome.failure === null && outcome.answer.trim() !== "";

  await writeAiUsage(admin as never, {
    organization_id: actor.organizationId,
    user_id: actor.userId,
    provider: provider.id,
    model: provider.model,
    capability: "crm_agent",
    input_tokens: outcome.inputTokens,
    output_tokens: outcome.outputTokens,
    latency_ms: latencyMs,
    success,
    tool_calls: outcome.toolCalls.length,
  });

  if (!success) {
    state = { ...state, notes: [...state.notes, "Agentul nu a putut finaliza analiza."] };
    await persist(admin, actor, created.id, state, outcome.failure ?? "failed");
    tracer.record("error", HABITOO_CRM_AGENT, { status: "failed" });
    await writeTraceEvents(tracer.list());
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AI_AUDIT_ACTIONS.chatFailed,
      details: { agent: HABITOO_CRM_AGENT, traceId, runId: created.id },
    });
    return {
      ...base,
      status: "failed",
      toolCalls: outcome.toolCalls,
      warnings: outcome.warnings,
      message:
        outcome.failure ??
        "Serviciul AI nu a putut finaliza analiza. Datele CRM nu au fost modificate.",
    };
  }

  state = { ...state, answer: outcome.answer };
  state = completeCrmStep(state, "respond");

  // Propunere de acțiune doar când utilizatorul a cerut explicit o modificare.
  let proposalMessage: string | null = null;
  if (requestsCrmAction(input.question)) {
    const proposalRequest = await proposeCrmAction({
      actor,
      provider,
      context,
      question: input.question,
      readSummary: state.readSummary ?? "",
      tracer,
    });
    if (proposalRequest.ok) {
      const described = await describeProposal(
        admin,
        actor,
        proposalRequest.request.tool,
        proposalRequest.request.data,
        `Cerut de utilizator: „${input.question.slice(0, 160)}”`,
      );
      if (described.ok) {
        state = { ...state, proposal: described.proposal, step: "approval" };
        state = {
          ...state,
          completed: [...new Set([...state.completed, "action_proposal"])] as typeof state.completed,
        };
        tracer.record("step", "action_proposal", {
          details: { tool: described.proposal.tool, entity: described.proposal.entity.type },
        });
        tracer.record("workflow", `${HABITOO_CRM_WORKFLOW}.suspended`, {
          details: { step: "approval" },
        });
        await logAiAudit({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          action: AI_AUDIT_ACTIONS.crmActionProposed,
          details: {
            tool: described.proposal.tool,
            entityId: described.proposal.entity.id,
            runId: created.id,
            traceId,
          },
        });
      } else {
        proposalMessage = described.message;
      }
    } else {
      proposalMessage = proposalRequest.message;
    }
  }

  // Utilizatorul a cerut o modificare, dar nu s-a putut construi o propunere:
  // fluxul eșuează explicit, ca să nu pară că acțiunea a fost tratată.
  const actionRequestedButNotProposed = requestsCrmAction(input.question) && state.proposal === null;
  if (actionRequestedButNotProposed) {
    const message =
      proposalMessage ??
      "Nu am putut pregăti acțiunea cerută. Datele CRM nu au fost modificate.";
    state = failCrmState(state, message);
    await persist(admin, actor, created.id, state, message);
    tracer.record("error", HABITOO_CRM_AGENT, { status: "failed", details: { step: "action_proposal" } });
    await writeTraceEvents(tracer.list());
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AI_AUDIT_ACTIONS.crmActionFailed,
      details: { agent: HABITOO_CRM_AGENT, runId: created.id, traceId },
    });
    return {
      ...base,
      status: "failed",
      answer: outcome.answer,
      toolCalls: outcome.toolCalls,
      sources: outcome.sources,
      contextUsed: context.categories,
      intent: filters.intent,
      warnings: outcome.warnings,
      message,
    };
  }

  if (state.proposal === null) {
    state = finishWithoutAction(state);
    if (proposalMessage) state = { ...state, notes: [...state.notes, proposalMessage] };
  }

  await persist(admin, actor, created.id, state);
  tracer.record("agent", `${HABITOO_CRM_AGENT}.done`, {
    latencyMs,
    details: { tools: outcome.toolCalls.length, proposal: state.proposal?.tool ?? null },
  });
  await writeTraceEvents(tracer.list());
  await logAiAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: AI_AUDIT_ACTIONS.crmRequest,
    details: {
      agent: HABITOO_CRM_AGENT,
      intent: filters.intent,
      tools: outcome.toolCalls.map((call) => call.name),
      runId: created.id,
      traceId,
      latencyMs,
    },
  });

  return {
    status: "ok",
    answer: outcome.answer,
    toolCalls: outcome.toolCalls,
    sources: outcome.sources,
    warnings: proposalMessage ? [...outcome.warnings, proposalMessage] : outcome.warnings,
    contextUsed: context.categories,
    intent: filters.intent,
    run: view({
      id: created.id,
      status: statusOfCrmState(state),
      current_step: state.step,
      state: state as never,
      updated_at: new Date().toISOString(),
    }),
  };
}

/**
 * RESUME după decizia umană. Fără aprobare explicită nu se execută nimic:
 * `approvalGranted` este stabilit aici, în cod, nu de model.
 *
 * Orice eroare neașteptată readuce rularea în `suspended`, ca utilizatorul să
 * nu rămână cu o rulare pe care nu o mai poate decide.
 */
export async function resumeCrmWorkflow(
  actor: AiActor,
  runId: string,
  approved: boolean,
): Promise<{ ok: true; run: CrmRunView } | { ok: false; message: string }> {
  try {
    return await resumeCrmWorkflowClaimed(actor, runId, approved);
  } catch (error) {
    console.error("[ai-crm] resume failed", error);
    const admin = await loadAdmin();
    await releaseClaimedRun(admin, {
      runId,
      organizationId: actor.organizationId,
      userId: actor.userId,
    });
    return {
      ok: false,
      message:
        "Decizia nu a putut fi procesată. Propunerea a rămas în așteptare, poți încerca din nou.",
    };
  }
}

async function resumeCrmWorkflowClaimed(
  actor: AiActor,
  runId: string,
  approved: boolean,
): Promise<{ ok: true; run: CrmRunView } | { ok: false; message: string }> {

  const admin = await loadAdmin();
  // Protecție la dublu-click: aprobarea se consumă atomic (update condiționat),
  // deci o a doua cerere paralelă nu execută nimic.
  const row = await claimSuspendedRun<{
    id: string;
    workflow: string;
    status: string;
    current_step: string;
    state: unknown;
    trace_id: string | null;
    updated_at: string;
  }>(admin, {
    runId,
    organizationId: actor.organizationId,
    userId: actor.userId,
    workflow: HABITOO_CRM_WORKFLOW,
    columns: "id,workflow,status,current_step,state,trace_id,updated_at",
  });
  if (!row) {
    return { ok: false, message: APPROVAL_ALREADY_APPLIED };
  }

  const tracer = new AiTracer(row.trace_id ?? newTraceId(), {
    organizationId: actor.organizationId,
    userId: actor.userId,
    runId: row.id,
  });
  tracer.record("workflow", `${HABITOO_CRM_WORKFLOW}.resume`, { details: { approved } });

  let state = applyCrmApproval(row.state as unknown as CrmWorkflowState, approved);
  if (state.approval === null) {
    return { ok: false, message: "Această acțiune nu mai așteaptă o aprobare." };
  }

  // Amprenta argumentelor: orice modificare a stării după suspendare oprește execuția.
  if (
    state.proposal &&
    !fingerprintMatches(state.proposal.argumentsHash, state.proposal.argumentsJson)
  ) {
    const failed = failCrmState(state, APPROVAL_TAMPERED);
    await persist(admin, actor, row.id, failed, APPROVAL_TAMPERED);
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AI_AUDIT_ACTIONS.crmActionFailed,
      details: { runId: row.id, reason: "arguments_tampered" },
    });
    return { ok: false, message: APPROVAL_TAMPERED };
  }

  if (isCrmActionAllowed(state) && state.proposal) {
    const proposal = state.proposal;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(proposal.argumentsJson) as Record<string, unknown>;
    } catch {
      args = {};
    }
    const { executeAiTool } = await import("../../tools/executors.server");
    const execution = await tracer.span("tool", proposal.tool, () =>
      executeAiTool(actor, proposal.tool, args, { approvalGranted: true }),
    );
    const duplicate =
      execution.ok &&
      typeof execution.data === "object" &&
      execution.data !== null &&
      (execution.data as { duplicate?: boolean }).duplicate === true;
    state = {
      ...state,
      execution: {
        ok: execution.ok,
        message: execution.ok ? execution.summary : execution.error,
        entityId: execution.ok
          ? (((execution.data as { id?: string | null } | null)?.id ?? null) as string | null)
          : null,
        duplicate,
        code: execution.ok ? null : execution.code,
      },
    };
    state = completeCrmStep(state, "execute_action");
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: execution.ok
        ? AI_AUDIT_ACTIONS.crmActionApproved
        : AI_AUDIT_ACTIONS.crmActionFailed,
      details: {
        tool: proposal.tool,
        runId: row.id,
        duplicate,
        idempotency: crmActionIdempotencyKey(actor.organizationId, proposal),
      },
    });
  } else {
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AI_AUDIT_ACTIONS.crmActionRejected,
      details: { tool: state.proposal?.tool ?? null, runId: row.id },
    });
  }

  const validation = validateCrmResult(state);
  state = { ...state, notes: [...state.notes, ...validation.notes] };
  state = completeCrmStep(state, "validate");
  state = completeCrmStep(state, "audit");
  state = {
    ...state,
    step: "complete",
    completed: [...new Set([...state.completed, "complete"])] as typeof state.completed,
    answer:
      state.execution?.ok === true
        ? `${state.answer ?? ""}\n\n${state.execution.message}`.trim()
        : approved
          ? (state.execution?.message ?? state.answer)
          : `${state.answer ?? ""}\n\nAcțiunea propusă a fost respinsă. Nicio dată nu a fost modificată.`.trim(),
  };

  await persist(admin, actor, row.id, state);
  tracer.record("workflow", `${HABITOO_CRM_WORKFLOW}.completed`, {
    status: state.execution?.ok === false ? "failed" : "ok",
  });
  await writeTraceEvents(tracer.list());

  return {
    ok: true,
    run: view({
      id: row.id,
      status: statusOfCrmState(state),
      current_step: state.step,
      state: state as never,
      updated_at: new Date().toISOString(),
    }),
  };
}

export async function getCrmRun(actor: AiActor, runId: string): Promise<CrmRunView | null> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("ai_workflow_runs")
    .select("id,workflow,status,current_step,state,updated_at")
    .eq("id", runId)
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .eq("workflow", HABITOO_CRM_WORKFLOW)
    .maybeSingle();
  return data ? view(data) : null;
}

export async function listCrmRuns(actor: AiActor, limit = 10): Promise<CrmRunView[]> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("ai_workflow_runs")
    .select("id,workflow,status,current_step,state,updated_at")
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .eq("workflow", HABITOO_CRM_WORKFLOW)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(view);
}
