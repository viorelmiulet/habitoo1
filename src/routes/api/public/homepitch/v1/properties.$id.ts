// GET /api/public/homepitch/v1/properties/{id} — detaliile complete ale unei
// oferte, în schema HomePitch. Doar dacă oferta aparține agenției cheii.
import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, jsonResponse } from "@/lib/site-feed/auth.server";
import { requireFeedScope } from "@/lib/site-feed/handlers.server";
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import { HOMEPITCH_API_VERSION, withHomePitchAuth } from "@/lib/portals/homepitch/auth.server";
import { buildHomePitchFeed } from "@/lib/portals/homepitch/feed.server";

export const Route = createFileRoute("/api/public/homepitch/v1/properties/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withHomePitchAuth(request, "homepitch.property", async (auth) => {
          const denied = requireFeedScope(auth, "feed:read");
          if (denied) return denied;

          const url = new URL(request.url);
          const { baseUrl } = feedUrlsForRequest(url);
          const feed = await buildHomePitchFeed({
            organizationId: auth.organizationId,
            baseUrl,
            propertyId: params.id,
            limit: 1,
          });

          const property = feed.properties[0];
          if (!property) {
            const excluded = feed.excluded[0];
            if (excluded) {
              return {
                response: jsonResponse(
                  { api_version: HOMEPITCH_API_VERSION, error: "excluded", reasons: excluded.reasons },
                  422,
                ),
              };
            }
            return { response: errorResponse(404, "Property not found.") };
          }

          return {
            response: jsonResponse({ api_version: HOMEPITCH_API_VERSION, property }, 200, 60),
            items: 1,
          };
        }),
    },
  },
});
