/**
 * Runtime-ul `habitooMarketingWorkflow` (Stage 16).
 *
 * Generarea este preview: nu scrie nimic. Salvarea ciornei și aplicarea
 * textului peste anunț sunt scrieri reversibile și trec prin aprobare umană.
 * Starea trăiește în `ai_workflow_runs`, deci o propunere suspendată
 * supraviețuiește reîncărcării paginii și repornirii serverului.
 */
import type { AiActor } from "../../gateway/types";
import { AI_AUDIT_ACTIONS, logAiAudit } from "../../security/audit";
import {
  APPROVAL_ALREADY_APPLIED,
  APPROVAL_TAMPERED,
  argumentsFingerprint,
  claimSuspendedRun,
  fingerprintMatches,
} from "../../security/approval";
import { AiTracer, newTraceId } from "../../tracing/trace";
import { writeTraceEvents } from "../../tracing/trace.server";
import { writeAiUsage } from "../../usage/tracking.server";
import { validateAiRequestSize } from "../../usage/limits";
import { AI_CONTEXT_VERSION } from "../../context/builder";
import {
  MARKETING_CHANNEL_SPECS,
  MARKETING_CONTENT_TYPE_LABELS,
  type MarketingChannel,
  type MarketingContentType,
  type MarketingLength,
  type MarketingTone,
} from "./channels";
import { generateMarketingContent, HABITOO_MARKETING_AGENT } from "./agent.server";
import { marketingBrandingFor, marketingContextFor } from "./tools.server";
import {
  applyMarketingApproval,
  completeMarketingStep,
  failMarketingState,
  finishMarketingPreview,
  HABITOO_MARKETING_WORKFLOW,
  initialMarketingState,
  isMarketingActionAllowed,
  statusOfMarketingState,
  suspendForMarketingApproval,
  validateMarketingResult,
  type MarketingMode,
  type MarketingResult,
  type MarketingWorkflowState,
  type MarketingWorkflowStatus,
} from "./workflow";

/** Maximum de proprietăți per cerere: fiecare rezultat rămâne legat de ID-ul ei. */
export const MARKETING_MAX_PROPERTIES = 5;

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof loadAdmin>>;

export type MarketingRunView = {
  id: string;
  status: MarketingWorkflowStatus;
  currentStep: string;
  input: MarketingWorkflowState["input"];
  results: MarketingResult[];
  failures: MarketingWorkflowState["failures"];
  proposal: MarketingWorkflowState["proposal"];
  proposalLabel: string | null;
  approved: boolean | null;
  execution: MarketingWorkflowState["execution"];
  notes: string[];
  message: string | null;
  updatedAt: string;
};

export type MarketingTurnResult = {
  status: "ok" | "not_configured" | "rate_limited" | "failed";
  run: MarketingRunView | null;
  message?: string;
};

const MODE_LABELS: Record<MarketingMode, string> = {
  save_draft: "Salvare ciornă de marketing",
  apply_to_property: "Aplicarea textului pe proprietate",
};

function view(row: {
  id: string;
  status: string;
  current_step: string;
  state: unknown;
  error_message?: string | null;
  updated_at: string;
}): MarketingRunView {
  const state = (row.state ?? {}) as MarketingWorkflowState;
  return {
    id: row.id,
    status: statusOfMarketingState(state),
    currentStep: state.step ?? row.current_step,
    input: state.input,
    results: state.results ?? [],
    failures: state.failures ?? [],
    proposal: state.proposal ?? null,
    proposalLabel: state.proposal ? MODE_LABELS[state.proposal.mode] : null,
    approved: state.approval ? state.approval.approved : null,
    execution: state.execution ?? null,
    notes: state.notes ?? [],
    message: state.failure ?? row.error_message ?? null,
    updatedAt: row.updated_at,
  };
}

