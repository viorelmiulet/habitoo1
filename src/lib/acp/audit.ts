/**
 * Puncte de integrare pentru auditul ACP. Nu logăm SELECT-uri: doar acțiunile
 * care schimbă starea unei analize sau produc un livrabil.
 *
 * Stage 9: rulările ACP se execută în server functions, unde clientul public
 * nu are sesiunea utilizatorului, deci un insert prin acel client era respins
 * de RLS și pierdut silențios. Scriem direct cu clientul de serviciu, păstrând
 * organizația și actorul verificate deja de server function.
 */

export const ACP_AUDIT_ACTIONS = {
  analysisCreated: "acp.analysis.created",
  analysisRun: "acp.analysis.run",
  analysisUpdated: "acp.analysis.updated",
  reportGenerated: "acp.report.generated",
  reportFailed: "acp.report.failed",
  reportAccessed: "acp.report.accessed",
  aiGenerated: "acp.ai.generated",
  versionCreated: "acp.version.created",
  versionFailed: "acp.version.failed",
  versionsCompared: "acp.versions.compared",
} as const;

export type AcpAuditAction = (typeof ACP_AUDIT_ACTIONS)[keyof typeof ACP_AUDIT_ACTIONS];

export type AcpAuditParams = {
  organizationId: string | null | undefined;
  actorId: string | null | undefined;
  action: AcpAuditAction;
  analysisId?: string | null;
  details?: Record<string, unknown> | null;
};

export type AcpAuditRow = {
  organization_id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  new_values: Record<string, unknown> | null;
};

/** Rândul de audit pentru o acțiune ACP, sau `null` când lipsește agenția. */
export function buildAcpAuditRow(params: AcpAuditParams): AcpAuditRow | null {
  if (!params.organizationId) return null;
  return {
    organization_id: params.organizationId,
    actor_id: params.actorId ?? null,
    action: params.action,
    entity: "acp_analysis",
    entity_id: params.analysisId ?? null,
    new_values: params.details ?? null,
  };
}

type AuditWriter = {
  from: (table: "audit_logs") => {
    insert: (row: AcpAuditRow) => Promise<{ error: { message: string } | null }>;
  };
};

/** Scrie rândul de audit cu un client dat (folosit și în teste). */
export async function writeAcpAudit(
  client: AuditWriter,
  params: AcpAuditParams,
): Promise<boolean> {
  const row = buildAcpAuditRow(params);
  if (!row) return false;
  try {
    const { error } = await client.from("audit_logs").insert(row);
    if (error) {
      console.error("[acp] audit insert failed", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[acp] audit insert threw", error);
    return false;
  }
}

/** Înregistrează o acțiune ACP în jurnalul de audit (best-effort). */
export async function logAcpAudit(params: AcpAuditParams): Promise<void> {
  if (!buildAcpAuditRow(params)) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await writeAcpAudit(supabaseAdmin as unknown as AuditWriter, params);
  } catch (error) {
    console.error("[acp] audit client unavailable", error);
  }
}
