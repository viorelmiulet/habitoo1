// GET /api/public/portal/v1/properties/:id — detaliul unei oferte pentru portaluri.
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth } from "@/lib/site-feed/auth.server";
import { handlePropertyDetail } from "@/lib/site-feed/handlers.server";

export const Route = createFileRoute("/api/public/portal/v1/properties/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withFeedAuth(request, "portal.properties.detail", (auth) =>
          handlePropertyDetail(request, auth, String(params.id ?? "")),
        ),
    },
  },
});
