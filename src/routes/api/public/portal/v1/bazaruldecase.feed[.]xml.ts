/**
 * Feedul XML Kyero v3 pentru BazarulDeCase.ro (pluginul „Houzez Property Feed”):
 *   GET /api/public/portal/v1/bazaruldecase/feed.xml?token=hbbc_…
 * Agenția vine EXCLUSIV din tokenul din index. Agenție în grație → fără proprietăți.
 */
import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, withFeedAuth } from "@/lib/site-feed/auth.server";
import { KYERO_HEADERS, kyeroDocument } from "@/lib/portals/bazaruldecase/kyero";

export const Route = createFileRoute("/api/public/portal/v1/bazaruldecase/feed.xml")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(
          request,
          "portal.bazaruldecase.feed_xml",
          async (auth) => {
            if (!auth.scopes.includes("feed:read")) return { response: errorResponse(403, "Missing scope: feed:read"), items: 0 };
            if (auth.indexStatus === "grace") {
              return { response: new Response(kyeroDocument([]), { status: 200, headers: KYERO_HEADERS }), items: 0 };
            }
            const { buildBazarulKyeroFeed } = await import("@/lib/portals/bazaruldecase/feed.server");
            const build = await buildBazarulKyeroFeed({ organizationId: auth.organizationId, requestUrl: request.url });
            return { response: new Response(build.xml, { status: 200, headers: KYERO_HEADERS }), items: build.properties };
          },
          { allowQueryToken: true, indexPortal: "bazaruldecase" },
        ),
    },
  },
});
