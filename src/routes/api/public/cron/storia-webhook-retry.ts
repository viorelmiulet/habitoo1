/**
 * Reprocesarea notificărilor Storia eșuate. Armat la eșec, dezarmat când
 * nu mai există evenimente de reluat.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "storia_webhook_retry",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/public/cron/storia-webhook-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticate(request);
        if (unauthorized) return unauthorized;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runStoriaWebhookRetry } = await import("@/lib/portals/storia/webhook-retry.server");
        const { processStoriaNotification } = await import("@/lib/portals/storia/leads.server");
        const result = await runStoriaWebhookRetry(supabaseAdmin, processStoriaNotification, {
          maxItems: 20,
          budgetMs: 40_000,
        });
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
