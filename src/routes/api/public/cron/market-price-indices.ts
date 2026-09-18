/**
 * Worker-ul săptămânal pentru indicele de preț al locuințelor (Eurostat).
 *
 * Rulează server-side, niciodată în browser. Nu face nimic dacă cel mai nou
 * trimestru publicat este deja stocat și publicarea Eurostat nu este mai nouă
 * decât ce avem; fiecare rulare se jurnalizează în `market_import_runs`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "market_price_indices",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/public/cron/market-price-indices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticate(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { createIndicesRepository, syncMarketPriceIndices } = await import(
          "@/lib/market/indices/eurostat.server"
        );
        const repository = createIndicesRepository(supabaseAdmin as never);
        const outcome = await syncMarketPriceIndices(repository, { actorId: null });

        return new Response(
          JSON.stringify({
            ok: outcome.status !== "failed",
            status: outcome.status,
            counts: outcome.counts,
            errors: outcome.errors,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
