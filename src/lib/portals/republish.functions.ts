import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { resolvePublishingOrg } from "@/lib/portals.functions";
import { portalDisplayName, getPortalDefinition, type PortalId } from "@/lib/portals/registry";
import {
  AUTO_PULL_MESSAGE,
  countByPortal,
  effectiveRepublishScope,
  staggerRepublishPairs,
} from "@/lib/portals/republish";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const inputSchema = z.object({
  organizationId: z.string().uuid().optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
  portalKeys: z.array(z.string().min(1).max(40)).max(40).nullable().default(null),
});

const label = (id: string) => (getPortalDefinition(id) ? portalDisplayName(id as PortalId) : id);

async function prepare(context: unknown, data: z.infer<typeof inputSchema>) {
  const ctx = context as { userId: string };
  const org = await resolvePublishingOrg(context as never, data.organizationId);
  const scope = effectiveRepublishScope(data.scope, org.agentOnly);
  const admin = await loadAdmin();
  const { loadRepublishCandidates } = await import("@/lib/portals/republish.server");
  const pairs = await loadRepublishCandidates(admin, {
    organizationId: org.organizationId, userId: ctx.userId, scope,
    portalFilter: data.portalKeys && data.portalKeys.length ? data.portalKeys : null, superadmin: org.superadmin,
  });
  return { admin, org, scope, pairs, userId: ctx.userId };
}

async function activeBatch(admin: Awaited<ReturnType<typeof loadAdmin>>, organizationId: string) {
  const { data } = await admin.from("portal_republish_batches").select("id").eq("organization_id", organizationId).eq("status", "running").maybeSingle();
  return data?.id ?? null;
}

export const getRepublishPreview = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { admin, org, scope, pairs } = await prepare(context, data);
    const queued = countByPortal(pairs.queued);
    const auto = countByPortal(pairs.autoPull);
    const portalIds = [...new Set([...Object.keys(queued), ...Object.keys(auto)])];
    return {
      canChooseScope: !org.agentOnly,
      scope,
      activeBatchId: await activeBatch(admin, org.organizationId),
      listings: new Set(pairs.queued.map((p) => p.propertyId)).size,
      portals: Object.keys(queued).length,
      perPortal: portalIds.map((portalId) => ({ portalId, name: label(portalId), queued: queued[portalId] ?? 0, autoPull: auto[portalId] ?? 0 })),
    };
  });

export const startRepublish = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { admin, org, scope, pairs, userId } = await prepare(context, data);
    if (await activeBatch(admin, org.organizationId)) throw new Error("O republicare rulează deja pentru agenție. Așteaptă să se termine.");
    if (pairs.queued.length === 0 && pairs.autoPull.length === 0) throw new Error("Nu există anunțuri publicate de republicat.");
    const autoItems = pairs.autoPull.map((p) => ({ propertyId: p.propertyId, portalId: p.portalId, message: AUTO_PULL_MESSAGE }));
    const { data: batch, error } = await admin.from("portal_republish_batches").insert({
      organization_id: org.organizationId, requested_by: userId, scope,
      portal_keys: data.portalKeys ?? [], total: pairs.queued.length + autoItems.length,
      skipped: autoItems.length, skipped_items: autoItems,
    }).select("id").single();
    if (error || !batch) {
      if ((error as { code?: string } | null)?.code === "23505") throw new Error("O republicare rulează deja pentru agenție. Așteaptă să se termine.");
      throw new Error("Republicarea nu a putut fi pornită.");
    }
    const busy: { propertyId: string; portalId: string; message: string }[] = [];
    for (const pair of staggerRepublishPairs(pairs.queued, Date.now())) {
      const { error: insertError } = await admin.from("portal_publish_jobs").insert({
        organization_id: org.organizationId, property_id: pair.propertyId, portal_key: pair.portalId,
        enabled: true, promoted: null, sync_existing: true, requested_by: userId, superadmin: org.superadmin,
        operation: "republish", republish_batch_id: batch.id, next_attempt_at: pair.nextAttemptAt,
      });
      if (insertError) busy.push({ propertyId: pair.propertyId, portalId: pair.portalId, message: "Se sincronizează deja; sărit." });
    }
    if (busy.length) {
      await admin.from("portal_republish_batches").update({ skipped: autoItems.length + busy.length, skipped_items: [...autoItems, ...busy] }).eq("id", batch.id);
    }
    await admin.from("audit_logs").insert({
      organization_id: org.organizationId, actor_id: userId, action: "portal_republish_started",
      entity_type: "portal_republish_batch", entity_id: batch.id,
      metadata: { scope, portals: data.portalKeys ?? "all", queued: pairs.queued.length - busy.length },
    } as never).then(() => undefined, () => undefined);
    if (pairs.queued.length > busy.length) {
      const { error: armError } = await admin.rpc("portal_publish_arm");
      if (armError) console.error("[portal-republish] armarea a eșuat", armError.message);
    } else {
      const { refreshRepublishBatches } = await import("@/lib/portals/republish.server");
      await refreshRepublishBatches(admin);
    }
    return { batchId: batch.id };
  });

export const getRepublishBatch = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ batchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // RLS: doar membrii agenției (sau superadmin) văd lotul.
    const { data: batch } = await context.supabase.from("portal_republish_batches").select("*").eq("id", data.batchId).maybeSingle();
    if (!batch) throw new Error("Republicarea nu a fost găsită.");
    const admin = await loadAdmin();
    const { data: jobs } = await admin.from("portal_publish_jobs").select("property_id,portal_key,status,result_action,result_message").eq("republish_batch_id", batch.id);
    const queued = (jobs ?? []).filter((j) => j.status === "queued" || j.status === "running").length;
    const errors = (jobs ?? []).filter((j) => j.status === "error");
    const skippedItems = [
      ...((batch.skipped_items ?? []) as { propertyId: string; portalId: string; message: string }[]),
      ...(jobs ?? []).filter((j) => j.status === "done" && j.result_action === "skipped").map((j) => ({ propertyId: j.property_id, portalId: j.portal_key, message: j.result_message ?? "Sărit." })),
    ];
    const ids = [...new Set([...errors.map((e) => e.property_id), ...skippedItems.map((s) => s.propertyId)])];
    const { data: props } = ids.length ? await admin.from("properties").select("id,reference,title").in("id", ids) : { data: [] };
    const ref = (id: string) => { const p = (props ?? []).find((x) => x.id === id); return p?.reference ?? p?.title ?? id.slice(0, 8); };
    return {
      status: batch.status as string, total: batch.total as number, succeeded: batch.succeeded as number,
      failed: batch.failed as number, skipped: skippedItems.length, pending: queued,
      errors: errors.map((e) => ({ listing: ref(e.property_id), portal: label(e.portal_key), message: e.result_message ?? "Eroare." })),
      skippedItems: skippedItems.map((s) => ({ listing: ref(s.propertyId), portal: label(s.portalId), message: s.message })),
    };
  });
