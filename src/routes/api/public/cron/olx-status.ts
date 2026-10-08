/** Cron (la 3 minute, armat doar cât există anunțuri OLX în moderare): starea reală a anunțurilor. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/olx-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nonce = request.headers.get("x-cron-nonce");
        if (nonce) {
          const { data } = await supabaseAdmin.rpc("cron_nonce_claim", { _purpose: "olx_status", _token: nonce });
          if (data !== true) return new Response("Unauthorized", { status: 401 });
        } else {
          const unauthorized = await authenticateCronRequest(request);
          if (unauthorized) return unauthorized;
        }
        const { pollOlxPendingListings } = await import("@/lib/portals/adapters/olx-direct.server");
        return Response.json({ ok: true, ...(await pollOlxPendingListings()) });
      },
    },
  },
});
