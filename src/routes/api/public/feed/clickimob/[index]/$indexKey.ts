/**
 * Indexul ClickImob: GET /api/public/feed/clickimob/index/{CLICKIMOB_INDEX_KEY}.json
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleClickimobIndex } from "@/lib/portals/clickimob/index-feed.server";

export const Route = createFileRoute("/api/public/feed/clickimob/index/$indexKey")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleClickimobIndex(request, String(params.indexKey ?? "")),
    },
  },
});