async function persist(
  admin: Admin,
  actor: AiActor,
  runId: string,
  state: MarketingWorkflowState,
  errorMessage: string | null = null,
): Promise<void> {
  await admin
    .from("ai_workflow_runs")
    .update({
      status: statusOfMarketingState(state),
      current_step: state.step,
      state: state as never,
      pending_approval: (state.proposal ?? null) as never,
      result: state.results.length > 0 ? ({ results: state.results.length } as never) : null,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId);
}

export type MarketingTurnInput = {
  propertyIds: string[];
  channel: MarketingChannel;
  contentType: MarketingContentType;
  tone: MarketingTone;
  length: MarketingLength;
  notes?: string | null;
};

/**
 * Un tur de generare: context pe listă albă → generare → verificare factuală.
 * Nicio dată nu se modifică în acest pas.
 */
export async function runMarketingTurn(
  actor: AiActor,
  input: MarketingTurnInput,
): Promise<MarketingTurnResult> {
  const started = Date.now();
  const propertyIds = [...new Set(input.propertyIds)].slice(0, MARKETING_MAX_PROPERTIES);
  if (propertyIds.length === 0) {
    return { status: "failed", run: null, message: "Alege cel puțin o proprietate." };
  }
  if (input.notes) {
    const size = validateAiRequestSize(input.notes);
    if (!size.ok) return { status: "failed", run: null, message: size.message };
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


  const traceId = newTraceId();
  const tracer = new AiTracer(traceId, {
    organizationId: actor.organizationId,
    userId: actor.userId,
  });

  let state = initialMarketingState({ ...input, propertyIds });
  const { data: created } = await admin
    .from("ai_workflow_runs")
    .insert({
      organization_id: actor.organizationId,
      user_id: actor.userId,
      workflow: HABITOO_MARKETING_WORKFLOW,
      status: "running",
      current_step: "authenticate",
      state: state as never,
      trace_id: traceId,
    })
    .select("id,status,current_step,state,updated_at")
    .single();
  if (!created) {
    return { status: "failed", run: null, message: "Cererea nu a putut fi pornită." };
  }

  tracer.record("workflow", `${HABITOO_MARKETING_WORKFLOW}.start`, {
    details: { runId: created.id, properties: propertyIds.length },
  });
  state = completeMarketingStep(state, "authenticate");
  state = completeMarketingStep(state, "resolve_organization");

  const branding = await marketingBrandingFor(admin, actor);
  const results: MarketingResult[] = [];
  const failures: MarketingWorkflowState["failures"] = [];

  for (const propertyId of propertyIds) {
    const context = await marketingContextFor(admin, actor, propertyId);
    if (!context.ok) {
      failures.push({ propertyId, message: context.error });
      continue;
    }
    const label =
      (typeof context.row["reference"] === "string" ? context.row["reference"] : null) ??
      (typeof context.row["title"] === "string" ? context.row["title"] : null) ??
      "Proprietate";

    const generated = await generateMarketingContent({
      provider,
      tracer,
      facts: context.facts,
      channel: input.channel,
      tone: input.tone,
      length: input.length,
      contentType: input.contentType,
      branding: branding as Record<string, unknown> | null,
      existingText:
        input.contentType === "rewrite"
          ? ((context.row["description"] as string | null) ?? null)
          : null,
      notes: input.notes ?? null,
      missing: context.missing,
    });
    if (!generated.ok) {
      failures.push({ propertyId, message: generated.message });
      continue;
    }
    results.push({
      propertyId,
      propertyLabel: label,
      channel: input.channel,
      contentType: input.contentType,
      tone: input.tone,
      length: input.length,
      content: generated.result.content,
      validationStatus: generated.result.validation.status,
      issues: generated.result.validation.issues,
      missingData: context.missing,
      contextVersion: AI_CONTEXT_VERSION,
      contextHash: context.contextHash,
      provider: provider.id,
      model: provider.model,
      draftId: null,
    });
    if (generated.result.validation.status === "invalid") {
      await logAiAudit({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: AI_AUDIT_ACTIONS.marketingValidationFailed,
        details: {
          runId: created.id,
          propertyId,
          issues: generated.result.validation.issues.length,
        },
      });
    }
  }

  state = { ...state, results, failures };
  state = completeMarketingStep(state, "resolve_properties");
  state = completeMarketingStep(state, "build_context");
  state = completeMarketingStep(state, "generate");
  state = completeMarketingStep(state, "validate_facts");

  const latencyMs = Date.now() - started;
  await writeAiUsage(admin as never, {
    organization_id: actor.organizationId,
    user_id: actor.userId,
    provider: provider.id,
    model: provider.model,
    capability: "marketing_agent",
    input_tokens: null,
    output_tokens: null,
    latency_ms: latencyMs,
    success: results.length > 0,
    tool_calls: propertyIds.length,
  });

  if (results.length === 0) {
    const message = failures[0]?.message ?? "Conținutul nu a putut fi generat.";
    state = failMarketingState(state, message);
    await persist(admin, actor, created.id, state, message);
    tracer.record("error", HABITOO_MARKETING_AGENT, { status: "failed" });
    await writeTraceEvents(tracer.list());
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AI_AUDIT_ACTIONS.marketingFailed,
      details: { runId: created.id, traceId },
    });
    return {
      status: "failed",
      run: view({ ...created, state: state as never, updated_at: new Date().toISOString() }),
      message,
    };
  }

  state = finishMarketingPreview(state);
  await persist(admin, actor, created.id, state);
  tracer.record("agent", `${HABITOO_MARKETING_AGENT}.done`, {
    latencyMs,
    details: { results: results.length, failures: failures.length },
  });
  await writeTraceEvents(tracer.list());
  await logAiAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: AI_AUDIT_ACTIONS.marketingRequest,
    details: {
      runId: created.id,
      traceId,
      channel: input.channel,
      contentType: input.contentType,
      properties: propertyIds.length,
      invalid: results.filter((item) => item.validationStatus === "invalid").length,
      latencyMs,
    },
  });

  return {
    status: "ok",
    run: view({ ...created, state: state as never, updated_at: new Date().toISOString() }),
  };
}

