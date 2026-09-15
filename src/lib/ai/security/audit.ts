/**
 * Audit pentru cererile AI. Înregistrăm cine a cerut ce, cu ce provider și cu
 * ce rezultat — niciodată chei, secrete sau conținutul integral al promptului.
 */
export const AI_AUDIT_ACTIONS = {
  chatRequest: "ai.chat.request",
  chatFailed: "ai.chat.failed",
  toolExecuted: "ai.tool.executed",
  toolDenied: "ai.tool.denied",
  workflowStarted: "ai.workflow.started",
  workflowApproved: "ai.workflow.approved",
  workflowRejected: "ai.workflow.rejected",
  /* CRM Agent (Stage 14) */
  crmRequest: "ai.crm.request",
  crmActionProposed: "ai.crm.action.proposed",
  crmActionApproved: "ai.crm.action.approved",
  crmActionRejected: "ai.crm.action.rejected",
  crmActionExecuted: "ai.crm.action.executed",
  crmActionFailed: "ai.crm.action.failed",
  crmActionDenied: "ai.crm.action.denied",
  /* Marketing Agent (Stage 16) */
  marketingRequest: "ai.marketing.request",
  marketingFailed: "ai.marketing.failed",
  marketingValidationFailed: "ai.marketing.validation.failed",
  marketingActionProposed: "ai.marketing.action.proposed",
  marketingActionApproved: "ai.marketing.action.approved",
  marketingActionRejected: "ai.marketing.action.rejected",
  marketingActionFailed: "ai.marketing.action.failed",
  /* Habitoo Manager Agent (Stage 17) */
  managerRunStarted: "ai.manager.run.started",
  managerRunFinished: "ai.manager.run.finished",
  managerRunFailed: "ai.manager.run.failed",
  managerApprovalRequested: "ai.manager.approval.requested",
  managerApprovalGranted: "ai.manager.approval.granted",
  managerApprovalRejected: "ai.manager.approval.rejected",
  managerActionFailed: "ai.manager.action.failed",
} as const;

export type AiAuditAction = (typeof AI_AUDIT_ACTIONS)[keyof typeof AI_AUDIT_ACTIONS];

export type AiAuditParams = {
  organizationId: string | null | undefined;
  actorId: string | null | undefined;
  action: AiAuditAction;
  conversationId?: string | null;
  details?: Record<string, unknown> | null;
};

export type AiAuditRow = {
  organization_id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  new_values: Record<string, unknown> | null;
};

const SECRET_KEY = /(key|secret|token|password|apikey)/i;

/** Elimină orice câmp care ar putea conține un secret și scurtează textele. */
export function scrubAuditDetails(
  details: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!details) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SECRET_KEY.test(key)) continue;
    if (typeof value === "string") {
      out[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function buildAiAuditRow(params: AiAuditParams): AiAuditRow | null {
  if (!params.organizationId) return null;
  return {
    organization_id: params.organizationId,
    actor_id: params.actorId ?? null,
    action: params.action,
    entity: "ai_conversation",
    entity_id: params.conversationId ?? null,
    new_values: scrubAuditDetails(params.details),
  };
}

type AuditWriter = {
  from: (table: "audit_logs") => {
    insert: (row: AiAuditRow) => Promise<{ error: { message: string } | null }>;
  };
};

export async function writeAiAudit(client: AuditWriter, params: AiAuditParams): Promise<boolean> {
  const row = buildAiAuditRow(params);
  if (!row) return false;
  try {
    const { error } = await client.from("audit_logs").insert(row);
    if (error) {
      console.error("[ai] audit insert failed", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[ai] audit insert threw", error);
    return false;
  }
}

/** Înregistrează o acțiune AI (best-effort, cu clientul de serviciu). */
export async function logAiAudit(params: AiAuditParams): Promise<void> {
  if (!buildAiAuditRow(params)) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await writeAiAudit(supabaseAdmin as unknown as AuditWriter, params);
  } catch (error) {
    console.error("[ai] audit client unavailable", error);
  }
}
