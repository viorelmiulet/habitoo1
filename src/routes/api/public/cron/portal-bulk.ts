import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (!nonce) return authenticateCronRequest(request);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("cron_nonce_claim", { _purpose: "portal_bulk", _token: nonce });
  return data === true ? null : new Response("Unauthorized", { status: 401 });
}

export const Route = createFileRoute("/api/public/cron/portal-bulk")({
  server: { handlers: { POST: async ({ request }) => {
    const unauthorized = await authenticate(request);
    if (unauthorized) return unauthorized;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { realPortalBulkDeps, runPortalBulkTick } = await import("@/lib/portals/bulk.server");
    const results = await runPortalBulkTick(supabaseAdmin as never, await realPortalBulkDeps(), { maxProperties: 20, budgetMs: 40_000 });
    return Response.json({ ok: true, properties: results.length });
  } } },
});