async function loadRun(admin: Admin, actor: AiActor, runId: string) {
  const { data } = await admin
    .from("ai_workflow_runs")
    .select("id,workflow,status,current_step,state,trace_id,error_message,updated_at")
    .eq("id", runId)
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .maybeSingle();
  if (!data || data.workflow !== HABITOO_MARKETING_WORKFLOW) return null;
  return data;
}

export type MarketingDecision =
  | { ok: true; run: MarketingRunView }
  | { ok: false; message: string };

/**
 * Pregătește propunerea de scriere (ciornă sau aplicare) și SUSPENDĂ fluxul.
 * Un rezultat respins de verificarea factuală nu poate fi propus.
 */
export async function proposeMarketingWrite(
  actor: AiActor,
  runId: string,
  input: { resultIndex: number; mode: MarketingMode; draftId?: string | null },
): Promise<MarketingDecision> {
  const admin = await loadAdmin();
  const row = await loadRun(admin, actor, runId);
  if (!row) return { ok: false, message: "Cererea nu a fost găsită." };
  if (row.status === "suspended") {
    return { ok: false, message: "Există deja o propunere care așteaptă decizia ta." };
  }

  const state = row.state as unknown as MarketingWorkflowState;
  const result = state.results?.[input.resultIndex];
  if (!result) return { ok: false, message: "Rezultatul nu a fost găsit." };
  if (result.validationStatus === "invalid") {
    return {
      ok: false,
      message: "Textul nu a trecut verificarea factuală. Regenerează-l înainte de a-l salva.",
    };
  }

  const spec = MARKETING_CHANNEL_SPECS[result.channel];
  let args: Record<string, unknown>;
  let changes: { label: string; from: string | null; to: string }[];
  let warnings: string[];

  if (input.mode === "save_draft") {
    args = {
      propertyId: result.propertyId,
      channel: result.channel,
      contentType: result.contentType,
      tone: result.tone,
      length: result.length,
      title: result.content.title,
      body: result.content.body,
      shortVariants: result.content.shortVariants,
      cta: result.content.cta,
      hashtags: result.content.hashtags,
      missingData: result.missingData,
      validationStatus: result.validationStatus,
      validationIssues: result.issues,
      contextVersion: result.contextVersion,
      contextHash: result.contextHash,
      contextSnapshot: { channel: result.channel, contentType: result.contentType },
      provider: result.provider,
      model: result.model,
      runId: row.id,
    };
    changes = [
      {
        label: `Ciornă ${spec.label} · ${MARKETING_CONTENT_TYPE_LABELS[result.contentType]}`,
        from: null,
        to: result.content.title ?? result.content.body.slice(0, 120),
      },
    ];
    warnings = ["Ciorna se salvează versionat. Anunțul publicat rămâne neschimbat."];
  } else {
    // Ciorna aplicată este cea generată în această rulare: un `draftId` trimis
    // de client NU poate alege alt text.
    const draftId = result.draftId;
    if (!draftId) {
      return { ok: false, message: "Salvează mai întâi ciorna, apoi o poți aplica." };
    }
    // Se aprobă textul exact, nu un identificator: titlul și corpul intră în
    // argumente și sunt verificate la execuție față de ciorna salvată.
    args = {
      propertyId: result.propertyId,
      draftId,
      title: result.content.title ?? null,
      body: result.content.body,
    };
    const { data: property } = await admin
      .from("properties")
      .select("title,description")
      .eq("id", result.propertyId)
      .eq("organization_id", actor.organizationId)
      .maybeSingle();
    changes = [
      {
        label: "Titlu proprietate",
        from: property?.title ?? null,
        to: result.content.title ?? property?.title ?? "",
      },
      {
        label: "Descriere proprietate",
        from: property?.description ? `${property.description.slice(0, 120)}…` : null,
        to: `${result.content.body.slice(0, 120)}…`,
      },
    ];
    warnings = [
      "Textul înlocuiește descrierea actuală a proprietății. Nu se publică nimic pe portaluri.",
    ];
  }

  const argumentsJson = JSON.stringify(args);
  const next = suspendForMarketingApproval(state, {
    mode: input.mode,
    tool: input.mode === "save_draft" ? "save_marketing_draft" : "apply_marketing_draft",
    resultIndex: input.resultIndex,
    propertyId: result.propertyId,
    propertyLabel: result.propertyLabel,
    argumentsJson,
    argumentsHash: argumentsFingerprint(argumentsJson),
    changes,
    warnings,
  });

  await persist(admin, actor, row.id, next);
  await logAiAudit({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: AI_AUDIT_ACTIONS.marketingActionProposed,
    details: { runId: row.id, mode: input.mode, propertyId: result.propertyId },
  });

  return {
    ok: true,
    run: view({ ...row, state: next as never, updated_at: new Date().toISOString() }),
  };
}

