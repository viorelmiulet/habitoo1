/** Cron la 15 minute: reia evenimentele Housera neprocesate și recuperează cele pierdute (`GET events`). */
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
          return Response.json(await runHouseraEventsCron());
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
        }
      },
    },
  },
});
