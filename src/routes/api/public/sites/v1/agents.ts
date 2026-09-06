// GET /api/public/sites/v1/agents — agenții activi ai agenției, doar câmpuri publice.
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth, jsonResponse, FEED_API_VERSION } from "@/lib/site-feed/auth.server";
import { buildPaginatedFeed, mapAgent, parsePagination, type ProfileRow } from "@/lib/site-feed/mapper";

export const Route = createFileRoute("/api/public/sites/v1/agents")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "agents", async (auth) => {
          const url = new URL(request.url);
          const { page, perPage } = parsePagination(url);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const from = (page - 1) * perPage;
          const baseQuery = () =>
            supabaseAdmin
              .from("profiles")
              .select("*", { count: "exact" })
              .eq("organization_id", auth.organizationId)
              .eq("is_active", true);

          let { data, count, error } = await baseQuery()
            .order("full_name", { ascending: true })
            .range(from, from + perPage - 1);
          if (error?.code === "PGRST103") {
            const head = await baseQuery().range(0, 0);
            data = [];
            count = head.count ?? 0;
            error = null;
          }
          if (error) throw error;

          const feed = buildPaginatedFeed({
            data: ((data ?? []) as ProfileRow[]).map((p) => mapAgent(p)),
            total: count ?? 0,
            page,
            perPage,
            requestUrl: url,
          });

          return {
            response: jsonResponse({ ...feed, api_version: FEED_API_VERSION }, 200, 60),
            items: feed.data.length,
          };
        }),
    },
  },
});
