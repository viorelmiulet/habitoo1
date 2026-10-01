import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (!nonce) return authenticateCronRequest(request);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("cron_nonce_claim", { _purpose: "account_deletion", _token: nonce });
  return data === true ? null : new Response("Unauthorized", { status: 401 });
}

export const Route = createFileRoute("/api/public/cron/account-deletion")({
  server: { handlers: { POST: async ({ request }) => {
    const unauthorized = await authenticate(request);
    if (unauthorized) return unauthorized;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { realDeletionDeps, runAccountDeletionTick } = await import("@/lib/account-deletion.server");
    const results = await runAccountDeletionTick(supabaseAdmin, await realDeletionDeps(supabaseAdmin), { budgetMs: 40_000, maxSteps: 6 });
    return Response.json({ ok: true, steps: results.length });
  } } },
});
