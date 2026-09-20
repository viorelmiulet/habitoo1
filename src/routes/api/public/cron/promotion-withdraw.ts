/**
 * Worker-ul retragerilor provocate de reducerea alocărilor de promovare.
 *
 * Rulează server-side (cron armat la punerea în coadă), niciodată în browser:
 * coboară serviciile una câte una prin fluxul normal al portalului, cel mai
 * recent activat primul.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const MAX_JOBS_PER_TICK = 3;
const TICK_BUDGET_MS = 40_000;

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "promotion_withdraw",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

async function runWithdrawals(maxItems: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { processPromotionWithdrawJob } = await import("@/lib/portals/promotions/withdraw.server");
  const { withdrawImobiliarePromotion } = await import(
    "@/lib/portals/promotions/withdraw-executor.server"
  );

  const nowIso = new Date().toISOString();
  const { data: jobs } = await supabaseAdmin
    .from("promotion_withdraw_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);

  const results: { jobId: string; status: string; done: number; failed: number }[] = [];
  for (const job of jobs ?? []) {
    const outcome = await processPromotionWithdrawJob(supabaseAdmin as never, job.id, {
      maxItems,
      budgetMs: TICK_BUDGET_MS,
      executeAction: async ({ organizationId, propertyId, serviceKey, targetAmount, actorId }) =>
        withdrawImobiliarePromotion({
          organizationId,
          propertyId,
          serviceKey,
          targetAmount,
          actorId,
        }),
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

export const Route = createFileRoute("/api/public/cron/promotion-withdraw")({
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
