/**
 * Worker-ul retragerilor automate la „Vândut” / „Închiriat” / „Arhivat”.
 * Armat la punerea în coadă, dezarmat când coada se golește.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "portal_status_withdraw",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/public/cron/portal-status-withdraw")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticate(request);
        if (unauthorized) return unauthorized;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runStatusWithdrawTick, realProcessDeps } = await import(
          "@/lib/portals/status-withdraw.server"
        );
        const deps = await realProcessDeps(supabaseAdmin as never);
        const results = await runStatusWithdrawTick(supabaseAdmin as never, deps, {
          maxItems: 25,
          budgetMs: 40_000,
        });
        return new Response(JSON.stringify({ ok: true, items: results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
