/**
 * Workerul durabil pentru publicarea pe portaluri (tabela `portal_publish_jobs`).
 *
 * - preia joburile cu `claim_portal_publish_jobs` (FOR UPDATE SKIP LOCKED);
 *   un job `running` cu lease mai vechi de 5 minute se reia;
 * - maxim 3 joburi în paralel, maxim ~25 s per invocare;
 * - fiecare job = un singur portal, executat cu datele CURENTE ale ofertei prin
 *   `applyPortalSelectionForOrg` (care reverifică eligibilitatea și sloturile);
 * - erorile temporare (rețea, 5xx, 429) se reiau de maxim 3 ori, cu pauză crescătoare;
 *   erorile de validare sunt finale.
 */
import { isRetryablePortalBulkError } from "./bulk";

export const PUBLISH_JOB_CONCURRENCY = 3;
export const PUBLISH_JOB_BUDGET_MS = 25_000;
export const PUBLISH_JOB_LEASE_SECONDS = 300;
/** Încercări totale = 1 + 3 reluări. */
export const PUBLISH_JOB_MAX_ATTEMPTS = 4;

export type PublishJobRow = {
  id: string;
  organization_id: string;
  property_id: string;
  portal_key: string;
  enabled: boolean;
  promoted: boolean | null;
  sync_existing: boolean;
  requested_by: string;
  superadmin: boolean;
  attempts: number;
};

export type PublishOutcome = {
  portalId: string;
  portalName?: string;
  ok: boolean;
  action?: string;
  message: string | null;
  code?: string | null;
  httpStatus?: number | null;
};

export type PublishApplyFn = (job: PublishJobRow) => Promise<PublishOutcome | null>;

/** Pauza înainte de reluare: 30 s, 2 min, 8 min. */
export function publishRetryDelayMs(attempts: number): number {
  return 30_000 * 4 ** Math.max(0, attempts - 1);
}

export type JobDecision =
  | { status: "done"; ok: true; action: string | null; message: string | null }
  | { status: "error"; ok: false; message: string }
  | { status: "queued"; retryInMs: number; message: string };

export function decideJobResult(
  job: Pick<PublishJobRow, "attempts">,
  outcome: PublishOutcome | null,
  thrown: unknown,
): JobDecision {
  if (thrown === undefined && (outcome === null || outcome.ok)) {
    return { status: "done", ok: true, action: outcome?.action ?? null, message: outcome?.message ?? null };
  }
  const message =
    thrown !== undefined
      ? thrown instanceof Error
        ? thrown.message
        : "Eroare la publicare."
      : (outcome?.message ?? "Publicarea a eșuat.");
  const transient =
    thrown !== undefined
      ? isRetryablePortalBulkError({ message })
      : isRetryablePortalBulkError({
          code: outcome?.code ?? null,
          httpStatus: outcome?.httpStatus ?? null,
          message,
        });
  if (transient && job.attempts < PUBLISH_JOB_MAX_ATTEMPTS) {
    return { status: "queued", retryInMs: publishRetryDelayMs(job.attempts), message };
  }
  return { status: "error", ok: false, message: message.slice(0, 500) };
}

/** Rulează sarcinile cu maxim `concurrency` simultan; nu pornește altele după buget. */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  budgetMs: number,
  worker: (item: T) => Promise<void>,
): Promise<number> {
  const started = Date.now();
  let index = 0;
  let ran = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length && Date.now() - started < budgetMs) {
      const item = items[index++]!;
      ran += 1;
      try {
        await worker(item);
      } catch (error) {
        console.error("[portal-publish] job eșuat neașteptat", error);
      }
    }
  });
  await Promise.all(lanes);
  return ran;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function runPortalPublishWorker(
  admin: Admin,
  apply: PublishApplyFn,
  opts: { concurrency?: number; budgetMs?: number; portalName?: (id: string) => string } = {},
): Promise<{ claimed: number; done: number; failed: number; retried: number }> {
  const concurrency = opts.concurrency ?? PUBLISH_JOB_CONCURRENCY;
  const budgetMs = opts.budgetMs ?? PUBLISH_JOB_BUDGET_MS;
  const started = Date.now();
  const stats = { claimed: 0, done: 0, failed: 0, retried: 0 };

  // Preia câte un lot mic, cât timp e buget; fiecare lot rulează în paralel (max 3).
  while (Date.now() - started < budgetMs) {
    const { data, error } = await admin.rpc("claim_portal_publish_jobs", {
      _limit: concurrency,
      _lease_seconds: PUBLISH_JOB_LEASE_SECONDS,
    });
    if (error) throw new Error(error.message);
    const jobs = (data ?? []) as PublishJobRow[];
    if (jobs.length === 0) break;
    stats.claimed += jobs.length;

    await runPool(jobs, concurrency, budgetMs, async (job) => {
      let outcome: PublishOutcome | null = null;
      let thrown: unknown = undefined;
      try {
        outcome = await apply(job);
      } catch (e) {
        thrown = e;
      }
      const decision = decideJobResult(job, outcome, thrown);
      const name = opts.portalName?.(job.portal_key) ?? outcome?.portalName ?? job.portal_key;
      if (decision.status === "queued") {
        stats.retried += 1;
        await admin
          .from("portal_publish_jobs")
          .update({
            status: "queued",
            locked_at: null,
            next_attempt_at: new Date(Date.now() + decision.retryInMs).toISOString(),
            result_message: decision.message.slice(0, 500),
          })
          .eq("id", job.id);
        return;
      }
      if (decision.status === "done") stats.done += 1;
      else stats.failed += 1;
      await admin
        .from("portal_publish_jobs")
        .update({
          status: decision.status,
          locked_at: null,
          finished_at: new Date().toISOString(),
          result_ok: decision.ok,
          result_action: decision.status === "done" ? decision.action : "blocked",
          result_message: decision.message,
        })
        .eq("id", job.id);
      const withdrawn = job.enabled === false;
      await admin.from("notifications").insert({
        organization_id: job.organization_id,
        user_id: job.requested_by,
        type: decision.ok ? "portal_publish_done" : "portal_publish_error",
        title: decision.ok
          ? `${name}: ${withdrawn ? "retras" : "publicat"}`
          : `${name}: publicarea a eșuat`,
        body: decision.ok ? null : decision.message,
        link: `/app/properties/${job.property_id}?tab=publish`,
        created_by: job.requested_by,
      });
    });
  }
  return stats;
}
