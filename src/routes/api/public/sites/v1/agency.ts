// GET /api/public/sites/v1/agency — numele și logo-ul agenției, nimic altceva.
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth } from "@/lib/site-feed/auth.server";
import { handleAgency } from "@/lib/site-feed/handlers.server";

export const Route = createFileRoute("/api/public/sites/v1/agency")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "agencysites", (auth) => handleAgency(request, auth)),
    },
  },
});
