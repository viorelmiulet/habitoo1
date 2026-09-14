/**
 * Puncte de integrare pentru auditul ACP. Nu logăm SELECT-uri: doar acțiunile
 * care schimbă starea unei analize sau produc un livrabil. Folosim
 * infrastructura de audit existentă (`audit_logs` prin `logAudit`).
 */
import { logAudit } from "@/lib/crm";

export const ACP_AUDIT_ACTIONS = {
  analysisCreated: "acp.analysis.created",
  analysisRun: "acp.analysis.run",
  analysisUpdated: "acp.analysis.updated",
  reportGenerated: "acp.report.generated",
  reportAccessed: "acp.report.accessed",
  aiGenerated: "acp.ai.generated",
  versionCreated: "acp.version.created",
  versionFailed: "acp.version.failed",
  versionsCompared: "acp.versions.compared",
} as const;


export type AcpAuditAction = (typeof ACP_AUDIT_ACTIONS)[keyof typeof ACP_AUDIT_ACTIONS];

/** Înregistrează o acțiune ACP în jurnalul de audit (best-effort). */
export async function logAcpAudit(params: {
  organizationId: string | null | undefined;
  actorId: string | null | undefined;
  action: AcpAuditAction;
  analysisId?: string | null;
  details?: Record<string, unknown> | null;
}) {
  await logAudit({
    organizationId: params.organizationId,
    actorId: params.actorId,
    action: params.action,
    entity: "acp_analysis",
    entityId: params.analysisId ?? null,
    newValues: params.details ?? null,
  });
}
