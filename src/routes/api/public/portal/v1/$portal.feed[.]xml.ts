import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth, errorResponse } from "@/lib/site-feed/auth.server";
import { incompleteFeedResponse } from "@/lib/site-feed/complete-read.server";
import { KYERO_HEADERS, kyeroDocument } from "@/lib/portals/bazaruldecase/kyero";
export const Route = createFileRoute("/api/public/portal/v1/$portal/feed.xml")({ server: { handlers: {
  GET: async ({ request, params }) => {
    try {
      const { resolveIndexPortal } = await import("@/lib/dynamic-feed-portals.server");
      const config = await resolveIndexPortal(params.portal);
      if (!config?.active || !("xmlPath" in config)) return errorResponse(401, "Invalid or disabled XML portal.");
      return await withFeedAuth(request, `portal.${params.portal}.feed_xml`, async auth => {
        if (auth.portal !== params.portal || !auth.scopes.includes("feed:read")) return { response: errorResponse(403, "Token must belong to this portal."), items: 0 };
        if (auth.indexStatus === "grace") return { response: new Response(kyeroDocument([]), { headers: KYERO_HEADERS }), items: 0 };
        const { buildBazarulKyeroFeed } = await import("@/lib/portals/bazaruldecase/feed.server");
        const result = await buildBazarulKyeroFeed({ organizationId: auth.organizationId, requestUrl: request.url, portal: params.portal });
        return { response: new Response(result.xml, { headers: KYERO_HEADERS }), items: result.properties };
      }, { allowQueryToken: true, indexPortal: params.portal, inventory: true });
    } catch { return incompleteFeedResponse(); }
  },
} } });