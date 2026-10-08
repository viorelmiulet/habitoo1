/** Cron zilnic: reîmprospătează tokenurile OLX.ro ale agențiilor conectate. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/olx-token-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nonce = request.headers.get("x-cron-nonce");
        if (nonce) {
          const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
            _purpose: "olx_token_refresh",
            _token: nonce,
          });
          if (data !== true) return new Response("Unauthorized", { status: 401 });
        } else {
          const unauthorized = await authenticateCronRequest(request);
          if (unauthorized) return unauthorized;
        }
        const { refreshAllOlxConnections } = await import("@/lib/portals/olx/oauth.server");
        return Response.json({ ok: true, ...(await refreshAllOlxConnections()) });
      },
    },
  },
});
