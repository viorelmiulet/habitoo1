// GET /api/public/sites/v1/properties/:id — o singură proprietate publicabilă a agenției.
// :id acceptă atât UUID-ul intern stabil, cât și referința (ex. RF-1001).
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth } from "@/lib/site-feed/auth.server";
import { handlePropertyDetail } from "@/lib/site-feed/handlers.server";

export const Route = createFileRoute("/api/public/sites/v1/properties/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withFeedAuth(request, "properties.detail", (auth) =>
          handlePropertyDetail(request, auth, String(params.id ?? "")),
        ),
    },
  },
});
