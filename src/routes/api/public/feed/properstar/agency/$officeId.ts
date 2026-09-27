/**
 * Feedul semnat al unei agenții, listat în indexul Properstar:
 *   GET /api/public/feed/properstar/agency/{OfficeId}.xml?sig={HMAC-SHA256}
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleProperstarSignedFeed } from "@/lib/portals/properstar/index-feed.server";

export const Route = createFileRoute("/api/public/feed/properstar/agency/$officeId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleProperstarSignedFeed(request, String(params.officeId ?? "")),
    },
  },
});
