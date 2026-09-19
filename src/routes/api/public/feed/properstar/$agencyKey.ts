/**
 * Feedul public XML pentru Properstar:
 *   GET /api/public/feed/properstar/{agencyKey}.xml
 *
 * Autentificare: cheia emisă de Habitoo pentru agenție și portalul Properstar,
 * pusă direct în calea URL-ului (Properstar consumă un simplu link, fără
 * headere). Agenția este determinată EXCLUSIV din cheie, niciodată din query.
 * Verificarea, limitarea de rată și jurnalizarea sunt cele comune tuturor
 * feedurilor publice (`withFeedAuth`). Necesită scope `feed:read`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, withFeedAuth } from "@/lib/site-feed/auth.server";
import { buildProperstarFeed, PROPERSTAR_FEED_HEADERS } from "@/lib/portals/properstar/feed.server";

function xmlResponse(xml: string): Response {
  // Fără păstrare în client: sursa unică de antete este definiția feedului.
  return new Response(xml, { status: 200, headers: { ...PROPERSTAR_FEED_HEADERS } });
}


export const Route = createFileRoute("/api/public/feed/properstar/$agencyKey")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Calea se termină cu „.xml”: extensia nu face parte din cheie.
        const key = String(params.agencyKey ?? "").replace(/\.xml$/i, "");
        return withFeedAuth(
          request,
          "portal.properstar.feed",
          async (auth) => {
            // Cheia trebuie emisă pentru Properstar (sau să fie cheia generală
            // de feed a agenției); o cheie a altui portal nu deschide feedul.
            if (auth.source === "portal_key" && auth.portal !== "properstar") {
              return { response: errorResponse(403, "Key not issued for Properstar."), items: 0 };
            }

            if (!auth.scopes.includes("feed:read")) {
              return { response: errorResponse(403, "Missing scope: feed:read"), items: 0 };
            }
            const build = await buildProperstarFeed({
              organizationId: auth.organizationId,
              requestUrl: new URL(request.url),
              useCache: true,
            });
            return { response: xmlResponse(build.xml), items: build.adverts.length };
          },
          { explicitToken: key },
        );
      },
    },
  },
});
