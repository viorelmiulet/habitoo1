/**
 * Execuția programărilor de publicare (`portal_publish_schedules`).
 * La ora programată nu există altă logică de publicare: se reverifică dreptul
 * celui care a programat și starea proprietății, apoi se înscrie publicarea în
 * coada existentă (`enqueuePublishJobsForOrg` → `portal_publish_jobs` + arm),
 * exact ca la o apăsare manuală pe „Publică”.
 */
import { SCHEDULE_PUBLISHABLE_STATUSES, formatScheduleLabel } from "./publish-schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type ScheduleRow = {
  id: string;
  organization_id: string;
  property_id: string;
  portal_key: string;
  scheduled_at: string;
  promoted: boolean | null;
  requested_by: string;
  superadmin: boolean;
};

export type ScheduleEnqueue = (input: {
  organizationId: string;
  superadmin: boolean;
  actorId: string;
  data: {
    propertyId: string;
    selections: { portalId: string; enabled: boolean; promoted?: boolean }[];
    syncExisting: boolean;
  };
  fromSchedule: true;
}) => Promise<{ results: { portalId: string; portalName: string; queued: boolean; message: string | null }[] }>;

export async function auditSchedule(
  admin: Admin,
  row: Pick<ScheduleRow, "id" | "organization_id" | "property_id" | "portal_key" | "scheduled_at">,
  action: "portal_schedule.created" | "portal_schedule.cancelled" | "portal_schedule.executed" | "portal_schedule.failed",
  actorId: string | null,
  reason: string | null = null,
) {
  await admin.from("audit_logs").insert({
    organization_id: row.organization_id,
    actor_id: actorId,
    action,
    entity: "portal_publish_schedules",
    entity_id: row.id,
    new_values: {
      property_id: row.property_id,
      portal: row.portal_key,
      scheduled_at: row.scheduled_at,
      ...(reason ? { reason } : {}),
    },
    created_by: actorId,
  });
}

/** Anulează programările active pentru portalurile date (publicare manuală / debifare). */
export async function cancelActiveSchedules(
  admin: Admin,
  input: { organizationId: string; propertyId: string; portalKeys: string[]; actorId: string; reason: string },
): Promise<number> {
  if (input.portalKeys.length === 0) return 0;
  const { data } = await admin
    .from("portal_publish_schedules")
    .update({
      status: "cancelled",
      reason: input.reason,
      finished_at: new Date().toISOString(),
      finished_by: input.actorId,
      locked_at: null,
    })
    .eq("organization_id", input.organizationId)
    .eq("property_id", input.propertyId)
    .eq("status", "scheduled")
    .in("portal_key", input.portalKeys)
    .select("id, organization_id, property_id, portal_key, scheduled_at");
  for (const row of (data ?? []) as ScheduleRow[]) {
    await auditSchedule(admin, row, "portal_schedule.cancelled", input.actorId, input.reason);
  }
  return (data ?? []).length;
}

/** Motivul pentru care programarea nu mai poate rula, sau null. */
export async function scheduleBlockReason(admin: Admin, row: ScheduleRow): Promise<string | null> {
  const { data: property } = await admin
    .from("properties")
    .select("id, status, deleted_at, assigned_to")
    .eq("id", row.property_id)
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  if (!property || property.deleted_at) return "Proprietatea a fost ștearsă.";
  if (!SCHEDULE_PUBLISHABLE_STATUSES.has(property.status)) {
    return "Proprietatea nu mai este activă (a fost retrasă, vândută, închiriată sau arhivată).";
  }
  const { data: roles } = await admin
    .from("user_roles")
    .select("role, organization_id")
    .eq("user_id", row.requested_by);
  const list = (roles ?? []) as { role: string; organization_id: string | null }[];
  const isSuper = list.some((r) => r.role === "superadmin");
  if (row.superadmin) {
    if (!isSuper) return "Cel care a programat nu mai are drept de publicare.";
    return null;
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("is_active, organization_id")
    .eq("id", row.requested_by)
    .maybeSingle();
  if (!profile || profile.is_active !== true || profile.organization_id !== row.organization_id) {
    return "Contul celui care a programat nu mai este activ în agenție.";
  }
  const isOrgAdmin = list.some((r) => r.role === "agency_admin" && r.organization_id === row.organization_id);
  if (!isOrgAdmin && property.assigned_to !== row.requested_by) {
    return "Cel care a programat nu mai este agentul responsabil al proprietății.";
  }
  return null;
}

async function finish(
  admin: Admin,
  row: ScheduleRow,
  status: "executed" | "failed",
  reason: string | null,
  portalName: string,
) {
  await admin
    .from("portal_publish_schedules")
    .update({ status, reason, finished_at: new Date().toISOString(), locked_at: null })
    .eq("id", row.id)
    .eq("status", "scheduled");
  await auditSchedule(admin, row, status === "executed" ? "portal_schedule.executed" : "portal_schedule.failed", null, reason);
  const when = formatScheduleLabel(row.scheduled_at);
  await admin.from("notifications").insert({
    organization_id: row.organization_id,
    user_id: row.requested_by,
    type: status === "executed" ? "portal_schedule_executed" : "portal_schedule_failed",
    title:
      status === "executed"
        ? `${portalName}: publicarea programată a pornit`
        : `${portalName}: publicarea programată a eșuat`,
    body:
      status === "executed"
        ? `Publicarea programată pentru ${when} a fost trimisă.`
        : `Programarea din ${when} nu s-a executat: ${reason ?? "motiv necunoscut"}`,
    link: `/app/properties/${row.property_id}`,
    created_by: row.requested_by,
  });
}

/** Execută programările scadente; returnează câte au rulat / eșuat. */
export async function runDueSchedules(
  admin: Admin,
  enqueue: ScheduleEnqueue,
  opts: { limit?: number; portalName?: (id: string) => string } = {},
): Promise<{ claimed: number; executed: number; failed: number }> {
  const stats = { claimed: 0, executed: 0, failed: 0 };
  const { data, error } = await admin.rpc("claim_due_portal_publish_schedules", {
    _limit: opts.limit ?? 20,
    _lease_seconds: 300,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ScheduleRow[];
  stats.claimed = rows.length;
  for (const row of rows) {
    const name = opts.portalName?.(row.portal_key) ?? row.portal_key;
    try {
      const block = await scheduleBlockReason(admin, row);
      if (block) {
        stats.failed += 1;
        await finish(admin, row, "failed", block, name);
        continue;
      }
      const out = await enqueue({
        organizationId: row.organization_id,
        superadmin: row.superadmin,
        actorId: row.requested_by,
        data: {
          propertyId: row.property_id,
          selections: [{ portalId: row.portal_key, enabled: true, ...(row.promoted !== null ? { promoted: row.promoted } : {}) }],
          syncExisting: true,
        },
        fromSchedule: true,
      });
      const result = out.results.find((r) => r.portalId === row.portal_key);
      if (result?.queued) {
        stats.executed += 1;
        await finish(admin, row, "executed", null, result.portalName || name);
      } else {
        stats.failed += 1;
        await finish(admin, row, "failed", result?.message ?? "Publicarea nu a putut fi pornită.", result?.portalName || name);
      }
    } catch (e) {
      stats.failed += 1;
      await finish(admin, row, "failed", (e instanceof Error ? e.message : "Eroare neașteptată.").slice(0, 300), name);
    }
  }
  return stats;
}
