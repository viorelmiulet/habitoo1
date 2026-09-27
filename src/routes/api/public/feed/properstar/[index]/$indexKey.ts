/**
 * Indexul Properstar: GET /api/public/feed/properstar/index/{PROPERSTAR_INDEX_KEY}.xml
 * Listează feedurile semnate ale agențiilor active pentru Properstar.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleProperstarIndex } from "@/lib/portals/properstar/index-feed.server";

export const Route = createFileRoute("/api/public/feed/properstar/index/$indexKey")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleProperstarIndex(request, String(params.indexKey ?? "")),
    },
  },
});
