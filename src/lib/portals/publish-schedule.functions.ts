/** Publicare programată per portal: creare, listare, anulare (drepturi ca la publicarea manuală). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { activatedPortalIds, type AuthContext, assertPortalPropertyAccess, resolvePublishingOrg } from "@/lib/portals.functions";
import { getPortalDefinition, portalCanPublish, portalDisplayName, publishUnavailableMessage, type PortalId } from "./registry";
import { scheduleWindowError, type PortalScheduleView } from "./publish-schedule";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const base = { organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() };

export const listPropertyPortalSchedules = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object(base).parse(input))
  .handler(async ({ data, context }): Promise<PortalScheduleView[]> => {
    const { organizationId } = await resolvePublishingOrg(context as unknown as AuthContext, data.organizationId);
    const admin = await loadAdmin();
    const { data: rows } = await admin
      .from("portal_publish_schedules")
      .select("id, portal_key, scheduled_at, status, reason")
      .eq("organization_id", organizationId)
      .eq("property_id", data.propertyId)
      .eq("status", "scheduled")
      .order("scheduled_at");
    return (rows ?? []).map((r) => ({
      id: r.id,
      portalId: r.portal_key,
      scheduledAt: r.scheduled_at,
      status: r.status as PortalScheduleView["status"],
      reason: r.reason,
    }));
  });

export const schedulePortalPublish = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ ...base, portalId: z.string().min(1).max(40), scheduledAt: z.string().datetime(), promoted: z.boolean().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; id: string }> => {
    const { organizationId, superadmin, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({ organizationId, propertyId: data.propertyId, agentOnly, userId: context.userId });
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");
    const name = portalDisplayName(definition.id as PortalId);
    if (!portalCanPublish(definition.id)) throw new Error(publishUnavailableMessage(definition.id));
    if (definition.status !== "available") throw new Error(`Integrarea ${name} nu este încă disponibilă.`);
    if (!superadmin && !(await activatedPortalIds(organizationId)).has(definition.id)) {
      throw new Error(`${name} nu este activat pentru agenția ta.`);
    }
    const windowError = scheduleWindowError(data.scheduledAt);
    if (windowError) throw new Error(windowError);
    const admin = await loadAdmin();
    const { data: row, error } = await admin
      .from("portal_publish_schedules")
      .insert({
        organization_id: organizationId,
        property_id: data.propertyId,
        portal_key: definition.id,
        scheduled_at: new Date(data.scheduledAt).toISOString(),
        promoted: data.promoted ?? null,
        requested_by: context.userId,
        superadmin,
      })
      .select("id, organization_id, property_id, portal_key, scheduled_at")
      .single();
    if (error || !row) {
      if ((error as { code?: string } | null)?.code === "23505") {
        throw new Error(`${name} are deja o publicare programată pentru această proprietate.`);
      }
      throw new Error("Programarea nu a putut fi salvată.");
    }
    const { auditSchedule } = await import("./publish-schedule.server");
    await auditSchedule(admin, row, "portal_schedule.created", context.userId);
    return { ok: true, id: row.id };
  });

export const cancelPortalSchedule = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ ...base, portalId: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; cancelled: number }> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(context as unknown as AuthContext, data.organizationId);
    await assertPortalPropertyAccess({ organizationId, propertyId: data.propertyId, agentOnly, userId: context.userId });
    const admin = await loadAdmin();
    const { cancelActiveSchedules } = await import("./publish-schedule.server");
    const cancelled = await cancelActiveSchedules(admin, {
      organizationId,
      propertyId: data.propertyId,
      portalKeys: [data.portalId],
      actorId: context.userId,
      reason: "Anulată de utilizator.",
    });
    return { ok: true, cancelled };
  });
