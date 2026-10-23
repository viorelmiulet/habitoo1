/**
 * Retenția anunțurilor particulare: șterge din `listings` anunțurile care nu
 * au mai fost reimportate de peste 60 de zile (pe baza `updated_at`). Când
 * workflow-ul reimportă un anunț, upsert-ul actualizează `updated_at`, deci
 * anunțul supraviețuiește cât timp mai există pe portal.
 * Programat zilnic prin http schedule; autentificare cu secretul de cron.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/listings-retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("purge_old_listings");
        if (error) {
          console.error(`[listings-retention] purge failed: ${error.message}`);
          return new Response(JSON.stringify({ ok: false, error: "purge_failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, deleted: data ?? 0 }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
