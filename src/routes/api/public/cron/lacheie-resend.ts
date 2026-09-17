/**
 * Worker-ul retrimiterii portofoliului La Cheie.
 *
 * Rulează server-side (cron/worker), niciodată în browser: ia jobul activ al
 * fiecărei agenții și retrimite ofertele una câte una, prin fluxul normal de
 * actualizare (stare completă, versiune mai mare, Retry-After la 429).
 * Nu pornește nimic din proprie inițiativă: procesează doar joburi create
 * explicit de un om.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { LACHEIE_PORTAL_KEY } from "@/lib/portals/lacheie/config";

const MAX_JOBS_PER_TICK = 3;
/** Bugetul unei rulări: sub timpul unei cereri, ca nimic să nu fie retezat. */
const TICK_BUDGET_MS = 40_000;

/**
 * Apelantul: fie secretul de cron al platformei (Bearer), fie un jeton de
 * unică folosință emis chiar de jobul din baza de date, ca la abonamente.
 */
async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "lacheie_resend",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

async function runResend(maxItems: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { processLaCheieResendJob } = await import("@/lib/portals/lacheie/resend.server");
  const { executeListingAction } = await import("@/lib/portals.functions");
  const { readLaCheieAgencyState } = await import("@/lib/portals/lacheie/agency");

  const nowIso = new Date().toISOString();
  const { data: jobs } = await supabaseAdmin
    .from("lacheie_resend_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    // Un job amânat după 429 nu se atinge până la momentul cerut de portal.
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);

  const results: { jobId: string; status: string; sent: number; failed: number }[] = [];
  for (const job of jobs ?? []) {
    const outcome = await processLaCheieResendJob(supabaseAdmin, job.id, {
      maxItems,
      budgetMs: TICK_BUDGET_MS,
      agencyStatus: async (organizationId: string) => {
        const { data: row } = await supabaseAdmin
          .from("portal_connections")
          .select("settings")
          .eq("organization_id", organizationId)
          .eq("portal", LACHEIE_PORTAL_KEY)
          .maybeSingle();
        return readLaCheieAgencyState((row?.settings ?? {}) as Record<string, unknown>).status;
      },
      executeAction: async ({ organizationId, propertyId, actorId }) => {
        const result = await executeListingAction({
          organizationId,
          actorId,
          portalId: LACHEIE_PORTAL_KEY,
          propertyId,
          action: "update",
          operationLabel: "agency_resend",
        });
        return result.ok
          ? { ok: true as const }
          : { ok: false as const, code: result.code, message: result.message };
      },
    });
    results.push({
      jobId: job.id,
      status: outcome.status,
      sent: outcome.sent,
      failed: outcome.failed,
    });
  }
  return results;
}

export const Route = createFileRoute("/api/public/cron/lacheie-resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const payload = (await request.json().catch(() => ({}))) as { maxItems?: number };
        const maxItems = Math.max(1, Math.min(payload.maxItems ?? 25, 200));
        const results = await runResend(maxItems);
        return new Response(JSON.stringify({ ok: true, jobs: results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
