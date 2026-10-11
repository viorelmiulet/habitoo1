/** Cron Storia `/meta` (doar GET): `mode=pending` la 5 minute, `mode=reconcile` la 6 ore. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/storia-meta")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nonce = request.headers.get("x-cron-nonce");
        if (nonce) {
          const { data } = await supabaseAdmin.rpc("cron_nonce_claim", { _purpose: "storia_meta", _token: nonce });
          if (data !== true) return new Response("Unauthorized", { status: 401 });
        } else {
          const unauthorized = await authenticateCronRequest(request);
          if (unauthorized) return unauthorized;
        }
        const body = (await request.json().catch(() => ({}))) as { mode?: string; advertUuid?: string };
        const m = await import("@/lib/portals/storia/meta-sync.server");
        const result = body.mode === "reconcile" ? await m.reconcileStoriaAccounts() : await m.syncPendingStoriaListings(
                typeof body.advertUuid === "string" && /^[0-9a-f-]{36}$/i.test(body.advertUuid)
                  ? { advertUuid: body.advertUuid }
                  : undefined,
              );
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
