/**
 * Jobul durabil de retrimitere a portofoliului La Cheie (server-only).
 *
 * Rulează în worker/cron, NU în browser: fiecare ofertă se retrimite prin
 * fluxul normal de actualizare (stare completă, versiune mai mare, serializare
 * per `external_id`, Retry-After la 429 — toate în clientul La Cheie), una pe
 * cerere, la ritmul `write_rate` raportat de `GET /account`.
 */
import { LACHEIE_PORTAL_KEY } from "@/lib/portals/lacheie/config";
import {
  LACHEIE_DEFAULT_WRITE_RATE,
  LACHEIE_RESEND_ACTIVE_STATUSES,
  LACHEIE_RESEND_AGENCY_INACTIVE_MESSAGE,
  LACHEIE_RESEND_ALREADY_RUNNING_MESSAGE,
  LACHEIE_RESEND_MAX_RATE_LIMIT_RETRIES,
  LACHEIE_RESEND_NOTHING_TO_SEND_MESSAGE,
  LACHEIE_WITHDRAW_REASON,
  laCheieResendDelayMs,
  laCheieResendFinalStatus,
  parseLaCheieAccountWriteRate,
  selectLaCheieResendTargets,
  type LaCheieResendCandidate,
  type LaCheieResendJobStatus,
} from "@/lib/portals/lacheie/resend";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ResendAdmin = {
  from: (table: string) => any;
  /** Preluarea/eliberarea atomică a jobului (funcții din bază, service_role). */
  rpc: (
    name: "claim_lacheie_resend_job" | "release_lacheie_resend_job",
    params: any,
  ) => any;
};

