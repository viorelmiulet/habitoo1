// GET /api/public/sites/v1/agents — agenții activi ai agenției, doar câmpuri publice.
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth } from "@/lib/site-feed/auth.server";
import { handleAgentsList } from "@/lib/site-feed/handlers.server";

export const Route = createFileRoute("/api/public/sites/v1/agents")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "agents", (auth) => handleAgentsList(request, auth)),
    },
  },
});
