import { keepRouteHandlersAlive } from "@/lib/after-response";
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/indexnow-offers")({
  server: { handlers: { POST: async ({ request }) => {
    const authFailure = await authenticateCronRequest(request);
    if (authFailure) return authFailure;
    const { flushOfferIndexNow } = await import("@/lib/marketing/indexnow.server");
    return Response.json(await flushOfferIndexNow());
  } } },
});

// Lucrul continuă prin waitUntil chiar dacă apelantul închide conexiunea; răspunsul rămâne același.
keepRouteHandlersAlive(Route);
