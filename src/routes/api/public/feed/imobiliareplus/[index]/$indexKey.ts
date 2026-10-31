import { createFileRoute } from "@tanstack/react-router";
import { handlePortalIndex } from "@/lib/portals/clickimob/index-feed.server";

export const Route = createFileRoute("/api/public/feed/imobiliareplus/index/$indexKey")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handlePortalIndex(request, String(params.indexKey ?? ""), "imobiliareplus"),
    },
  },
});
