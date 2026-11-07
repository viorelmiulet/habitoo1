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
        try { const sync=await runPartnerSync(mode); const {runWebhookWorker}=await import("@/lib/partner-api/webhook.server"); const webhooks=await runWebhookWorker(); return Response.json({ success: true, ...sync, webhooks }); }
        catch { return Response.json({ success: false }, { status: 503 }); }
      },
    },
  },
});
