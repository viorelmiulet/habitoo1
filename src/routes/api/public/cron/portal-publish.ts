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
        const { applyPortalSelectionForOrg } = await import("@/lib/portals.functions");
        const result = await runPortalPublishWorker(supabaseAdmin, async (job) => {
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
                },
              ],
              syncExisting: job.sync_existing,
            },
          });
          return out.results.find((r) => r.portalId === job.portal_key) ?? null;
        });
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
