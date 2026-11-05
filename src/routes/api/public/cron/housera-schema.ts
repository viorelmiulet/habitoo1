/** Cron zilnic Housera: reîmprospătează nomenclatorul (`GET schema`, ETag/304). Fără scrieri la Housera. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/housera-schema")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { refreshHouseraSchema } = await import("@/lib/portals/housera/taxonomy.server");
        try {
          const r = await refreshHouseraSchema(process.env, null);
          return Response.json({ ok: true, status: r.status, retired: r.cached.affected.retired.length, withdrawn: r.cached.affected.withdrawn.length });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 502 });
        }
      },
    },
  },
});
