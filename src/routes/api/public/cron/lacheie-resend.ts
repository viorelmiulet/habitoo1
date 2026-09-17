/**
 * Worker-ul retrimiterii portofoliului La Cheie.
 *
 * Rulează server-side (cron/worker), niciodată în browser: ia jobul activ al
 * fiecărei agenții și retrimite ofertele una câte una, prin fluxul normal de
 * actualizare (stare completă, versiune mai mare, Retry-After la 429).
 * Nu pornește nimic din proprie inițiativă: procesează doar joburi create
 * explicit de un om.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { LACHEIE_PORTAL_KEY } from "@/lib/portals/lacheie/config";

const MAX_JOBS_PER_TICK = 3;

async function runResend(maxItems: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { processLaCheieResendJob } = await import("@/lib/portals/lacheie/resend.server");
  const { executeListingAction } = await import("@/lib/portals.functions");
  const { readLaCheieAgencyState } = await import("@/lib/portals/lacheie/agency");

  const { data: jobs } = await supabaseAdmin
    .from("lacheie_resend_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);

  const results: { jobId: string; status: string; sent: number; failed: number }[] = [];
  for (const job of jobs ?? []) {
    const outcome = await processLaCheieResendJob(supabaseAdmin as never, job.id, {
      maxItems,
      agencyStatus: async (organizationId: string) => {
        const { data: row } = await supabaseAdmin
          .from("portal_connections")
          .select("settings")
          .eq("organization_id", organizationId)
          .eq("portal", LACHEIE_PORTAL_KEY)
          .maybeSingle();
        return readLaCheieAgencyState((row?.settings ?? {}) as Record<string, unknown>).status;
      },
      executeAction: async ({ organizationId, propertyId, actorId }) => {
        const result = await executeListingAction({
          organizationId,
          actorId,
          portalId: LACHEIE_PORTAL_KEY,
          propertyId,
          action: "update",
          operationLabel: "agency_resend",
        });
        return result.ok
          ? { ok: true as const }
          : { ok: false as const, code: result.code, message: result.message };
      },
    });
    results.push({
      jobId: job.id,
      status: outcome.status,
      sent: outcome.sent,
      failed: outcome.failed,
    });
  }
  return results;
}

export const Route = createFileRoute("/api/public/cron/lacheie-resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const payload = (await request.json().catch(() => ({}))) as { maxItems?: number };
        const maxItems = Math.max(1, Math.min(payload.maxItems ?? 25, 200));
        const results = await runResend(maxItems);
        return new Response(JSON.stringify({ ok: true, jobs: results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
