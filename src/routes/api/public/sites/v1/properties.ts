// GET /api/public/sites/v1/properties — feed paginat cu proprietățile publicabile ale agenției.
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth } from "@/lib/site-feed/auth.server";
import { handlePropertiesList } from "@/lib/site-feed/handlers.server";

export const Route = createFileRoute("/api/public/sites/v1/properties")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "properties", (auth) => handlePropertiesList(request, auth)),
    },
  },
});
