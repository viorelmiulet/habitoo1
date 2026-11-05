/** Cron zilnic: reconciliază anunțurile Housera și confirmă disponibilitatea celor încă bifate. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/housera-availability")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { runHouseraAvailabilityCron } = await import("@/lib/portals/housera/cron.server");
        try {
          return Response.json(await runHouseraAvailabilityCron());
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
        }
      },
    },
  },
});
