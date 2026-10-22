/**
 * Workerul publicării pe portaluri (`portal_publish_jobs`). Pornit la înscriere
 * și de cron-ul armat cât timp există joburi active.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "portal_publish",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/public/cron/portal-publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticate(request);
        if (unauthorized) return unauthorized;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runPortalPublishWorker } = await import("@/lib/portals/publish-jobs.server");
        const { applyPortalSelectionForOrg, executeListingAction } = await import("@/lib/portals.functions");
        const { runRepublishJob, refreshRepublishBatches } = await import("@/lib/portals/republish.server");
        const result = await runPortalPublishWorker(supabaseAdmin, async (job) => {
          // Republicare: doar retrimiterea anunțului existent, niciodată publish/withdraw.
          if (job.operation === "republish") {
            return runRepublishJob(supabaseAdmin, job, (input) => executeListingAction(input));
          }
          // imoradar24 (acțiune unică): doar `promote_imoradar = true`, fără republicare.
          if (job.operation === "imoradar") {
            const { runImoradarBackfillJob } = await import("@/lib/portals/imobiliare/imoradar-auto.server");
            return runImoradarBackfillJob(supabaseAdmin, job);
          }
          const out = await applyPortalSelectionForOrg({
            organizationId: job.organization_id,
            superadmin: job.superadmin,
            actorId: job.requested_by,
            data: {
              propertyId: job.property_id,
              selections: [
                {
                  portalId: job.portal_key,
                  enabled: job.enabled,
                  ...(job.promoted !== null ? { promoted: job.promoted } : {}),
                  ...(job.imobiliare_promotions ? { imobiliarePromotions: job.imobiliare_promotions } : {}),
                },
              ],
              syncExisting: job.sync_existing,
            },
          });
          return out.results.find((r) => r.portalId === job.portal_key) ?? null;
        });
        await refreshRepublishBatches(supabaseAdmin).catch((e: unknown) =>
          console.error("[portal-republish] progresul nu a putut fi actualizat", String(e).slice(0, 200)),
        );
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
