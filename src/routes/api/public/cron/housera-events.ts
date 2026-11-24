/** Cron la 15 minute: reia evenimentele Housera și HomeZZ neprocesate și recuperează cele Housera pierdute (`GET events`). */
import { keepRouteHandlersAlive } from "@/lib/after-response";
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/housera-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { runHouseraEventsCron } = await import("@/lib/portals/housera/cron.server");
        try {
          // Blocuri separate: HomeZZ se reia și când Housera aruncă eroare.
          let result: Record<string, unknown> | null = null;
          let houseraError: string | null = null;
          try { result = (await runHouseraEventsCron()) as Record<string, unknown>; } catch (e) { houseraError = e instanceof Error ? e.message : "error"; }
          const { retryHomezzEvents } = await import("@/lib/portals/homezz/callback.server");
          const homezz = await retryHomezzEvents().catch(() => ({ attempted: 0, succeeded: 0 }));
          if (houseraError) return Response.json({ ok: false, error: houseraError, homezz }, { status: 500 });
          return Response.json({ ...result, homezz });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
        }
      },
    },
  },
});

// Lucrul continuă prin waitUntil chiar dacă apelantul închide conexiunea; răspunsul rămâne același.
keepRouteHandlersAlive(Route);
