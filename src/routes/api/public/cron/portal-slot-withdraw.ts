/**
 * Worker-ul retragerilor provocate de reducerea locurilor de publicare.
 *
 * Rulează server-side (cron armat la punerea în coadă), niciodată în browser:
 * retrage ofertele una câte una prin fluxul normal al portalului, cel mai
 * recent publicat primul, cu motivul „slot_limit”.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { SLOT_LIMIT_WITHDRAW_REASON } from "@/lib/portals/slots";

const MAX_JOBS_PER_TICK = 3;
const TICK_BUDGET_MS = 40_000;

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "portal_slot_withdraw",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

async function runWithdrawals(maxItems: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { processPortalSlotWithdrawJob } = await import("@/lib/portals/slot-withdraw.server");
  const { executeListingAction } = await import("@/lib/portals.functions");

  const nowIso = new Date().toISOString();
  const { data: jobs } = await supabaseAdmin
    .from("portal_slot_withdraw_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);

  const results: { jobId: string; status: string; done: number; failed: number }[] = [];
  for (const job of jobs ?? []) {
    const outcome = await processPortalSlotWithdrawJob(supabaseAdmin as never, job.id, {
      maxItems,
      budgetMs: TICK_BUDGET_MS,
      executeAction: async ({ organizationId, portalKey, propertyId, actorId }) => {
        const result = await executeListingAction({
          organizationId,
          actorId,
          portalId: portalKey,
          propertyId,
          action: "withdraw",
          operationLabel: "slot_limit_withdraw",
          withdrawReason: SLOT_LIMIT_WITHDRAW_REASON,
        });
        return result.ok
          ? { ok: true as const }
          : {
              ok: false as const,
              code: result.code,
              message: result.message,
              retryAfterMs: result.retryAfterMs ?? null,
            };
      },
    });
    results.push({
      jobId: job.id,
      status: outcome.status,
      done: outcome.done,
      failed: outcome.failed,
    });
  }
  return results;
}

export const Route = createFileRoute("/api/public/cron/portal-slot-withdraw")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticate(request);
        if (unauthorized) return unauthorized;
        const payload = (await request.json().catch(() => ({}))) as { maxItems?: number };
        const maxItems = Math.max(1, Math.min(payload.maxItems ?? 25, 200));
        const results = await runWithdrawals(maxItems);
        return new Response(JSON.stringify({ ok: true, jobs: results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
