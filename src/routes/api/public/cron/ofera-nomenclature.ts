import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
export const Route = createFileRoute("/api/public/cron/ofera-nomenclature")({
  server: { handlers: { POST: async ({ request }) => {
    const authFailure = await authenticateCronRequest(request);
    if (authFailure) return authFailure;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { count, error } = await db.from("portal_connections").select("id", { count: "exact", head: true }).eq("portal", "ofera").eq("activated", true);
    if (error) return Response.json({ ok: false, message: "Activările Ofera nu au putut fi verificate." }, { status: 503 });
    if (!count) return Response.json({ ok: true, skipped: true });
    const { syncOferaNomenclatureServer } = await import("@/lib/portals/ofera/nomenclature.server");
    const result = await syncOferaNomenclatureServer();
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } } },
});