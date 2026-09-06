/**
 * Feedul CSV pentru iMove.ro: GET /api/public/portal/v1/imove/feed.csv
 *
 * Aceeași selecție și aceeași mapare ca varianta JSON; diferă doar serializarea.
 * Autentificare: cheia API iMove salvată în Habitoo (Bearer sau `?token=`), scope
 * `feed:read`. Agenția rezultă EXCLUSIV din cheie.
 */
import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, withFeedAuth } from "@/lib/site-feed/auth.server";
import { buildImoveFeed, parseImovePagination } from "@/lib/portals/imove/feed.server";
import { imoveCsvDocument } from "@/lib/portals/imove/csv";

export const Route = createFileRoute("/api/public/portal/v1/imove/feed.csv")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(
          request,
          "portal.imove.feed.csv",
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
            const body = imoveCsvDocument(build.listings);
            return {
              response: new Response(body, {
                status: 200,
                headers: {
                  // Tip explicit CSV, servit INLINE: un `Content-Disposition:
                  // attachment` face ca unele sincronizări (iMove) să nu
                  // detecteze corect formatul și să-l trateze ca XML.
                  "Content-Type": "text/csv; charset=utf-8",
                  "Content-Disposition": 'inline; filename="habitoo-imove-feed.csv"',
                  "X-Content-Type-Options": "nosniff",
                  "Cache-Control": "no-store",
                },
              }),

              items: build.listings.length,
            };
          },
          { allowQueryToken: true, portalCredential: "imove" },
        ),
    },
  },
});