export type LaCheieResendJobRow = {
  id: string;
  organization_id: string;
  status: LaCheieResendJobStatus;
  total: number;
  sent: number;
  failed: number;
  write_rate: number;
  cancel_requested: boolean;
  last_error: string | null;
  started_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type LaCheieResendItemRow = {
  id: string;
  property_id: string;
  status: "queued" | "sent" | "failed" | "skipped";
  error: string | null;
  attempts: number;
};

const JOB_TABLE = "lacheie_resend_jobs";
const ITEM_TABLE = "lacheie_resend_items";

/* ----------------------------- ce se retrimite ---------------------------- */

export async function collectLaCheieResendCandidates(
  admin: ResendAdmin,
  organizationId: string,
): Promise<LaCheieResendCandidate[]> {
  const [{ data: publications }, { data: listings }] = await Promise.all([
    admin
      .from("portal_publications")
      .select("property_id, enabled, withdraw_reason")
      .eq("organization_id", organizationId)
      .eq("portal_key", LACHEIE_PORTAL_KEY),
    admin
      .from("portal_listings")
      .select("property_id, withdraw_reason")
      .eq("organization_id", organizationId)
      .eq("portal", LACHEIE_PORTAL_KEY),
  ]);

  const candidates: LaCheieResendCandidate[] = (publications ?? []).map((row: any) => ({
    propertyId: row.property_id as string,
    enabled: (row.enabled ?? null) as boolean | null,
    withdrawReason: (row.withdraw_reason ?? null) as string | null,
  }));
  const seen = new Set(candidates.map((candidate) => candidate.propertyId));
  for (const row of (listings ?? []) as any[]) {
    // O ofertă retrasă de dezactivare fără rând de selecție trebuie retrimisă.
    if (row.withdraw_reason !== LACHEIE_WITHDRAW_REASON.agencyDeactivated) continue;
    if (seen.has(row.property_id)) continue;
    candidates.push({
      propertyId: row.property_id as string,
      enabled: null,
      withdrawReason: LACHEIE_WITHDRAW_REASON.agencyDeactivated,
    });
    seen.add(row.property_id);
  }
  return candidates;
}

/* --------------------------------- jobul --------------------------------- */

export async function activeLaCheieResendJob(
  admin: ResendAdmin,
  organizationId: string,
): Promise<LaCheieResendJobRow | null> {
  const { data } = await admin
    .from(JOB_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", LACHEIE_RESEND_ACTIVE_STATUSES as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as LaCheieResendJobRow | null;
}

export async function latestLaCheieResendJob(
  admin: ResendAdmin,
  organizationId: string,
): Promise<LaCheieResendJobRow | null> {
  const { data } = await admin
    .from(JOB_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as LaCheieResendJobRow | null;
}

/** Un singur job activ pe agenție; nimic nu pornește automat. */
export async function startLaCheieResendJob(
  admin: ResendAdmin,
  input: { organizationId: string; startedBy: string | null; writeRate?: number },
): Promise<{ jobId: string; total: number }> {
  const running = await activeLaCheieResendJob(admin, input.organizationId);
  if (running) throw new Error(LACHEIE_RESEND_ALREADY_RUNNING_MESSAGE);

  const candidates = await collectLaCheieResendCandidates(admin, input.organizationId);
  const propertyIds = selectLaCheieResendTargets(candidates);
  if (propertyIds.length === 0) throw new Error(LACHEIE_RESEND_NOTHING_TO_SEND_MESSAGE);

  const { data: job, error } = await admin
    .from(JOB_TABLE)
    .insert({
      organization_id: input.organizationId,
      status: "queued",
      total: propertyIds.length,
      write_rate: input.writeRate ?? LACHEIE_DEFAULT_WRITE_RATE,
      started_by: input.startedBy,
    })
    .select("id")
    .maybeSingle();
  if (error || !job) {
    // Indexul unic pe agenție transformă o cursă în același mesaj clar.
    throw new Error(error?.message ?? LACHEIE_RESEND_ALREADY_RUNNING_MESSAGE);
  }

  const { error: itemsError } = await admin.from(ITEM_TABLE).insert(
    propertyIds.map((propertyId) => ({
      job_id: job.id,
      organization_id: input.organizationId,
      property_id: propertyId,
      status: "queued",
    })),
  );
  if (itemsError) throw new Error(itemsError.message);
  return { jobId: job.id as string, total: propertyIds.length };
}

export async function requestLaCheieResendCancel(
  admin: ResendAdmin,
  organizationId: string,
): Promise<{ cancelled: boolean }> {
  const job = await activeLaCheieResendJob(admin, organizationId);
  if (!job) return { cancelled: false };
  await admin
    .from(JOB_TABLE)
    .update(
      job.status === "queued"
        ? { cancel_requested: true, status: "cancelled", finished_at: new Date().toISOString() }
        : { cancel_requested: true },
    )
    .eq("id", job.id);
  return { cancelled: true };
}

export type LaCheieResendProgress = {
  id: string;
  status: LaCheieResendJobStatus;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  cancelRequested: boolean;
  failures: { propertyId: string; error: string | null }[];
};

export async function readLaCheieResendProgress(
  admin: ResendAdmin,
  organizationId: string,
): Promise<LaCheieResendProgress | null> {
  const job = (await activeLaCheieResendJob(admin, organizationId)) ??
    (await latestLaCheieResendJob(admin, organizationId));
  if (!job) return null;
  const { data: failures } = await admin
    .from(ITEM_TABLE)
    .select("property_id, error")
    .eq("job_id", job.id)
    .eq("status", "failed");
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    sent: job.sent,
    failed: job.failed,
    pending: Math.max(0, job.total - job.sent - job.failed),
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    lastError: job.last_error,
    cancelRequested: job.cancel_requested === true,
    failures: ((failures ?? []) as any[]).map((row) => ({
      propertyId: row.property_id as string,
      error: (row.error ?? null) as string | null,
    })),
  };
}

/* ------------------------------- procesarea ------------------------------- */

export type ResendActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string; retryAfterMs?: number | null };

export type ProcessResendDeps = {
  /** Retrimiterea reală: fluxul normal de actualizare al portalului. */
  executeAction: (input: {
    organizationId: string;
    propertyId: string;
    actorId: string | null;
  }) => Promise<ResendActionResult>;
  /** Statusul agenției la La Cheie, citit din conexiune. */
  agencyStatus: (organizationId: string) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  /** Câte oferte procesează o rulare de worker. */
  maxItems?: number;
  /** Bugetul de timp al unei rulări: nimic nu doarme peste el. */
  budgetMs?: number;
  /** Ceasul, injectabil în teste. */
  now?: () => number;
  /** Cât timp rămâne blocat jobul preluat de această rulare. */
  lockSeconds?: number;
};

/** Mesajul intern când jobul este deja procesat de altă rulare. */
export const LACHEIE_RESEND_LOCKED_MESSAGE = "locked";
/** Mesajul intern când rulările s-au oprit din cauza limitării portalului. */
export const LACHEIE_RESEND_DEFERRED_MESSAGE = "rate_limited";
/** Mesajul intern când bugetul de timp al rulării s-a epuizat. */
export const LACHEIE_RESEND_BUDGET_MESSAGE = "budget_exhausted";

async function finish(
  admin: ResendAdmin,
  jobId: string,
  status: LaCheieResendJobStatus,
  lastError: string | null,
) {
  await admin
    .from(JOB_TABLE)
    .update({
      status,
      last_error: lastError,
      finished_at: new Date().toISOString(),
      locked_until: null,
    })
    .eq("id", jobId);
}

export async function processLaCheieResendJob(
  admin: ResendAdmin,
  jobId: string,
  deps: ProcessResendDeps,
): Promise<{
  status: LaCheieResendJobStatus;
  sent: number;
  failed: number;
  processed: number;
  stopped: string | null;
}> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxItems = deps.maxItems ?? 50;
  const budgetMs = deps.budgetMs ?? 40_000;
  const clock = deps.now ?? (() => Date.now());
  const startedAt = clock();
  const remaining = () => budgetMs - (clock() - startedAt);

  /**
   * Preluarea atomică: dacă altă rulare a worker-ului ține deja jobul (sau
   * jobul este amânat după un 429), această rulare nu procesează nimic.
   */
  const { data: claimed } = await admin.rpc("claim_lacheie_resend_job", {
    _job_id: jobId,
    _ttl_seconds: deps.lockSeconds ?? Math.ceil(budgetMs / 1000) + 20,
  });
  const claimedRow = (Array.isArray(claimed) ? claimed[0] : claimed) ?? null;
  const job = claimedRow as LaCheieResendJobRow | null;
  if (!job || !(LACHEIE_RESEND_ACTIVE_STATUSES as readonly string[]).includes(job.status)) {
    const { data: existing } = await admin
      .from(JOB_TABLE)
      .select("status, sent, failed")
      .eq("id", jobId)
      .maybeSingle();
    const row = (existing ?? null) as Pick<
      LaCheieResendJobRow,
      "status" | "sent" | "failed"
    > | null;
    return {
      status: (row?.status ?? "done") as LaCheieResendJobStatus,
      sent: row?.sent ?? 0,
      failed: row?.failed ?? 0,
      processed: 0,
      stopped: job ? null : LACHEIE_RESEND_LOCKED_MESSAGE,
    };
  }

  /** Eliberarea blocării: orice ieșire fără încheierea jobului o șterge. */
  const release = async () => {
    await admin.rpc("release_lacheie_resend_job", { _job_id: jobId });
  };

  if (job.cancel_requested) {
    await finish(admin, jobId, "cancelled", job.last_error);
    return { status: "cancelled", sent: job.sent, failed: job.failed, processed: 0, stopped: null };
  }

  const status = await deps.agencyStatus(job.organization_id);
  if (status !== "active") {
    await finish(admin, jobId, "failed", LACHEIE_RESEND_AGENCY_INACTIVE_MESSAGE);
    return {
      status: "failed",
      sent: job.sent,
      failed: job.failed,
      processed: 0,
      stopped: LACHEIE_RESEND_AGENCY_INACTIVE_MESSAGE,
    };
  }

  if (job.status === "queued") {
    await admin
      .from(JOB_TABLE)
      .update({ status: "running", started_at: job.started_at ?? new Date().toISOString() })
      .eq("id", jobId);
  }

  const delay = laCheieResendDelayMs(job.write_rate);
  let sent = job.sent;
  let failed = job.failed;
  let processed = 0;
  let stopped: string | null = null;
  let finalStatus: LaCheieResendJobStatus | null = null;

  while (processed < maxItems) {
    if (remaining() <= 0) {
      // Bugetul rulării s-a epuizat: jobul rămâne în lucru, blocarea se eliberează.
      stopped = LACHEIE_RESEND_BUDGET_MESSAGE;
      break;
    }
    // Anularea este citită la fiecare pas: se opreșteodată cerută.
    const { data: fresh } = await admin
      .from(JOB_TABLE)
      .select("cancel_requested")
      .eq("id", jobId)
      .maybeSingle();
    if ((fresh as { cancel_requested?: boolean } | null)?.cancel_requested === true) {
      finalStatus = "cancelled";
      break;
    }

    const { data: itemData } = await admin
      .from(ITEM_TABLE)
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const item = (itemData ?? null) as LaCheieResendItemRow | null;
    if (!item) {
      finalStatus = "done";
      break;
    }

    const result = await deps.executeAction({
      organizationId: job.organization_id,
      propertyId: item.property_id,
      actorId: job.started_by,
    });
    processed += 1;

    if (result.ok) {
      sent += 1;
      await admin
        .from(ITEM_TABLE)
        .update({ status: "sent", error: null, processed_at: new Date().toISOString() })
        .eq("id", item.id);
      // Oferta redevine publicată, fără motiv de retragere.
      await admin
        .from("portal_publications")
        .update({ enabled: true, withdraw_reason: null })
        .eq("organization_id", job.organization_id)
        .eq("portal_key", LACHEIE_PORTAL_KEY)
        .eq("property_id", item.property_id);
      await admin
        .from("portal_listings")
        .update({ withdraw_reason: null })
        .eq("organization_id", job.organization_id)
        .eq("portal", LACHEIE_PORTAL_KEY)
        .eq("property_id", item.property_id);
      await admin.from(JOB_TABLE).update({ sent, failed }).eq("id", jobId);
      // Ritmul se respectă în interiorul bugetului rulării, nu peste el.
      await sleep(Math.max(0, Math.min(delay, remaining())));
      continue;
    }

    if (result.code === "RATE_LIMIT" && item.attempts + 1 < LACHEIE_RESEND_MAX_RATE_LIMIT_RETRIES) {
      // 429 / limită locală: oferta rămâne în coadă (aceeași versiune, același
      // corp), iar jobul se amână până la momentul cerut de portal. Rularea se
      // încheie aici — nimic nu doarme minute întregi în interiorul cererii.
      const waitMs = result.retryAfterMs ?? 60_000;
      await admin
        .from(ITEM_TABLE)
        .update({ attempts: item.attempts + 1, error: result.message })
        .eq("id", item.id);
      await admin
        .from(JOB_TABLE)
        .update({
          sent,
          failed,
          last_error: result.message,
          next_attempt_at: new Date(clock() + waitMs).toISOString(),
          locked_until: null,
        })
        .eq("id", jobId);
      return { status: "running", sent, failed, processed, stopped: LACHEIE_RESEND_DEFERRED_MESSAGE };
    }

    failed += 1;
    await admin
      .from(ITEM_TABLE)
      .update({
        status: "failed",
        attempts: item.attempts + 1,
        error: result.message,
        processed_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    await admin.from(JOB_TABLE).update({ sent, failed }).eq("id", jobId);
    await sleep(Math.max(0, Math.min(delay, remaining())));
  }

  if (finalStatus === null) {
    // Bugetul rulării s-a epuizat: jobul rămâne „running”, worker-ul continuă.
    await release();
    return { status: "running", sent, failed, processed, stopped };
  }

  const agencyStillActive = (await deps.agencyStatus(job.organization_id)) === "active";
  if (!agencyStillActive) {
    stopped = LACHEIE_RESEND_AGENCY_INACTIVE_MESSAGE;
  }
  const resolved =
    finalStatus === "cancelled"
      ? "cancelled"
      : laCheieResendFinalStatus({ cancelled: false, agencyActive: agencyStillActive });
  await finish(admin, jobId, resolved, stopped);
  return { status: resolved, sent, failed, processed, stopped };
}

/* ------------------------- limita reală de scrieri ------------------------ */

/**
 * `GET /account` raportează limitele agenției. Ritmul retrimiterii îl respectă;
 * dacă apelul nu reușește, rămâne limita din documentație (60 scrieri/min).
 */
export async function fetchLaCheieWriteRate(config: {
  baseUrl: string;
  apiKey: string;
  environment: any;
  agencyExternalId?: string | null;
  connectionKey: string;
}): Promise<number> {
  try {
    const { laCheieRequest } = await import("@/lib/portals/lacheie/client.server");
    const response = await laCheieRequest(config as never, { method: "GET", path: "/account" });
    if (!response.ok) return LACHEIE_DEFAULT_WRITE_RATE;
    return parseLaCheieAccountWriteRate(response.body);
  } catch {
    return LACHEIE_DEFAULT_WRITE_RATE;
  }
}
