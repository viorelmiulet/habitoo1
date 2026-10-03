// GET /api/public/catalog/v1/facebook.csv — Catalog Facebook (Home listings), per agenție.
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth } from "@/lib/site-feed/auth.server";
import { handleFacebookCatalog } from "@/lib/site-feed/facebook-catalog.server";

export const Route = createFileRoute("/api/public/catalog/v1/facebook.csv")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "catalog.facebook", (auth) => handleFacebookCatalog(request, auth), {
          allowQueryToken: true,
        }),
    },
  },
});
