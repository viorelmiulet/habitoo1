import { loadRepublishCandidates, runRepublishJob } from "./republish.server";
import { staggerRepublishPairs } from "./republish";

/** Only already-active pairs; queued follow-ups survive a concurrent publication. */
export async function enqueueContactUpdates(admin: any, input: {
  organizationId: string; propertyIds: string[]; actorId: string; superadmin: boolean;
}): Promise<void> {
  const moved = new Set(input.propertyIds);
  const candidates = await loadRepublishCandidates(admin, {
    organizationId: input.organizationId, userId: input.actorId, scope: "all", portalFilter: null, superadmin: false,
  });
  const pairs = candidates.queued.filter(pair => moved.has(pair.propertyId));
  for (const pair of staggerRepublishPairs(pairs, Date.now())) {
    const { error } = await admin.rpc("enqueue_portal_contact_update", {
      _org: input.organizationId, _property: pair.propertyId, _portal: pair.portalId,
      _actor: input.actorId, _superadmin: input.superadmin, _next: pair.nextAttemptAt,
    });
    if (error) throw new Error(error.message);
  }
  if (pairs.length) {
    const { error } = await admin.rpc("portal_publish_arm");
    if (error) throw new Error(error.message);
  }
  const { clearProperstarCache } = await import("./properstar/cache");
  clearProperstarCache(input.organizationId);
}

export async function runContactUpdateJob(
  admin: any,
  job: Parameters<typeof runRepublishJob>[1],
  execute: (input: {
    organizationId: string; actorId: string; portalId: string; propertyId: string;
    action: "update"; operationLabel: string; skipSlotCheck: true;
  }) => ReturnType<Parameters<typeof runRepublishJob>[2]>,
) {
  const { data: connection } = await admin.from("portal_connections").select("activated")
    .eq("organization_id", job.organization_id).eq("portal", job.portal_key).maybeSingle();
  if (!connection?.activated) return { portalId: job.portal_key, ok: true, action: "skipped", message: "Sărit: portalul nu mai este activat." };
  const result = await runRepublishJob(admin, job, input => execute({ ...input, operationLabel: "update" }));
  return { ...result, action: result.action === "republished" ? "updated" : result.action,
    message: result.action === "republished" ? `${result.portalName}: contactul a fost actualizat.` : result.message };
}