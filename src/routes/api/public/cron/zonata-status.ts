/** Cron (la 5 minute): statusul anunțurilor ZonaTa aflate „În verificare”. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/zonata-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { pollZonataInReview } = await import("@/lib/portals/zonata/status.server");
        return Response.json({ ok: true, ...(await pollZonataInReview()) });
      },
    },
  },
});