/**
 * RESUME după decizia umană. Fără aprobare explicită nu se scrie nimic:
 * `approvalGranted` este stabilit aici, în cod, nu de model.
 */
export async function decideMarketingWrite(
  actor: AiActor,
  runId: string,
  approved: boolean,
): Promise<MarketingDecision> {
  const admin = await loadAdmin();
  // Protecție la dublu-click: aprobarea se consumă atomic, deci o a doua cerere
  // paralelă nu mai execută nimic.
  const row = await claimSuspendedRun<{
    id: string;
    workflow: string;
    status: string;
    current_step: string;
    state: unknown;
    trace_id: string | null;
    error_message: string | null;
    updated_at: string;
  }>(admin, {
    runId,
    organizationId: actor.organizationId,
    userId: actor.userId,
    workflow: HABITOO_MARKETING_WORKFLOW,
    columns: "id,workflow,status,current_step,state,trace_id,error_message,updated_at",
  });
  if (!row) return { ok: false, message: APPROVAL_ALREADY_APPLIED };

  const tracer = new AiTracer(row.trace_id ?? newTraceId(), {
    organizationId: actor.organizationId,
    userId: actor.userId,
    runId: row.id,
  });
  tracer.record("workflow", `${HABITOO_MARKETING_WORKFLOW}.resume`, { details: { approved } });

  let state = applyMarketingApproval(row.state as unknown as MarketingWorkflowState, approved);
  if (state.approval === null) {
    return { ok: false, message: "Această acțiune nu mai așteaptă o aprobare." };
  }

  // Amprenta argumentelor: dacă starea a fost modificată după suspendare, nu se execută nimic.
  if (
    state.proposal &&
    !fingerprintMatches(state.proposal.argumentsHash, state.proposal.argumentsJson)
  ) {
    const failed = failMarketingState(state, APPROVAL_TAMPERED);
    await persist(admin, actor, row.id, failed, APPROVAL_TAMPERED);
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AI_AUDIT_ACTIONS.marketingActionFailed,
      details: { runId: row.id, reason: "arguments_tampered" },
    });
    return { ok: false, message: APPROVAL_TAMPERED };
  }

  if (isMarketingActionAllowed(state) && state.proposal) {
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
    const entityId = execution.ok
      ? (((execution.data as { id?: string | null } | null)?.id ?? null) as string | null)
      : null;
    state = {
      ...state,
      execution: {
        ok: execution.ok,
        message: execution.ok ? execution.summary : execution.error,
        entityId,
        code: execution.ok ? null : execution.code,
      },
      results: state.results.map((item, index) =>
        index === proposal.resultIndex && proposal.mode === "save_draft" && execution.ok
          ? { ...item, draftId: entityId }
          : item,
      ),
    };
    state = completeMarketingStep(state, "persist");
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: execution.ok
        ? AI_AUDIT_ACTIONS.marketingActionApproved
        : AI_AUDIT_ACTIONS.marketingActionFailed,
      details: {
        runId: row.id,
        mode: proposal.mode,
        propertyId: proposal.propertyId,
        draftId: entityId,
      },
    });
  } else {
    await logAiAudit({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AI_AUDIT_ACTIONS.marketingActionRejected,
      details: { runId: row.id, mode: state.proposal?.mode ?? null },
    });
  }

  const validation = validateMarketingResult(state);
  state = { ...state, notes: [...state.notes, ...validation.notes] };
  state = completeMarketingStep(state, "validate");
  state = completeMarketingStep(state, "audit");
  state = { ...state, step: "complete", proposal: null };

  await persist(admin, actor, row.id, state);
  tracer.record("workflow", `${HABITOO_MARKETING_WORKFLOW}.completed`, {
    status: state.execution?.ok === false ? "failed" : "ok",
  });
  await writeTraceEvents(tracer.list());

  return {
    ok: true,
    run: view({ ...row, state: state as never, updated_at: new Date().toISOString() }),
  };
}

export async function listMarketingRuns(actor: AiActor, limit = 10): Promise<MarketingRunView[]> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("ai_workflow_runs")
    .select("id,workflow,status,current_step,state,error_message,updated_at")
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .eq("workflow", HABITOO_MARKETING_WORKFLOW)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(view);
}

export type MarketingDraftView = {
  id: string;
  version: number;
  channel: string;
  contentType: string;
  tone: string;
  title: string | null;
  body: string;
  validationStatus: string;
  appliedAt: string | null;
  createdAt: string;
};

/** Istoricul ciornelor unei proprietăți: versiuni, niciodată suprascrise. */
export async function listMarketingDrafts(
  actor: AiActor,
  propertyId: string,
  limit = 20,
): Promise<MarketingDraftView[]> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("marketing_drafts")
    .select(
      "id,version,channel,content_type,tone,title,body,validation_status,applied_at,created_at",
    )
    .eq("organization_id", actor.organizationId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    version: row.version,
    channel: row.channel,
    contentType: row.content_type,
    tone: row.tone,
    title: row.title,
    body: row.body,
    validationStatus: row.validation_status,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
  }));
}
