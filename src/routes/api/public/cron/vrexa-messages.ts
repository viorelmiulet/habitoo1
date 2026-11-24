/** Cron (la 5 minute): mesajele Vrexa ale agențiilor cu Vrexa activat → lead-uri. */
import { keepRouteHandlersAlive } from "@/lib/after-response";
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/vrexa-messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { runVrexaMessagesCron } = await import("@/lib/portals/vrexa/messages.server");
        return Response.json({ ok: true, ...(await runVrexaMessagesCron()) });
      },
    },
  },
});

keepRouteHandlersAlive(Route);
