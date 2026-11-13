/** Rapoartele săptămânale pentru proprietari (lunea, ora României). */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/owner-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { runOwnerReportsTick } = await import("@/lib/owner-reports/batch.server");
        try {
          return Response.json({ ok: true, ...(await runOwnerReportsTick()) });
        } catch (error) {
          console.error("[owner_report] tick failed", error instanceof Error ? error.message : "error");
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
