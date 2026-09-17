/**
 * Retragerile provocate de reducerea locurilor de publicare (server-only).
 *
 * Când administratorul agenției sau superadminul coboară o alocare (sau totalul
 * agenției) sub consumul real, surplusul se retrage de pe portal prin fluxul
 * normal de retragere — apel real către portal — cel mai recent publicat primul.
 * Totul se întâmplă durabil, în worker (cron armat la punerea în coadă), NU în
 * browser: fiecare eșec se raportează pe proprietate și nu blochează
 * modificarea alocării.
 */
import {
  planSlotWithdrawals,
  SLOT_LIMIT_WITHDRAW_REASON,
  sortListingsNewestFirst,
  type SlotListing,
} from "@/lib/portals/slots";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SlotWithdrawAdmin = {
  from: (table: string) => any;
  rpc: (
    name:
      | "claim_portal_slot_withdraw_job"
      | "release_portal_slot_withdraw_job"
      | "portal_slot_withdraw_arm",
    params: any,
  ) => any;
};

const JOB_TABLE = "portal_slot_withdraw_jobs";
const ITEM_TABLE = "portal_slot_withdraw_items";

export type SlotWithdrawJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export const SLOT_WITHDRAW_ARM_FAILED_MESSAGE =
  "Retragerile nu au putut fi programate. Salvarea s-a păstrat; încearcă din nou.";

export const SLOT_WITHDRAW_ACTIVE_STATUSES = ["queued", "running"] as const;

/* ------------------------------ ce se retrage ----------------------------- */

/** Anunțurile selectate și neretrase pe un portal, cu agentul responsabil. */
export async function loadPortalSlotListings(
  admin: SlotWithdrawAdmin,
  organizationId: string,
  portalKey: string,
): Promise<SlotListing[]> {
  const [{ data: publications }, { data: listings }, { data: properties }] = await Promise.all([
    admin
      .from("portal_publications")
      .select("property_id, created_at")
      .eq("organization_id", organizationId)
      .eq("portal_key", portalKey)
      .eq("enabled", true),
    admin
      .from("portal_listings")
      .select("property_id, published_at")
      .eq("organization_id", organizationId)
      .eq("portal", portalKey),
    admin.from("properties").select("id, assigned_to").eq("organization_id", organizationId),
  ]);

  const publishedAt = new Map<string, string | null>(
    ((listings ?? []) as any[]).map((row) => [row.property_id as string, row.published_at ?? null]),
  );
  const assignedTo = new Map<string, string | null>(
    ((properties ?? []) as any[]).map((row) => [row.id as string, row.assigned_to ?? null]),
  );

  return ((publications ?? []) as any[])
    .filter((row) => assignedTo.has(row.property_id))
    .map((row) => ({
      propertyId: row.property_id as string,
      agentId: assignedTo.get(row.property_id) ?? null,
      publishedAt: publishedAt.get(row.property_id) ?? null,
      createdAt: (row.created_at ?? null) as string | null,
    }));
}

export type SlotWithdrawPlanItem = {
  propertyId: string;
  reference: string | null;
  title: string | null;
  agentName: string | null;
};

/**
 * Ce s-ar retrage dacă noile limite s-ar salva acum. Se folosește atât pentru
 * dialogul de confirmare, cât și la salvare (aceeași funcție, același rezultat).
 */
