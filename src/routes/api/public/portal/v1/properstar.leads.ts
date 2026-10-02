// POST /api/public/portal/v1/properstar/leads — lead-uri trimise de Properstar (Basic Auth).
import { createFileRoute } from "@tanstack/react-router";

const HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

export const Route = createFileRoute("/api/public/portal/v1/properstar/leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleProperstarLead, collectProperstarHeaders } = await import("@/lib/portals/properstar/leads.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let rawBody = "";
        try {
          rawBody = (await request.text()).slice(0, 200_000);
        } catch {
          rawBody = "";
        }
        const res = await handleProperstarLead(
          supabaseAdmin,
          { rawBody, authorization: request.headers.get("authorization"), headers: collectProperstarHeaders(request) },
          { user: process.env["PROPERSTAR_LEADS_USER"], password: process.env["PROPERSTAR_LEADS_PASSWORD"] },
        );
        return new Response(JSON.stringify(res.body), {
          status: res.status,
          headers: res.status === 401 ? { ...HEADERS, "www-authenticate": 'Basic realm="Habitoo"' } : HEADERS,
        });
      },
    },
  },
});
