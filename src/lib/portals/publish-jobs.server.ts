/**
 * Workerul durabil pentru publicarea pe portaluri (tabela `portal_publish_jobs`).
 *
 * - preia joburile cu `claim_portal_publish_jobs` (FOR UPDATE SKIP LOCKED);
 *   un job `running` cu lease mai vechi de 5 minute se reia;
 * - maxim 3 joburi în paralel, maxim ~25 s per invocare;
 * - fiecare job = un singur portal, executat cu datele CURENTE ale ofertei prin
 *   `applyPortalSelectionForOrg` (care reverifică eligibilitatea și sloturile);
 * - erorile temporare (rețea, 5xx, 429, IMAGE_REHOST_FAILED) se reiau automat la
 *   2 min, 10 min, 30 min, 2 h și 6 h (429: cel puțin Retry-After); apoi eroare finală;
 *   erorile de validare sunt finale.
 */
import {
  isTimeoutLikeFailure,
  isTransientPublishFailure,
  PACED_PUBLISH_PORTALS,
  PUBLISH_RETRY_DELAYS_MS,
  publishRetryDelayFor,
  retryStatusLabel,
} from "./transient-failure";

/**
 * Heartbeat: reîmprospătează `locked_at` doar pe rândul cu același `claim_token`
 * și `status = 'running'`. Întoarce funcția de oprire.
 */
export function startJobHeartbeat(
  admin: { from: (t: "portal_publish_jobs") => any },
  job: { id: string; claim_token?: string | null },
  intervalMs: number = PUBLISH_JOB_HEARTBEAT_MS,
): () => void {
  if (!job.claim_token) return () => undefined;
  const token = job.claim_token;
  const timer = setInterval(() => {
    Promise.resolve(
      admin.from("portal_publish_jobs").update({ locked_at: new Date().toISOString() })
        .eq("id", job.id).eq("claim_token", token).eq("status", "running"),
    ).catch(() => console.error("[portal-publish] heartbeat eșuat"));
  }, intervalMs);
  return () => clearInterval(timer);
}

export const PUBLISH_JOB_CONCURRENCY = 3;
export const PUBLISH_JOB_BUDGET_MS = 25_000;
export const PUBLISH_JOB_LEASE_SECONDS = 60;
/** Cât rulează un job, `locked_at` se reîmprospătează la acest interval. */
export const PUBLISH_JOB_HEARTBEAT_MS = 15_000;
/** Încercări totale = 1 + câte o reluare pentru fiecare pauză. */
export const PUBLISH_JOB_MAX_ATTEMPTS = 1 + PUBLISH_RETRY_DELAYS_MS.length;
/** A job whose lease expired this many times without a saved result is closed as an error (SQL claim). */
export const PUBLISH_JOB_MAX_SILENT_ATTEMPTS = 3;
/** Hard cap for one job: a hung promise becomes a saved error instead of a silent `running`. */
export const PUBLISH_JOB_DEADLINE_MS = 120_000;
export const PUBLISH_JOB_DEADLINE_MESSAGE = "Publicarea nu s-a terminat în 2 minute și a fost oprită. Reia actualizarea.";

export class PublishJobDeadlineError extends Error {
  constructor() { super(PUBLISH_JOB_DEADLINE_MESSAGE); this.name = "PublishJobDeadlineError"; }
}

/** Resolves with the job result or rejects with a Romanian deadline error. */
export async function withJobDeadline<T>(run: () => Promise<T>, ms = PUBLISH_JOB_DEADLINE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PublishJobDeadlineError()), ms); });
  try { return await Promise.race([run(), expired]); } finally { clearTimeout(timer); }
}

/** Messages saved on the job are always Romanian and readable. */
export function thrownJobMessage(thrown: unknown): string {
  if (thrown instanceof PublishJobDeadlineError) return thrown.message;
  const raw = thrown instanceof Error ? thrown.message.trim() : "";
  if (raw && /[ăâîșțĂÂÎȘȚ]|\b(nu|eroare|portal|anunț)\b/i.test(raw)) return raw.slice(0, 500);
  return `Eroare neașteptată la publicare${raw ? ` (${raw.slice(0, 200)})` : ""}. Reia actualizarea.`;
}

