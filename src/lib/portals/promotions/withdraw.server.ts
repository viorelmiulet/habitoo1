/**
 * Retragerile provocate de reducerea alocărilor de promovare (server-only).
 *
 * Când administratorul agenției coboară alocarea unui coleg sau plafonul
 * agenției sub consumul real, surplusul se retrage prin fluxul normal al
 * portalului — apel real către Imobiliare.ro — cel mai recent activat primul.
 * Totul se întâmplă durabil, în worker (cron armat la punerea în coadă), NU în
 * browser: fiecare eșec se raportează pe proprietate și nu blochează salvarea.
 */
import { planPromotionWithdrawals, type PromotionWithdrawPlanItem } from "./allocation";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PromotionWithdrawAdmin = {
  from: (table: string) => any;
  rpc: (
    name:
      | "claim_promotion_withdraw_job"
      | "release_promotion_withdraw_job"
      | "promotion_withdraw_arm",
    params: any,
  ) => any;
};

const JOB_TABLE = "promotion_withdraw_jobs";
const ITEM_TABLE = "promotion_withdraw_items";

export const PROMOTION_WITHDRAW_REASON = "promotion_limit";
export const PROMOTION_WITHDRAW_ARM_FAILED_MESSAGE =
  "Retragerile nu au putut fi programate. Salvarea s-a păstrat; încearcă din nou.";
export const PROMOTION_WITHDRAW_ACTIVE_STATUSES = ["queued", "running"] as const;
export const PROMOTION_WITHDRAW_LOCKED_MESSAGE = "locked";
export const PROMOTION_WITHDRAW_DEFERRED_MESSAGE = "rate_limited";
export const PROMOTION_WITHDRAW_BUDGET_MESSAGE = "budget_exhausted";

export type PromotionWithdrawJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type PromotionWithdrawPreviewItem = PromotionWithdrawPlanItem & {
  serviceKey: string;
  serviceLabel: string;
  reference: string | null;
  title: string | null;
  agentName: string | null;
};

/**
 * Ce s-ar retrage dacă noile limite s-ar salva acum. Aceeași funcție alimentează
 * dialogul de confirmare și punerea în coadă, deci confirmarea nu minte.
 */
export async function planPromotionServiceWithdrawals(input: {
  admin: any;
  session: any;
  organizationId: string;
  definition: { id: string; label: string; kind: "boolean" | "numeric" };
  /** Plafonul propus; `undefined` = rămâne cel curent. */
  agencyCap?: number | null;
  /** Alocarea propusă pentru un coleg; `undefined` = rămâne cea curentă. */
  allocation?: { userId: string; amount: number | null };
}): Promise<{ items: PromotionWithdrawPreviewItem[]; skipped: number }> {
  const { loadPromotionAllocations, loadPromotionSettings, loadPromotionHoldings } = await import(
    "./allocation.server"
  );

  const [settings, allocationsByService, holdings] = await Promise.all([
    loadPromotionSettings(input.admin, { organizationId: input.organizationId }),
    loadPromotionAllocations(input.admin, { organizationId: input.organizationId }),
    loadPromotionHoldings({
      admin: input.admin,
      session: input.session,
      organizationId: input.organizationId,
      definition: input.definition as never,
    }),
  ]);

  const allocations =
    allocationsByService.get(input.definition.id) ?? new Map<string, number | null>();
  if (input.allocation) allocations.set(input.allocation.userId, input.allocation.amount);
  const agencyCap =
    input.agencyCap !== undefined
      ? input.agencyCap
      : (settings.get(input.definition.id)?.agencyCap ?? null);

  const plan = planPromotionWithdrawals({
    kind: input.definition.kind,
    holdings: holdings.holdings,
    agencyCap,
    allocations,
  });
  if (plan.length === 0) return { items: [], skipped: holdings.skipped };

  const ids = [...new Set(plan.map((item) => item.propertyId))];
  const [{ data: props }, { data: profiles }] = await Promise.all([
    input.admin.from("properties").select("id, reference, title").in("id", ids),
    input.admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("organization_id", input.organizationId),
  ]);
  const propById = new Map(((props ?? []) as any[]).map((row) => [row.id as string, row]));
  const nameById = new Map(
    ((profiles ?? []) as any[]).map((row) => [
      row.id as string,
      (row.full_name?.trim() || row.email || null) as string | null,
    ]),
  );

  return {
    skipped: holdings.skipped,
    items: plan.map((item) => ({
      ...item,
      serviceKey: input.definition.id,
      serviceLabel: input.definition.label,
      reference: (propById.get(item.propertyId)?.reference ?? null) as string | null,
      title: (propById.get(item.propertyId)?.title ?? null) as string | null,
      agentName: item.userId ? (nameById.get(item.userId) ?? null) : null,
    })),
  };
}

