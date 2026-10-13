/**
 * Programările de publicare pe portaluri: cronul rulează la fiecare minut, dar
 * lucrează doar când există programări scadente (EXISTS ieftin înainte de orice).
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/portal-schedules")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: due } = await supabaseAdmin
          .from("portal_publish_schedules")
          .select("id")
          .eq("status", "scheduled")
          .lte("scheduled_at", new Date().toISOString())
          .limit(1);
        if (!due || due.length === 0) return Response.json({ ok: true, claimed: 0 });
        const { runDueSchedules } = await import("@/lib/portals/publish-schedule.server");
        const { enqueuePublishJobsForOrg } = await import("@/lib/portals/publish-enqueue.server");
        const { activatedPortalIds } = await import("@/lib/portals.functions");
        const { portalDisplayName } = await import("@/lib/portals/registry");
        const result = await runDueSchedules(
          supabaseAdmin,
          (input) =>
            enqueuePublishJobsForOrg({ ...input, loadAdmin: async () => supabaseAdmin, activatedPortalIds }),
          { portalName: (id) => portalDisplayName(id as never) },
        );
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