export type PublishJobRow = {
  id: string;
  organization_id: string;
  property_id: string;
  portal_key: string;
  enabled: boolean;
  promoted: boolean | null;
  sync_existing: boolean;
  imobiliare_promotions?: import("./imobiliare/card-promotions").ImobiliarePromotionChanges | null;
  imobiliare_mode?: import("./imobiliare/card-promotions").ImobiliarePublicationMode | null;
  requested_by: string;
  superadmin: boolean;
  attempts: number;
  claim_token?: string | null;
  operation?: string;
  ofera_intent?: "activate" | "resend" | null;
  republish_batch_id?: string | null;
  mva_sync_id?: string | null;
};

export type PublishOutcome = {
  portalId: string;
  portalName?: string;
  ok: boolean;
  action?: string;
  message: string | null;
  code?: string | null;
  httpStatus?: number | null;
  /** Retry-After cerut de portal (429), în milisecunde. */
  retryAfterMs?: number | null;
};

export type PublishApplyFn = (job: PublishJobRow) => Promise<PublishOutcome | null>;

/** Pauza înainte de reluare (2 min … 6 h); după ultima pauză rămâne ultima valoare. */
export function publishRetryDelayMs(attempts: number): number {
  return publishRetryDelayFor({ attemptNumber: attempts }) ?? PUBLISH_RETRY_DELAYS_MS[PUBLISH_RETRY_DELAYS_MS.length - 1]!;
}

export type JobDecision =
  | { status: "done"; ok: true; action: string | null; message: string | null }
  | { status: "error"; ok: false; message: string }
  | { status: "queued"; retryInMs: number; message: string };

export function decideJobResult(
  job: Pick<PublishJobRow, "attempts"> & { portal_key?: string },
  outcome: PublishOutcome | null,
  thrown: unknown,
): JobDecision {
  if (thrown === undefined && (outcome === null || outcome.ok)) {
    return { status: "done", ok: true, action: outcome?.action ?? null, message: outcome?.message ?? null };
  }
  const message =
    thrown !== undefined
      ? thrownJobMessage(thrown)
      : (outcome?.message ?? "Publicarea a eșuat.");
  const portalId = job.portal_key ?? outcome?.portalId ?? null;
  const failure = {
    code: thrown !== undefined ? null : (outcome?.code ?? null),
    httpStatus: thrown !== undefined ? null : (outcome?.httpStatus ?? null),
    message,
    portalId,
  };
  // Imobiliare has one bounded call: a timeout is final for this job, not another inline/queue loop.
  if (isTimeoutLikeFailure(failure) && portalId === "imobiliare_ro" && failure.code === "TIMEOUT") {
    return { status: "error", ok: false, message: "Imobiliare.ro nu a răspuns în 15 secunde" };
  }
  if (thrown instanceof PublishJobDeadlineError) return { status: "error", ok: false, message };
  if (isTransientPublishFailure(failure)) {
    const delay = publishRetryDelayFor({
      attemptNumber: job.attempts,
      retryAfterMs: thrown !== undefined ? null : (outcome?.retryAfterMs ?? null),
    });
    if (delay !== null) return { status: "queued", retryInMs: delay, message };
  }
  return { status: "error", ok: false, message: message.slice(0, 500) };
}

/**
 * Cât timp reîncercarea e programată, publicarea nu e „Eroare”: devine
 * „Se reîncearcă (încercarea N, următoarea la HH:MM)”. Doar selecțiile bifate.
 */
