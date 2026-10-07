/** Cron VDI.ro: reia lead-urile neprocesate și trage `GET /apileaduri` (rezervă). */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/vdi-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nonce = request.headers.get("x-cron-nonce");
        if (nonce) {
          const { data } = await supabaseAdmin.rpc("cron_nonce_claim", { _purpose: "vdi_leads", _token: nonce });
          if (data !== true) return new Response("Unauthorized", { status: 401 });
        } else {
          const unauthorized = await authenticateCronRequest(request);
          if (unauthorized) return unauthorized;
        }
        const { retryVdiLeadEvents, pollAllVdiLeads } = await import("@/lib/portals/vdi/leads.server");
        const retried = await retryVdiLeadEvents(supabaseAdmin, 15_000);
        const recorded = await pollAllVdiLeads(supabaseAdmin, 20_000);
        return Response.json({ ok: true, retried, recorded });
      },
    },
  },
});
