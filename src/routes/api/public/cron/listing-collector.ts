/**
 * Worker-ul colectorului de anunțuri (cron armat la activarea unei surse).
 *
 * Rulează server-side, niciodată în browser. Parcurge sursele ACTIVATE, una
 * câte una, cu lock per sursă și buget de timp per tick; progresul și erorile
 * se salvează în `collector_runs`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const MAX_SOURCES_PER_TICK = 2;
const TICK_BUDGET_MS = 40_000;

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "listing_collector",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

async function runEnabledSources() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runCollectorSource } = await import("@/lib/collector/engine.server");

  const { data: sources } = await supabaseAdmin
    .from("collector_sources")
    .select("key")
    .eq("enabled", true)
    .order("updated_at", { ascending: true })
    .limit(MAX_SOURCES_PER_TICK);

  const started = Date.now();
  const results = [];
  for (const source of (sources ?? []) as { key: string }[]) {
    const remaining = TICK_BUDGET_MS - (Date.now() - started);
    if (remaining < 5_000) break;
    const outcome = await runCollectorSource(supabaseAdmin as never, source.key, {
      budgetMs: remaining,
    });
    results.push({
      source: outcome.source,
      status: outcome.status,
      stopReason: outcome.stopReason,
      pages: outcome.pagesFetched,
      itemsNew: outcome.itemsNew,
      itemsUpdated: outcome.itemsUpdated,
    });
  }
  return results;
}

export const Route = createFileRoute("/api/public/cron/listing-collector")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticate(request);
        if (unauthorized) return unauthorized;
        const results = await runEnabledSources();
        return new Response(JSON.stringify({ ok: true, sources: results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
