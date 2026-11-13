/** Coada potrivirilor active: lot mărginit, detectare deterministă, fără AI și fără trimiteri. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/active-match")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
        const { processActiveMatchBatch } = await import("@/lib/active-matching/process.server");
        try {
          const counts = await processActiveMatchBatch({ db: supabaseAdmin, isFeatureEnabled: (org) => isAiFeatureEnabled(org, "ai_active_matching") }, 10);
          return Response.json({ ok: true, ...counts });
        } catch (error) {
          console.error("[active_match] batch failed", error instanceof Error ? error.message : "error");
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
