// GET /api/public/portal/v1/agents — agenții activi, pentru portaluri.
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth } from "@/lib/site-feed/auth.server";
import { handleAgentsList } from "@/lib/site-feed/handlers.server";

export const Route = createFileRoute("/api/public/portal/v1/agents")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "portal.agents", (auth) => handleAgentsList(request, auth)),
    },
  },
});