/* --------------------------------- coada --------------------------------- */

export async function enqueuePromotionWithdrawals(
  admin: PromotionWithdrawAdmin,
  input: {
    organizationId: string;
    portalKey: string;
    items: { propertyId: string; serviceKey: string; targetAmount: number | null }[];
    startedBy: string | null;
  },
): Promise<{ jobId: string | null; total: number; armed: boolean; error: string | null }> {
  if (input.items.length === 0) return { jobId: null, total: 0, armed: true, error: null };

  const { data: job, error } = await admin
    .from(JOB_TABLE)
    .insert({
      organization_id: input.organizationId,
      portal_key: input.portalKey,
      status: "queued",
      total: input.items.length,
      reason: PROMOTION_WITHDRAW_REASON,
      started_by: input.startedBy,
    })
    .select("id")
    .maybeSingle();
  if (error || !job) {
    return { jobId: null, total: 0, armed: false, error: error?.message ?? "insert_failed" };
  }

  const { error: itemsError } = await admin.from(ITEM_TABLE).insert(
    input.items.map((item, index) => ({
      job_id: job.id,
      organization_id: input.organizationId,
      portal_key: input.portalKey,
      service_key: item.serviceKey,
      property_id: item.propertyId,
      target_amount: item.targetAmount,
      position: index,
      status: "queued",
    })),
  );
  if (itemsError) {
    return { jobId: job.id as string, total: 0, armed: false, error: itemsError.message };
  }

  const { error: armError } = await admin.rpc("promotion_withdraw_arm", {});
  if (armError) {
    await admin
      .from(JOB_TABLE)
      .update({
        status: "failed",
        last_error: PROMOTION_WITHDRAW_ARM_FAILED_MESSAGE,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return {
      jobId: job.id as string,
      total: input.items.length,
      armed: false,
      error: PROMOTION_WITHDRAW_ARM_FAILED_MESSAGE,
    };
  }

  return { jobId: job.id as string, total: input.items.length, armed: true, error: null };
}

export type PromotionWithdrawProgress = {
  id: string;
  status: PromotionWithdrawJobStatus;
  total: number;
  done: number;
  failed: number;
  pending: number;
  lastError: string | null;
  createdAt: string | null;
  finishedAt: string | null;
  failures: { propertyId: string; serviceKey: string; error: string | null }[];
};

export async function readPromotionWithdrawProgress(
  admin: PromotionWithdrawAdmin,
  organizationId: string,
): Promise<PromotionWithdrawProgress | null> {
  const { data } = await admin
    .from(JOB_TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const job = (data ?? null) as any;
  if (!job) return null;
  const { data: failures } = await admin
    .from(ITEM_TABLE)
    .select("property_id, service_key, error")
    .eq("job_id", job.id)
    .eq("status", "failed");
  return {
    id: job.id as string,
    status: job.status as PromotionWithdrawJobStatus,
    total: job.total ?? 0,
    done: job.done ?? 0,
    failed: job.failed ?? 0,
    pending: Math.max(0, (job.total ?? 0) - (job.done ?? 0) - (job.failed ?? 0)),
    lastError: (job.last_error ?? null) as string | null,
    createdAt: (job.created_at ?? null) as string | null,
    finishedAt: (job.finished_at ?? null) as string | null,
    failures: ((failures ?? []) as any[]).map((row) => ({
      propertyId: row.property_id as string,
      serviceKey: row.service_key as string,
      error: (row.error ?? null) as string | null,
    })),
  };
}

/* ------------------------------- procesarea ------------------------------- */

export type PromotionWithdrawActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string; retryAfterMs?: number | null };

export type ProcessPromotionWithdrawDeps = {
  /** Retragerea reală prin fluxul normal al portalului. */
  executeAction: (input: {
    organizationId: string;
    portalKey: string;
    propertyId: string;
    serviceKey: string;
    targetAmount: number | null;
    actorId: string | null;
  }) => Promise<PromotionWithdrawActionResult>;
  maxItems?: number;
  budgetMs?: number;
  now?: () => number;
  lockSeconds?: number;
};

export async function processPromotionWithdrawJob(
  admin: PromotionWithdrawAdmin,
  jobId: string,
  deps: ProcessPromotionWithdrawDeps,
): Promise<{
  status: PromotionWithdrawJobStatus;
  done: number;
  failed: number;
  processed: number;
  stopped: string | null;
}> {
  const maxItems = deps.maxItems ?? 50;
  const budgetMs = deps.budgetMs ?? 40_000;
  const clock = deps.now ?? (() => Date.now());
  const startedAt = clock();
  const remaining = () => budgetMs - (clock() - startedAt);

  const { data: claimed } = await admin.rpc("claim_promotion_withdraw_job", {
    _job_id: jobId,
    _ttl_seconds: deps.lockSeconds ?? Math.ceil(budgetMs / 1000) + 20,
  });
  const job = ((Array.isArray(claimed) ? claimed[0] : claimed) ?? null) as any;
  if (!job || !(PROMOTION_WITHDRAW_ACTIVE_STATUSES as readonly string[]).includes(job.status)) {
    const { data: existing } = await admin
      .from(JOB_TABLE)
      .select("status, done, failed")
      .eq("id", jobId)
      .maybeSingle();
    const row = (existing ?? null) as any;
    return {
      status: (row?.status ?? "done") as PromotionWithdrawJobStatus,
      done: row?.done ?? 0,
      failed: row?.failed ?? 0,
      processed: 0,
      stopped: job ? null : PROMOTION_WITHDRAW_LOCKED_MESSAGE,
    };
  }

  const finish = async (status: PromotionWithdrawJobStatus, lastError: string | null) => {
    await admin
      .from(JOB_TABLE)
      .update({
        status,
        last_error: lastError,
        finished_at: new Date().toISOString(),
        locked_until: null,
      })
      .eq("id", jobId);
  };

  if (job.cancel_requested === true) {
    await finish("cancelled", job.last_error ?? null);
    return { status: "cancelled", done: job.done, failed: job.failed, processed: 0, stopped: null };
  }

  if (job.status === "queued") {
    await admin
      .from(JOB_TABLE)
      .update({ status: "running", started_at: job.started_at ?? new Date().toISOString() })
      .eq("id", jobId);
  }

  let done = job.done ?? 0;
  let failed = job.failed ?? 0;
  let processed = 0;
  let stopped: string | null = null;
  let finalStatus: PromotionWithdrawJobStatus | null = null;

  while (processed < maxItems) {
    if (remaining() <= 0) {
      stopped = PROMOTION_WITHDRAW_BUDGET_MESSAGE;
      break;
    }

    const { data: itemData } = await admin
      .from(ITEM_TABLE)
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "queued")
      // Cel mai recent activat primul: ordinea a fost fixată la punerea în coadă.
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    const item = (itemData ?? null) as any;
    if (!item) {
      finalStatus = "done";
      break;
    }

    const result = await deps.executeAction({
      organizationId: job.organization_id as string,
      portalKey: job.portal_key as string,
      propertyId: item.property_id as string,
      serviceKey: item.service_key as string,
      targetAmount: (item.target_amount ?? null) as number | null,
      actorId: (job.started_by ?? null) as string | null,
    });
    processed += 1;

    if (result.ok) {
      done += 1;
      await admin
        .from(ITEM_TABLE)
        .update({ status: "done", error: null, processed_at: new Date().toISOString() })
        .eq("id", item.id);
      await admin.from(JOB_TABLE).update({ done, failed }).eq("id", jobId);
      continue;
    }

    if (result.code === "RATE_LIMIT" && (item.attempts ?? 0) + 1 < 5) {
      const waitMs = result.retryAfterMs ?? 60_000;
      await admin
        .from(ITEM_TABLE)
        .update({ attempts: (item.attempts ?? 0) + 1, error: result.message })
        .eq("id", item.id);
      await admin
        .from(JOB_TABLE)
        .update({
          done,
          failed,
          last_error: result.message,
          next_attempt_at: new Date(clock() + waitMs).toISOString(),
          locked_until: null,
        })
        .eq("id", jobId);
      return {
        status: "running",
        done,
        failed,
        processed,
        stopped: PROMOTION_WITHDRAW_DEFERRED_MESSAGE,
      };
    }

    // Eșecul unei oferte se raportează, dar nu oprește coada și nu anulează
    // modificarea alocării.
    failed += 1;
    await admin
      .from(ITEM_TABLE)
      .update({
        status: "failed",
        attempts: (item.attempts ?? 0) + 1,
        error: result.message,
        processed_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    await admin.from(JOB_TABLE).update({ done, failed, last_error: result.message }).eq("id", jobId);
  }

  if (finalStatus) {
    await finish(finalStatus, failed > 0 ? "Unele oferte nu au putut fi retrase." : null);
    return { status: finalStatus, done, failed, processed, stopped };
  }

  await admin.rpc("release_promotion_withdraw_job", { _job_id: jobId });
  return { status: "running", done, failed, processed, stopped };
}
