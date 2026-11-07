import { createFileRoute } from "@tanstack/react-router";
import { handlePortalIndex } from "@/lib/portals/clickimob/index-feed.server";
export const Route = createFileRoute("/api/public/feed/$portal/index/$indexKey")({
  server: { handlers: { GET: ({ request, params }) => handlePortalIndex(request, params.indexKey, params.portal) } },
});