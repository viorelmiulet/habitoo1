/** Cron (la 10 minute): starea anunțurilor Vrexa în verificare; cele active se reverifică zilnic. */
import { keepRouteHandlersAlive } from "@/lib/after-response";
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/vrexa-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { pollVrexaStatuses, vrexaStatusDeps } = await import("@/lib/portals/vrexa/status.server");
        return Response.json({ ok: true, ...(await pollVrexaStatuses(await vrexaStatusDeps())) });
      },
    },
  },
});

// Lucrul continuă prin waitUntil chiar dacă apelantul închide conexiunea; răspunsul rămâne același.
keepRouteHandlersAlive(Route);
