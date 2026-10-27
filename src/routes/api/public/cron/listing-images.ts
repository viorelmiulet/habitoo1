/**
 * Worker-ul cozii de poze pentru „Anunțuri particulari” (`listing_image_jobs`).
 * Programarea gestionată îl apelează în fiecare minut; fără poze în așteptare
 * iese imediat după o singură interogare.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/listing-images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { count } = await supabaseAdmin
          .from("listing_image_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        if (!count) return Response.json({ ok: true, idle: true });
        const { runListingImages } = await import("@/lib/listing-images.server");
        const result = await runListingImages({ admin: supabaseAdmin });
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
