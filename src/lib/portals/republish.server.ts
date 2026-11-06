/**
 * Server: republicarea anunțurilor deja publicate prin coada `portal_publish_jobs`.
 * Fiecare job = o retrimitere „update” a anunțului existent; niciodată publish/withdraw.
 */
import { getPortalDefinition, portalDisplayName, type PortalId } from "./registry";
import {
  isPublishedPair,
  isRepublishableProperty,
  isRetryFailedPair,
  locallyBlockedPairs,
  selectRepublishPairs,
  type RepublishScope,
} from "./republish";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export async function loadRepublishCandidates(admin: Admin, input: {
  organizationId: string; userId: string; scope: RepublishScope; portalFilter: string[] | null; superadmin: boolean;
}) {
  const [{ data: properties }, { data: listings }, { data: publications }, { data: connections }] = await Promise.all([
    admin.from("properties").select("id,status,deleted_at,assigned_to").eq("organization_id", input.organizationId).is("deleted_at", null),
    admin.from("portal_listings").select("property_id,portal,status,external_id").eq("organization_id", input.organizationId),
    admin.from("portal_publications").select("property_id,portal_key,enabled,status,withdrawn_at").eq("organization_id", input.organizationId).eq("enabled", true),
    admin.from("portal_connections").select("portal,activated").eq("organization_id", input.organizationId),
  ]);
  const activePortals = new Set<string>(
    ((connections ?? []) as { portal: string; activated: boolean }[])
      .filter((c) => input.superadmin || c.activated === true).map((c) => c.portal),
  );
  const failedIds = [...new Set(((publications ?? []) as { property_id: string; status?: string }[]).filter((p) => p.status === "error").map((p) => p.property_id))];
  let locallyBlocked = new Set<string>();
  for (let i = 0; i < failedIds.length; i += 200) {
    const { data: logs } = await admin.from("portal_operation_logs").select("property_id,portal,success,error_code,http_status")
      .eq("organization_id", input.organizationId).in("property_id", failedIds.slice(i, i + 200)).order("created_at", { ascending: false }).limit(5000);
    locallyBlocked = new Set([...locallyBlocked, ...locallyBlockedPairs(logs ?? [])]);
  }
  return selectRepublishPairs({
    scope: input.scope, userId: input.userId, portalFilter: input.portalFilter, activePortals,
    properties: properties ?? [], listings: listings ?? [], publications: publications ?? [], locallyBlocked,
  });
}

export type RepublishExecute = (input: {
  organizationId: string; actorId: string; portalId: string; propertyId: string;
  action: "update" | "publish"; operationLabel: "republish"; skipSlotCheck: true;
}) => Promise<{ ok: boolean; message?: string | null; code?: string | null; httpStatus?: number | null }>;

/** Rulat de worker: reverifică starea actuală, apoi DOAR retrimite (update). */
export async function runRepublishJob(admin: Admin, job: {
  organization_id: string; property_id: string; portal_key: string; requested_by: string;
}, execute: RepublishExecute, options: { retryFailed?: boolean } = {}) {
  const name = getPortalDefinition(job.portal_key) ? portalDisplayName(job.portal_key as PortalId) : job.portal_key;
  const [{ data: property }, { data: listing }, { data: publication }] = await Promise.all([
    admin.from("properties").select("id,status,deleted_at,assigned_to").eq("id", job.property_id).eq("organization_id", job.organization_id).maybeSingle(),
    admin.from("portal_listings").select("property_id,portal,status,external_id").eq("property_id", job.property_id).eq("portal", job.portal_key).maybeSingle(),
    admin.from("portal_publications").select("property_id,portal_key,enabled,status,withdrawn_at").eq("property_id", job.property_id).eq("portal_key", job.portal_key).maybeSingle(),
  ]);
  const published = isPublishedPair(listing ?? undefined, publication ?? undefined);
  // Only the republish batch retries failed selections, once, as a fresh publish; our own checks still run in execute.
  const retry = !published && options.retryFailed === true && isRetryFailedPair(listing ?? undefined, publication ?? undefined);
  if (!isRepublishableProperty(property ?? undefined) || (!published && !retry)) {
    return { portalId: job.portal_key, portalName: name, ok: true, action: "skipped", message: "Sărit: anunțul nu mai este publicat sau oferta nu mai este activă." };
  }
  const res = await execute({
    organizationId: job.organization_id, actorId: job.requested_by, portalId: job.portal_key,
    propertyId: job.property_id, action: retry ? "publish" : "update", operationLabel: "republish", skipSlotCheck: true,
  });
  return {
    portalId: job.portal_key, portalName: name, ok: res.ok, action: res.ok ? (retry ? "published" : "republished") : "blocked",
    message: res.ok ? (retry ? `${name}: publicat la reîncercare.` : `${name}: republicat.`) : (res.message ?? "Republicarea a eșuat."),
    code: res.code ?? null, httpStatus: res.httpStatus ?? null,
  };
}

/** Actualizează progresul loturilor active; la final, o notificare în clopoțel. */
export async function refreshRepublishBatches(admin: Admin) {
  const { data: batches } = await admin.from("portal_republish_batches").select("*").eq("status", "running");
  for (const batch of batches ?? []) {
    const { data: jobs } = await admin.from("portal_publish_jobs").select("status,result_ok,result_action").eq("republish_batch_id", batch.id);
    const rows = (jobs ?? []) as { status: string; result_ok: boolean | null; result_action: string | null }[];
    const pending = rows.some((r) => r.status === "queued" || r.status === "running");
    const skippedJobs = rows.filter((r) => r.status === "done" && r.result_action === "skipped").length;
    const succeeded = rows.filter((r) => r.status === "done" && r.result_action !== "skipped").length;
    const failed = rows.filter((r) => r.status === "error").length;
    const skipped = ((batch.skipped_items ?? []) as unknown[]).length + skippedJobs;
    await admin.from("portal_republish_batches").update({
      succeeded, failed, skipped,
      ...(pending ? {} : { status: "done", finished_at: new Date().toISOString() }),
    }).eq("id", batch.id);
    // Regular republish notifications are atomic with completion in the DB.
    if (!pending && batch.kind === "imoradar") {
      await admin.from("notifications").insert({
        organization_id: batch.organization_id, user_id: batch.requested_by, created_by: batch.requested_by,
        ...(batch.kind === "imoradar"
          ? {
              type: "imoradar_backfill_done",
              title: "Trimiterea pe imoradar24 s-a terminat",
              body: `${succeeded} trimise, ${skipped} sărite, ${failed} erori.`,
            }
          : {
              type: "portal_republish_done",
              title: "Republicarea anunțurilor s-a terminat",
              body: `${succeeded} reușite, ${failed} erori, ${skipped} sărite.`,
            }),
        link: "/app/properties",
      });
    }
  }
}
