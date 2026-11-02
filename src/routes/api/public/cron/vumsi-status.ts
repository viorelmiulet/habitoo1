/** Cron (la 10 minute): statusul real al anunțurilor Vumsi bifate (doar citiri). */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/vumsi-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { pollVumsiStatuses } = await import("@/lib/portals/vumsi/status.server");
        return Response.json({ ok: true, ...(await pollVumsiStatuses()) });
      },
    },
  },
});
