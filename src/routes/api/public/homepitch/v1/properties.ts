// GET /api/public/homepitch/v1/properties — feedul în schema HomePitch.
// Paginare `limit`/`offset`, sincronizare incrementală `updated_since`,
// filtrare `is_active=true`. Agenția rezultă EXCLUSIV din cheia API.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/lib/site-feed/auth.server";
import { requireFeedScope } from "@/lib/site-feed/handlers.server";
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import { HOMEPITCH_API_VERSION, withHomePitchAuth } from "@/lib/portals/homepitch/auth.server";
import { buildHomePitchFeed } from "@/lib/portals/homepitch/feed.server";

export const Route = createFileRoute("/api/public/homepitch/v1/properties")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withHomePitchAuth(request, "homepitch.properties", async (auth) => {
          const denied = requireFeedScope(auth, "feed:read");
          if (denied) return denied;

          const url = new URL(request.url);
          const limit = Number(url.searchParams.get("limit") ?? 100);
          const offset = Number(url.searchParams.get("offset") ?? 0);
          const updatedSince = url.searchParams.get("updated_since");
          const isActive = url.searchParams.get("is_active") === "true";
          const { baseUrl } = feedUrlsForRequest(url);

          const feed = await buildHomePitchFeed({
            organizationId: auth.organizationId,
            baseUrl,
            limit: Number.isFinite(limit) ? limit : 100,
            offset: Number.isFinite(offset) ? offset : 0,
            updatedSince: updatedSince && !Number.isNaN(Date.parse(updatedSince)) ? updatedSince : null,
            isActiveOnly: isActive,
          });

          return {
            response: jsonResponse(
              {
                api_version: HOMEPITCH_API_VERSION,
                total: feed.total,
                limit: Number.isFinite(limit) ? limit : 100,
                offset: Number.isFinite(offset) ? offset : 0,
                properties: feed.properties,
              },
              200,
              60,
            ),
            items: feed.properties.length,
          };
        }),
    },
  },
});
