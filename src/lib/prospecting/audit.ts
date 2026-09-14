/**
 * Audit pentru prospecting. Înregistrăm cine a cerut ce și ce s-a decis —
 * niciodată chei, secrete sau date de contact complete.
 */
import { scrubAuditDetails } from "@/lib/ai/security/audit";

export const PROSPECTING_AUDIT_ACTIONS = {
  searchCreated: "prospecting.search.created",
  runStarted: "prospecting.run.started",
  runCompleted: "prospecting.run.completed",
  prospectApproved: "prospecting.prospect.approved",
  prospectRejected: "prospecting.prospect.rejected",
  prospectImported: "prospecting.prospect.imported",
  prospectLinked: "prospecting.prospect.linked",
  actionDenied: "prospecting.action.denied",
} as const;

export type ProspectingAuditAction =
  (typeof PROSPECTING_AUDIT_ACTIONS)[keyof typeof PROSPECTING_AUDIT_ACTIONS];

export type ProspectingAuditParams = {
  organizationId: string | null | undefined;
  actorId: string | null | undefined;
  action: ProspectingAuditAction;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
};

export type ProspectingAuditRow = {
  organization_id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  new_values: Record<string, unknown> | null;
};

/** Telefonul este PII: nu ajunge niciodată în audit. */
const PII_KEYS = /(phone|telefon|email|whatsapp)/i;

export function buildProspectingAuditRow(
  params: ProspectingAuditParams,
): ProspectingAuditRow | null {
  if (!params.organizationId) return null;
  const scrubbed = scrubAuditDetails(params.details);
  const safe = scrubbed
    ? Object.fromEntries(Object.entries(scrubbed).filter(([key]) => !PII_KEYS.test(key)))
    : null;
  return {
    organization_id: params.organizationId,
    actor_id: params.actorId ?? null,
    action: params.action,
    entity: "prospecting",
    entity_id: params.entityId ?? null,
    new_values: safe,
  };
}

export async function logProspectingAudit(params: ProspectingAuditParams): Promise<void> {
  const row = buildProspectingAuditRow(params);
  if (!row) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_logs").insert(row as never);
    if (error) console.error("[prospecting] audit insert failed", error.message);
  } catch (error) {
    console.error("[prospecting] audit client unavailable", error);
  }
}
