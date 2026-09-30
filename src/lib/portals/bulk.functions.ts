import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { assertPortalPropertyAccess, resolvePublishingOrg } from "@/lib/portals.functions";
import { getPortalDefinition, isPortalCovered, portalDisplayName, PORTALS } from "@/lib/portals/registry";
import { portalConnectionReady } from "@/lib/portals/clickimob/index-feed";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const itemSchema = z.object({
  propertyId: z.string().uuid(), portalId: z.string().min(1).max(40),
  enabled: z.boolean(), promoted: z.boolean().nullable().optional(),
});

export const getPortalBulkOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolvePublishingOrg(context as never, data.organizationId);
    const admin = await loadAdmin();
    const [{ data: connections }, { data: keys }, { data: limits }, { data: publications }] = await Promise.all([
      admin.from("portal_connections").select("portal,status,activated").eq("organization_id", organizationId),
      admin.from("portal_api_keys").select("portal").eq("organization_id", organizationId).eq("status", "active"),
      admin.from("portal_slot_limits").select("portal_key,total_slots").eq("organization_id", organizationId),
      admin.from("portal_publications").select("portal_key").eq("organization_id", organizationId).eq("enabled", true),
    ]);
    const keyed = new Set((keys ?? []).map((row) => row.portal));
    return PORTALS.filter((portal) => !isPortalCovered(portal.id) && (connections ?? []).some((row) => row.portal === portal.id && row.activated === true)).map((portal) => {
      const connection = (connections ?? []).find((row) => row.portal === portal.id);
      const pushSupported = portal.capabilities.includes("publish_listing") && !portal.capabilities.includes("feed_pull");
      const configured = portal.status === "available" && (pushSupported ? portalConnectionReady(portal.id, connection) : keyed.has(portal.id) || portalConnectionReady(portal.id, connection));
      return {
        portalId: portal.id, name: portalDisplayName(portal.id), configured,
        feedOnly: !pushSupported, promotionFlag: portal.supports_promoted_flag === true,
        used: (publications ?? []).filter((row) => row.portal_key === portal.id).length,
        limit: (limits ?? []).find((row) => row.portal_key === portal.id)?.total_slots ?? null,
      };
    });
  });

export const startPortalBulkJob = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid().optional(), items: z.array(itemSchema).min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { organizationId, superadmin, agentOnly } = await resolvePublishingOrg(context as never, data.organizationId);
    const admin = await loadAdmin();
    const [{ data: connections }, { data: limits }, { data: current }] = await Promise.all([
      admin.from("portal_connections").select("portal,activated").eq("organization_id", organizationId),
      admin.from("portal_slot_limits").select("portal_key,total_slots").eq("organization_id", organizationId),
      admin.from("portal_publications").select("property_id,portal_key,enabled,promoted").eq("organization_id", organizationId),
    ]);
    const active = new Set((connections ?? []).filter((row) => row.activated === true).map((row) => row.portal));
    const accepted: typeof data.items = [];
    const skipped: { item: (typeof data.items)[number]; message: string }[] = [];
    for (const item of data.items) {
      try {
        const portal = getPortalDefinition(item.portalId);
        if (!portal || isPortalCovered(item.portalId) || (!superadmin && !active.has(item.portalId))) throw new Error("Portalul nu este activat pentru agenție.");
        if (item.promoted === true && (!item.enabled || portal.supports_promoted_flag !== true)) throw new Error("Promovarea este permisă doar pentru un anunț bifat pe un portal compatibil.");
        await assertPortalPropertyAccess({ organizationId, propertyId: item.propertyId, agentOnly, userId: context.userId });
        accepted.push(item);
      } catch (error) {
        skipped.push({ item, message: error instanceof Error ? error.message : "Element respins." });
      }
    }
    for (const limit of limits ?? []) {
      if (limit.total_slots === null) continue;
      const used = (current ?? []).filter((row) => row.portal_key === limit.portal_key && row.enabled).length;
      let delta = 0;
      for (const item of accepted.filter((entry) => entry.portalId === limit.portal_key)) {
        const before = (current ?? []).find((row) => row.property_id === item.propertyId && row.portal_key === item.portalId)?.enabled === true;
        if (before !== item.enabled) delta += item.enabled ? 1 : -1;
      }
      if (used + delta > limit.total_slots) {
        const blocked = accepted.filter((entry) => entry.portalId === limit.portal_key && entry.enabled);
        for (const item of blocked) skipped.push({ item, message: `Depășești limita de locuri pe ${portalDisplayName(item.portalId)}.` });
        for (const item of blocked) accepted.splice(accepted.indexOf(item), 1);
      }
    }
    const { data: job, error } = await admin.from("portal_bulk_jobs").insert({ organization_id: organizationId, requested_by: context.userId, total: data.items.length, done: skipped.length }).select("id").single();
    if (error || !job) throw new Error("Jobul de publicare nu a putut fi creat.");
    await admin.from("portal_bulk_items").insert([
      ...accepted.map((item) => ({ job_id: job.id, property_id: item.propertyId, portal_key: item.portalId, enabled: item.enabled, promoted: item.promoted ?? null })),
      ...skipped.map(({ item, message }) => ({ job_id: job.id, property_id: item.propertyId, portal_key: item.portalId, enabled: item.enabled, promoted: item.promoted ?? null, status: "skipped", message, finished_at: new Date().toISOString() })),
    ]);
    if (accepted.length === 0) await admin.from("portal_bulk_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", job.id);
    else {
      const { error: armError } = await admin.rpc("portal_bulk_arm");
      if (armError) throw new Error("Procesarea în fundal nu a putut fi pornită.");
    }
    return { jobId: job.id, queued: accepted.length, skipped: skipped.length };
  });

export const getPortalBulkJob = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await loadAdmin();
    const { data: job } = await context.supabase.from("portal_bulk_jobs").select("*").eq("id", data.jobId).maybeSingle();
    if (!job) throw new Error("Jobul nu a fost găsit.");
    const { data: items } = await context.supabase.from("portal_bulk_items").select("*").eq("job_id", data.jobId).order("created_at");
    const propertyIds = [...new Set((items ?? []).map((item) => item.property_id))];
    const { data: properties } = propertyIds.length ? await admin.from("properties").select("id,reference,title").in("id", propertyIds) : { data: [] };
    return { job, items: (items ?? []).map((item) => ({ ...item, property: (properties ?? []).find((property) => property.id === item.property_id) ?? null })) };
  });