export async function markPublicationRetrying(admin: Admin, job: Pick<PublishJobRow, "organization_id" | "property_id" | "portal_key" | "attempts" | "enabled">, retryInMs: number, now = Date.now()): Promise<string> {
  const label = retryStatusLabel(job.attempts + 1, new Date(now + retryInMs));
  if (!job.enabled) return label;
  try {
  await admin.from("portal_publications").update({ status: "pending", last_error: label })
    .eq("organization_id", job.organization_id).eq("property_id", job.property_id).eq("portal_key", job.portal_key)
    .eq("enabled", true).eq("status", "error");
  await admin.from("portal_listings").update({ status: "pending", last_error: label })
    .eq("organization_id", job.organization_id).eq("property_id", job.property_id).eq("portal", job.portal_key)
    .eq("status", "error");
  } catch {
    console.error("[portal-publish] starea de reîncercare nu a putut fi salvată");
  }
  return label;
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
      const item = items[index++];
      if (item === undefined) break;
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

/**
 * Portals whose jobs download, encode or upload photos. At most one of these runs
 * per worker invocation: several galleries in parallel exhausted Worker memory/CPU.
 * Feed-only portals (ClickImob family, dynamic feeds) stay parallel.
 */
/** Only portals whose adapter downloads/encodes image bytes inside the worker.
 * imobiliare_ro: base64 gallery; vumsi: multipart upload per photo; primulanunt: multipart upload.
 * URL-only portals (HomeDirect signed URLs, HomePitch, Storia, OLX, feeds…) are light. */
export const HEAVY_PUBLISH_PORTALS: readonly string[] = ["imobiliare_ro", "vumsi", "primulanunt"];
/** Max heavy jobs in flight at once; a run keeps claiming heavy jobs while budget remains. */
export const MAX_PARALLEL_HEAVY = 2;
export function isHeavyPublishJob(job: Pick<PublishJobRow, "portal_key">): boolean {
  return HEAVY_PUBLISH_PORTALS.includes(job.portal_key);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function runPortalPublishWorker(
  admin: Admin,
  apply: PublishApplyFn,
  opts: { concurrency?: number; budgetMs?: number; portalName?: (id: string) => string; agentSync?: import("./agent-sync").AgentSyncDeps } = {},
): Promise<{ claimed: number; done: number; failed: number; retried: number }> {
  const concurrency = Math.min(opts.concurrency ?? PUBLISH_JOB_CONCURRENCY, 3);
  const budgetMs = opts.budgetMs ?? PUBLISH_JOB_BUDGET_MS;
  const started = Date.now();
  const stats = { claimed: 0, done: 0, failed: 0, retried: 0 };

  // Claims are serialized so the in-flight heavy counter cannot race.
  let heavyInFlight = 0;
  // VDI, La Cheie, HomeDirect: un singur job simultan per portal, fără rafale (429).
  const pacedInFlight = new Map<string, number>();
  let claimChain: Promise<unknown> = Promise.resolve();
  const claimOne = (): Promise<PublishJobRow[]> => {
    const next = claimChain.then(async () => {
      const exclude = [
        ...(heavyInFlight >= MAX_PARALLEL_HEAVY ? HEAVY_PUBLISH_PORTALS : []),
        ...PACED_PUBLISH_PORTALS.filter((p) => (pacedInFlight.get(p) ?? 0) > 0),
      ];
      const { data, error } = await admin.rpc("claim_portal_publish_jobs", {
        _limit: 1,
        _lease_seconds: PUBLISH_JOB_LEASE_SECONDS,
        ...(exclude.length ? { _exclude_portals: exclude } : {}),
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as PublishJobRow[];
      heavyInFlight += rows.filter(isHeavyPublishJob).length;
      for (const r of rows) if (PACED_PUBLISH_PORTALS.includes(r.portal_key)) pacedInFlight.set(r.portal_key, (pacedInFlight.get(r.portal_key) ?? 0) + 1);
      return rows;
    });
    claimChain = next.catch(() => undefined);
    return next;
  };

  // Independent lanes: two slow jobs never create a batch barrier for the third lane.
  await Promise.all(Array.from({ length: concurrency }, async () => {
  let laneHeavy = 0;
  let lanePaced: string[] = [];
  const releasePaced = () => { for (const p of lanePaced) pacedInFlight.set(p, Math.max(0, (pacedInFlight.get(p) ?? 1) - 1)); lanePaced = []; };
  try {
  while (Date.now() - started < budgetMs) {
    if (laneHeavy) { heavyInFlight -= laneHeavy; laneHeavy = 0; }
    releasePaced();
    const jobs = await claimOne();
    laneHeavy = jobs.filter(isHeavyPublishJob).length;
    lanePaced = jobs.map((j) => j.portal_key).filter((p) => PACED_PUBLISH_PORTALS.includes(p));
    if (jobs.length === 0) break;
    stats.claimed += jobs.length;

    for (const job of jobs) {
      if (job.claim_token) {
        const { data: active, error: readError } = await admin.from("portal_publish_jobs").select("id").eq("id", job.id).eq("claim_token", job.claim_token).eq("status", "running").is("cancelled_at", null).maybeSingle();
        if (readError) throw new Error("Jobul nu a putut fi verificat.");
        if (!active) continue;
      }
      let outcome: PublishOutcome | null = null;
      let thrown: unknown = undefined;
      const stopHeartbeat = startJobHeartbeat(admin, job);
      try {
        if (job.portal_key === "zonata") {
          const { runZonataLoggedJob } = await import("./zonata/job-log.server");
          outcome = await runZonataLoggedJob(admin, job, apply);
        } else {
          const { withRepublishAgentSync } = await import("./agent-sync");
          const agentSync = opts.agentSync ?? (job.republish_batch_id
            ? (await import("./agent-sync.server")).realAgentSyncDeps(admin)
            : null);
          outcome = await withJobDeadline(() =>
            agentSync ? withRepublishAgentSync(job, apply, agentSync) : apply(job));
        }
      } catch (e) {
        thrown = e;
      } finally {
        stopHeartbeat();
      }
      const decision = decideJobResult(job, outcome, thrown);
      const name = opts.portalName?.(job.portal_key) ?? outcome?.portalName ?? job.portal_key;
      if (job.claim_token) {
        const { data: saved, error: saveError } = await admin.rpc("finish_portal_publish_job", {
          _id: job.id, _token: job.claim_token, _status: decision.status,
          _ok: decision.status === "done", _action: decision.status === "done" ? decision.action : "blocked",
          _message: decision.message, _retry_ms: decision.status === "queued" ? decision.retryInMs : 0,
        });
        if (saveError) throw new Error("Rezultatul publicării nu a putut fi salvat.");
        if (!saved) continue;
        if (decision.status === "queued") await markPublicationRetrying(admin, job, decision.retryInMs);
        if (decision.status === "queued") stats.retried += 1;
        else if (decision.status === "done") stats.done += 1;
        else stats.failed += 1;
        if (decision.status !== "error" || job.republish_batch_id || job.mva_sync_id) continue;
        await admin.from("notifications").insert({ organization_id: job.organization_id, user_id: job.requested_by,
          type: "portal_publish_error", title: `${name}: publicarea a eșuat`, body: decision.message,
          link: `/app/properties/${job.property_id}`, created_by: job.requested_by });
        continue;
      }
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
        await markPublicationRetrying(admin, job, decision.retryInMs);
        continue;
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
      // Clopoțelul arată doar erori: succesul nu creează notificare.
      // Republicarea în lot trimite o singură notificare, la final.
      if (decision.ok || job.republish_batch_id || job.mva_sync_id) continue;
      await admin.from("notifications").insert({
        organization_id: job.organization_id,
        user_id: job.requested_by,
        type: "portal_publish_error",
        title: `${name}: publicarea a eșuat`,
        body: decision.message,
        link: `/app/properties/${job.property_id}`,
        created_by: job.requested_by,
      });
    }
  }
  } finally {
    heavyInFlight -= laneHeavy;
    releasePaced();
  }
  }));
  return stats;
}