export async function planPortalSlotWithdrawals(
  admin: SlotWithdrawAdmin,
  input: {
    organizationId: string;
    portalKey: string;
    /** Totalul propus al agenției; `undefined` = rămâne cel curent. */
    agencyTotal?: number | null;
    /** Alocarea propusă pentru un agent; `undefined` = rămâne cea curentă. */
    allocation?: { userId: string; slots: number | null };
  },
): Promise<SlotWithdrawPlanItem[]> {
  const [{ data: limitRow }, { data: allocationRows }] = await Promise.all([
    admin
      .from("portal_slot_limits")
      .select("total_slots")
      .eq("organization_id", input.organizationId)
      .eq("portal_key", input.portalKey)
      .maybeSingle(),
    admin
      .from("portal_slot_allocations")
      .select("user_id, slots")
      .eq("organization_id", input.organizationId)
      .eq("portal_key", input.portalKey),
  ]);

  const allocations = new Map<string, number | null>(
    ((allocationRows ?? []) as any[]).map((row) => [row.user_id as string, row.slots ?? null]),
  );
  if (input.allocation) allocations.set(input.allocation.userId, input.allocation.slots);
  const agencyTotal =
    input.agencyTotal !== undefined
      ? input.agencyTotal
      : (((limitRow ?? null) as { total_slots: number | null } | null)?.total_slots ?? null);

  const listings = await loadPortalSlotListings(admin, input.organizationId, input.portalKey);
  const ids = planSlotWithdrawals({ listings, agencyTotal, allocations });
  if (ids.length === 0) return [];

  // Ordinea afișată și cea de execuție: cel mai recent publicat primul.
  const ordered = sortListingsNewestFirst(listings.filter((row) => ids.includes(row.propertyId)));
  const [{ data: props }, { data: profiles }] = await Promise.all([
    admin
      .from("properties")
      .select("id, reference, title")
      .in(
        "id",
        ordered.map((row) => row.propertyId),
      ),
    admin.from("profiles").select("id, full_name, email").eq("organization_id", input.organizationId),
  ]);
  const propById = new Map(((props ?? []) as any[]).map((row) => [row.id as string, row]));
  const nameById = new Map(
    ((profiles ?? []) as any[]).map((row) => [
      row.id as string,
      (row.full_name?.trim() || row.email || null) as string | null,
    ]),
  );

  return ordered.map((row) => ({
    propertyId: row.propertyId,
    reference: (propById.get(row.propertyId)?.reference ?? null) as string | null,
    title: (propById.get(row.propertyId)?.title ?? null) as string | null,
    agentName: row.agentId ? (nameById.get(row.agentId) ?? null) : null,
  }));
}

/* --------------------------------- coada --------------------------------- */

