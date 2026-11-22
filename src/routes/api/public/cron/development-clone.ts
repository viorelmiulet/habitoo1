/** Worker pentru alocarea în fundal la ansambluri: pornit la creare (nonce) și de programarea pe minut. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", { _purpose: "development_clone", _token: nonce });
    return data === true ? null : new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/public/cron/development-clone")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticate(request);
        if (unauthorized) return unauthorized;
        const { runDevelopmentCloneJobs } = await import("@/lib/developments/clone-jobs.server");
        const result = await runDevelopmentCloneJobs();
        // Exporturile CSV mari folosesc aceeași pornire (nonce) și programare pe minut.
        const { runPropertyExportJobs } = await import("@/lib/property-export.server");
        const exports = await runPropertyExportJobs().catch(() => ({ exports: 0 }));
        // Importurile IMMOFLUX (SuperAdmin) folosesc aceeași pornire și programare.
        const { runImmofluxImportJobs } = await import("@/lib/property-import/immoflux/api-import.server");
        const immoflux = await runImmofluxImportJobs().catch(() => ({ immofluxJobs: 0 }));
        return Response.json({ ok: true, ...result, ...exports, ...immoflux });
      },
    },
  },
});
