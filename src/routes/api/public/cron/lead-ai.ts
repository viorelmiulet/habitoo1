/**
 * Coada asistentului de lead-uri: analizează un lot mărginit de mesaje primite
 * pe lead-uri. Nu trimite nimic clientului; eșecurile nu ating mesajul primit.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/lead-ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { createLeadAiDeps } = await import("@/lib/ai/lead-assist/deps.server");
        const { processLeadAiBatch } = await import("@/lib/ai/lead-assist/process.server");
        try {
          const counts = await processLeadAiBatch(await createLeadAiDeps(), 10);
          return Response.json({ ok: true, ...counts });
        } catch (error) {
          console.error("[lead_ai] batch failed", error instanceof Error ? error.message : "error");
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
