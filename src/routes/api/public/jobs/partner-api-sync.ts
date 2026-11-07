import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/partner-api-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const body = (await request.json().catch(() => ({}))) as { mode?: string };
        const mode = body.mode === "full" ? "full" : "queue";
        const { runPartnerSync } = await import("@/lib/partner-api/sync.server");
        try { return Response.json({ success: true, ...(await runPartnerSync(mode)) }); }
        catch { return Response.json({ success: false }, { status: 503 }); }
      },
    },
  },
});