export async function enqueuePortalSlotWithdrawals(
  admin: SlotWithdrawAdmin,
  input: {
    organizationId: string;
    portalKey: string;
    propertyIds: string[];
    startedBy: string | null;
  },
): Promise<{ jobId: string | null; total: number; armed: boolean; error: string | null }> {
  if (input.propertyIds.length === 0) {
    return { jobId: null, total: 0, armed: true, error: null };
  }

  const { data: job, error } = await admin
    .from(JOB_TABLE)
    .insert({
      organization_id: input.organizationId,
      portal_key: input.portalKey,
      status: "queued",
      total: input.propertyIds.length,
      reason: SLOT_LIMIT_WITHDRAW_REASON,
      started_by: input.startedBy,
    })
    .select("id")
    .maybeSingle();
  if (error || !job) {
    return { jobId: null, total: 0, armed: false, error: error?.message ?? "insert_failed" };
  }

  const { error: itemsError } = await admin.from(ITEM_TABLE).insert(
    input.propertyIds.map((propertyId, index) => ({
      job_id: job.id,
      organization_id: input.organizationId,
      portal_key: input.portalKey,
      property_id: propertyId,
      position: index,
      status: "queued",
    })),
  );
  if (itemsError) {
    return { jobId: job.id as string, total: 0, armed: false, error: itemsError.message };
  }

  // Worker-ul se armează abia acum și se dezarmează singur când coada se golește.
  const { error: armError } = await admin.rpc("portal_slot_withdraw_arm", {});
  if (armError) {
    await admin
      .from(JOB_TABLE)
      .update({
        status: "failed",
        last_error: SLOT_WITHDRAW_ARM_FAILED_MESSAGE,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return {
      jobId: job.id as string,
      total: input.propertyIds.length,
      armed: false,
      error: SLOT_WITHDRAW_ARM_FAILED_MESSAGE,
    };
  }

  return { jobId: job.id as string, total: input.propertyIds.length, armed: true, error: null };
}

export type SlotWithdrawProgress = {
  id: string;
  portalKey: string;
  status: SlotWithdrawJobStatus;
  total: number;
  done: number;
  failed: number;
  pending: number;
  lastError: string | null;
  createdAt: string | null;
  finishedAt: string | null;
  failures: { propertyId: string; error: string | null }[];
};

export async function readPortalSlotWithdrawProgress(
  admin: SlotWithdrawAdmin,
  organizationId: string,
): Promise<SlotWithdrawProgress | null> {
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
    .select("property_id, error")
    .eq("job_id", job.id)
    .eq("status", "failed");
  return {
    id: job.id as string,
    portalKey: job.portal_key as string,
    status: job.status as SlotWithdrawJobStatus,
    total: job.total ?? 0,
    done: job.done ?? 0,
    failed: job.failed ?? 0,
    pending: Math.max(0, (job.total ?? 0) - (job.done ?? 0) - (job.failed ?? 0)),
    lastError: (job.last_error ?? null) as string | null,
    createdAt: (job.created_at ?? null) as string | null,
    finishedAt: (job.finished_at ?? null) as string | null,
    failures: ((failures ?? []) as any[]).map((row) => ({
      propertyId: row.property_id as string,
      error: (row.error ?? null) as string | null,
    })),
  };
}

/* ------------------------------- procesarea ------------------------------- */

export type SlotWithdrawActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string; retryAfterMs?: number | null };

export type ProcessSlotWithdrawDeps = {
  /** Retragerea reală prin fluxul normal al portalului. */
  executeAction: (input: {
    organizationId: string;
    portalKey: string;
    propertyId: string;
    actorId: string | null;
  }) => Promise<SlotWithdrawActionResult>;
  maxItems?: number;
  budgetMs?: number;
  now?: () => number;
  lockSeconds?: number;
};

export const SLOT_WITHDRAW_LOCKED_MESSAGE = "locked";
export const SLOT_WITHDRAW_DEFERRED_MESSAGE = "rate_limited";
export const SLOT_WITHDRAW_BUDGET_MESSAGE = "budget_exhausted";

export async function processPortalSlotWithdrawJob(
  admin: SlotWithdrawAdmin,
  jobId: string,
  deps: ProcessSlotWithdrawDeps,
): Promise<{
  status: SlotWithdrawJobStatus;
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

  const { data: claimed } = await admin.rpc("claim_portal_slot_withdraw_job", {
    _job_id: jobId,
    _ttl_seconds: deps.lockSeconds ?? Math.ceil(budgetMs / 1000) + 20,
  });
  const job = ((Array.isArray(claimed) ? claimed[0] : claimed) ?? null) as any;
  if (!job || !(SLOT_WITHDRAW_ACTIVE_STATUSES as readonly string[]).includes(job.status)) {
    const { data: existing } = await admin
      .from(JOB_TABLE)
      .select("status, done, failed")
      .eq("id", jobId)
      .maybeSingle();
    const row = (existing ?? null) as any;
    return {
      status: (row?.status ?? "done") as SlotWithdrawJobStatus,
      done: row?.done ?? 0,
      failed: row?.failed ?? 0,
      processed: 0,
      stopped: job ? null : SLOT_WITHDRAW_LOCKED_MESSAGE,
    };
  }

  const finish = async (status: SlotWithdrawJobStatus, lastError: string | null) => {
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
  let finalStatus: SlotWithdrawJobStatus | null = null;

  while (processed < maxItems) {
    if (remaining() <= 0) {
      stopped = SLOT_WITHDRAW_BUDGET_MESSAGE;
      break;
    }

    const { data: itemData } = await admin
      .from(ITEM_TABLE)
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "queued")
      // Cel mai recent publicat primul: ordinea a fost fixată la punerea în coadă.
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
      // Limitarea portalului amână jobul exact cât cere el; oferta rămâne în coadă.
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
      return { status: "running", done, failed, processed, stopped: SLOT_WITHDRAW_DEFERRED_MESSAGE };
    }

    // Eșecul unei proprietăți se raportează, dar nu oprește restul cozii și nu
    // anulează modificarea alocării.
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

  await admin.rpc("release_portal_slot_withdraw_job", { _job_id: jobId });
  return { status: "running", done, failed, processed, stopped };
}
