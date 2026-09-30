import { isRetryablePortalBulkError } from "@/lib/portals/bulk";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PortalBulkAdmin = { from: (table: string) => any; rpc: (name: string, params?: any) => any };

export const BULK_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

type ClaimedItem = {
  id: string; job_id: string; property_id: string; portal_key: string; enabled: boolean;
  promoted: boolean | null; attempts: number; max_attempts: number;
};

export type BulkApplyOutcome = { portalId: string; ok: boolean; message: string | null; code?: string | null; httpStatus?: number | null };
export type BulkProcessDeps = {
  apply: (input: {
    organizationId: string; actorId: string; propertyId: string;
    selections: { portalId: string; enabled: boolean; promoted?: boolean }[];
  }) => Promise<BulkApplyOutcome[]>;
  now?: () => number;
  pause?: (ms: number) => Promise<void>;
};

async function refreshJob(admin: PortalBulkAdmin, jobId: string, nowIso: string) {
  const { data: items } = await admin.from("portal_bulk_items").select("status").eq("job_id", jobId);
  const rows = (items ?? []) as { status: string }[];
  const done = rows.filter((row) => row.status === "ok" || row.status === "skipped").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const pending = rows.some((row) => row.status === "queued" || row.status === "running");
  await admin.from("portal_bulk_jobs").update({
    status: pending ? "running" : "done",
    done,
    failed,
    ...(pending ? {} : { finished_at: nowIso }),
  }).eq("id", jobId);
}

export async function processPortalBulkProperty(
  admin: PortalBulkAdmin,
  input: { jobId: string; propertyId: string; organizationId: string; actorId: string },
  deps: BulkProcessDeps,
) {
  const now = deps.now ?? Date.now;
  const { data: claimed } = await admin.rpc("claim_portal_bulk_property", {
    _job_id: input.jobId, _property_id: input.propertyId, _ttl_seconds: 120,
  });
  const items = (claimed ?? []) as ClaimedItem[];
  if (items.length === 0) return [];
  await admin.from("portal_bulk_jobs").update({ status: "running", started_at: new Date(now()).toISOString() }).eq("id", input.jobId).eq("status", "queued");

  const outcomes = await deps.apply({
    organizationId: input.organizationId,
    actorId: input.actorId,
    propertyId: input.propertyId,
    selections: items.map((item) => ({
      portalId: item.portal_key,
      enabled: item.enabled,
      ...(item.promoted === null ? {} : { promoted: item.promoted }),
    })),
  });
  const nowIso = new Date(now()).toISOString();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const outcome = outcomes.find((entry) => entry.portalId === item.portal_key) ?? { portalId: item.portal_key, ok: false, message: "Portalul nu a întors un rezultat." };
    const attempts = item.attempts + 1;
    if (outcome.ok) {
      await admin.from("portal_bulk_items").update({ status: "ok", attempts, message: outcome.message, locked_until: null, finished_at: nowIso }).eq("id", item.id);
    } else if (attempts < item.max_attempts && isRetryablePortalBulkError(outcome)) {
      const delay = BULK_RETRY_DELAYS_MS[Math.min(attempts - 1, BULK_RETRY_DELAYS_MS.length - 1)] ?? BULK_RETRY_DELAYS_MS[0];
      await admin.from("portal_bulk_items").update({ status: "queued", attempts, message: outcome.message, locked_until: null, next_attempt_at: new Date(now() + delay).toISOString() }).eq("id", item.id);
    } else {
      await admin.from("portal_bulk_items").update({ status: "failed", attempts, message: outcome.message, locked_until: null, finished_at: nowIso }).eq("id", item.id);
    }
    if (index < items.length - 1) await (deps.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(250);
  }
  await refreshJob(admin, input.jobId, nowIso);
  return outcomes;
}

export async function runPortalBulkTick(admin: PortalBulkAdmin, deps: BulkProcessDeps, opts: { maxProperties: number; budgetMs: number }) {
  const started = Date.now();
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
  const { data } = await admin.from("portal_bulk_items").select("job_id, property_id, portal_bulk_jobs!inner(organization_id, requested_by)").in("status", ["queued", "running"]).or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`).order("created_at", { ascending: true }).limit(opts.maxProperties * 10);
  const groups = new Map<string, any>();
  for (const row of data ?? []) groups.set(`${row.job_id}|${row.property_id}`, row);
  const results = [];
  for (const row of [...groups.values()].slice(0, opts.maxProperties)) {
    if (Date.now() - started > opts.budgetMs) break;
    const job = Array.isArray(row.portal_bulk_jobs) ? row.portal_bulk_jobs[0] : row.portal_bulk_jobs;
    if (!job?.requested_by) continue;
    results.push(await processPortalBulkProperty(admin, {
      jobId: row.job_id, propertyId: row.property_id,
      organizationId: job.organization_id, actorId: job.requested_by,
    }, deps));
    await (deps.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(250);
  }
  return results;
}

export async function realPortalBulkDeps(): Promise<BulkProcessDeps> {
  const { applyPortalSelectionForOrg } = await import("@/lib/portals.functions");
  return {
    apply: async (input) => {
      const result = await applyPortalSelectionForOrg({
        organizationId: input.organizationId, superadmin: false, actorId: input.actorId,
        data: { propertyId: input.propertyId, selections: input.selections, syncExisting: false },
      });
      return result.results.map((entry) => ({ portalId: entry.portalId, ok: entry.ok, message: entry.message }));
    },
  };
}
