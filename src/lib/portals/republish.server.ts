/**
 * Server: republicarea anunțurilor deja publicate prin coada `portal_publish_jobs`.
 * Fiecare job = o retrimitere „update” a anunțului existent; niciodată publish/withdraw.
 */
import { getPortalDefinition, portalDisplayName, type PortalId } from "./registry";
import {
  isPublishedPair,
  isRepublishableProperty,
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
    admin.from("portal_publications").select("property_id,portal_key,enabled").eq("organization_id", input.organizationId).eq("enabled", true),
    admin.from("portal_connections").select("portal,activated").eq("organization_id", input.organizationId),
  ]);
  const activePortals = new Set<string>(
    ((connections ?? []) as { portal: string; activated: boolean }[])
      .filter((c) => input.superadmin || c.activated === true).map((c) => c.portal),
  );
  return selectRepublishPairs({
    scope: input.scope, userId: input.userId, portalFilter: input.portalFilter, activePortals,
    properties: properties ?? [], listings: listings ?? [], publications: publications ?? [],
  });
}

export type RepublishExecute = (input: {
  organizationId: string; actorId: string; portalId: string; propertyId: string;
  action: "update"; operationLabel: "republish"; skipSlotCheck: true;
}) => Promise<{ ok: boolean; message?: string | null; code?: string | null; httpStatus?: number | null }>;

/** Rulat de worker: reverifică starea actuală, apoi DOAR retrimite (update). */
export async function runRepublishJob(admin: Admin, job: {
  organization_id: string; property_id: string; portal_key: string; requested_by: string;
}, execute: RepublishExecute) {
  const name = getPortalDefinition(job.portal_key) ? portalDisplayName(job.portal_key as PortalId) : job.portal_key;
  const [{ data: property }, { data: listing }, { data: publication }] = await Promise.all([
    admin.from("properties").select("id,status,deleted_at,assigned_to").eq("id", job.property_id).eq("organization_id", job.organization_id).maybeSingle(),
    admin.from("portal_listings").select("property_id,portal,status,external_id").eq("property_id", job.property_id).eq("portal", job.portal_key).maybeSingle(),
    admin.from("portal_publications").select("property_id,portal_key,enabled").eq("property_id", job.property_id).eq("portal_key", job.portal_key).maybeSingle(),
  ]);
  if (!isRepublishableProperty(property ?? undefined) || !isPublishedPair(listing ?? undefined, publication ?? undefined)) {
    return { portalId: job.portal_key, portalName: name, ok: true, action: "skipped", message: "Sărit: anunțul nu mai este publicat sau oferta nu mai este activă." };
  }
  const res = await execute({
    organizationId: job.organization_id, actorId: job.requested_by, portalId: job.portal_key,
    propertyId: job.property_id, action: "update", operationLabel: "republish", skipSlotCheck: true,
  });
  return {
    portalId: job.portal_key, portalName: name, ok: res.ok, action: res.ok ? "republished" : "blocked",
    message: res.ok ? `${name}: republicat.` : (res.message ?? "Republicarea a eșuat."),
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
    if (!pending) {
      await admin.from("notifications").insert({
        organization_id: batch.organization_id, user_id: batch.requested_by, created_by: batch.requested_by,
        type: "portal_republish_done",
        title: "Republicarea anunțurilor s-a terminat",
        body: `${succeeded} reușite, ${failed} erori, ${skipped} sărite.`,
        link: "/app/properties",
      });
    }
  }
}
