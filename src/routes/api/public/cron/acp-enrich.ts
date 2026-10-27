/**
 * Jobul programat de îmbogățire AI a ofertelor de piață pentru ACP.
 * „new” la 15 minute (lot mic), „backlog” noaptea (loturi mai mari).
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const Body = z.object({ mode: z.enum(["new", "backlog"]) });

export const Route = createFileRoute("/api/public/cron/acp-enrich")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runAcpEnrichment } = await import("@/lib/acp/enrichment.server");
        const result = await runAcpEnrichment(supabaseAdmin, { mode: parsed.data.mode });
        return Response.json({
          ok: result.status !== "failed",
          status: result.status,
          processed: result.processed,
          failed: result.failed,
          costUsd: Number(result.costUsd.toFixed(4)),
        });
      },
    },
  },
});
