// POST /api/public/sites/v1/visits — site-ul conectat raportează vizualizări pe proprietate.
// GET  /api/public/sites/v1/visits — totalul vizualizărilor raportate, pe proprietate.
import { createFileRoute } from "@tanstack/react-router";
import {
  withFeedAuth,
  jsonResponse,
  errorResponse,
  FEED_API_VERSION,
} from "@/lib/site-feed/auth.server";
import { requireFeedScope } from "@/lib/site-feed/handlers.server";
import { handleVisitsPost } from "@/lib/site-feed/visits.server";

export const Route = createFileRoute("/api/public/sites/v1/visits")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "visits", async (auth) => {
          const denied = requireFeedScope(auth, "leads:write");
          if (denied) return denied;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("site_feed_visits")
            .select("property_id, views, occurred_on, source")
            .eq("organization_id", auth.organizationId)
            .order("occurred_on", { ascending: false })
            .limit(1000);
          if (error) throw error;
          const totals = new Map<string, number>();
          for (const row of data ?? []) {
            totals.set(row.property_id, (totals.get(row.property_id) ?? 0) + (row.views ?? 0));
          }
          const items = [...totals.entries()].map(([id, views]) => ({ id, views }));
          return {
            response: jsonResponse({ data: items, api_version: FEED_API_VERSION }),
            items: items.length,
          };
        }),

      POST: async ({ request }) =>
        withFeedAuth(request, "visits", async (auth) => {
          const denied = requireFeedScope(auth, "leads:write");
          if (denied) return denied;
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return { response: errorResponse(400, "Invalid JSON body."), items: 0 };
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return handleVisitsPost(supabaseAdmin, auth, body);
        }),
    },
  },
});
