/**
 * Feedul public pentru iMove.ro: GET /api/public/portal/v1/imove/feed
 *
 * Autentificare: cheie emisă de Habitoo pentru portal, trimisă ca
 * `Authorization: Bearer <cheie>` sau, pentru compatibilitate cu un URL de feed
 * simplu, ca parametru `?token=<cheie>`. Agenția este determinată EXCLUSIV din
 * cheie, niciodată din query. Necesită scope `feed:read`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, jsonResponse, withFeedAuth } from "@/lib/site-feed/auth.server";
import {
  buildImoveFeed,
  imoveFeedBody,
  parseImovePagination,
} from "@/lib/portals/imove/feed.server";

export const Route = createFileRoute("/api/public/portal/v1/imove/feed")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(
          request,
          "portal.imove.feed",
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
          { allowQueryToken: true },
        ),
    },
  },
});
