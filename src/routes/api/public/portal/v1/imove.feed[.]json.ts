/**
 * Feedul JSON pentru iMove.ro: GET /api/public/portal/v1/imove/feed.json
 *
 * Alias explicit pentru `/feed`, cu aceeași selecție, aceeași mapare și aceeași
 * autentificare (cheia API iMove salvată în Habitoo, scope `feed:read`).
 */
import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, jsonResponse, withFeedAuth } from "@/lib/site-feed/auth.server";
import {
  buildImoveFeed,
  imoveFeedBody,
  parseImovePagination,
} from "@/lib/portals/imove/feed.server";

export const Route = createFileRoute("/api/public/portal/v1/imove/feed.json")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(
          request,
          "portal.imove.feed.json",
          async (auth) => {
            if (!auth.scopes.includes("feed:read")) {
              return { response: errorResponse(403, "Missing scope: feed:read"), items: 0 };
            }
            const url = new URL(request.url);
            const { page, perPage } = parseImovePagination(url);
            const build = await buildImoveFeed({
              organizationId: auth.organizationId,
              requestUrl: url,
              page,
              perPage,
            });
            return { response: jsonResponse(imoveFeedBody(build)), items: build.listings.length };
          },
          { allowQueryToken: true, portalCredential: "imove" },
        ),
    },
  },
});
