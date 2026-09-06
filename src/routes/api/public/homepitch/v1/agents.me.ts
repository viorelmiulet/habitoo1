// GET /api/public/homepitch/v1/agents/me — identitatea agenției cheii API.
// Cheia este agency-wide (recomandarea HomePitch), deci returnăm contactul
// principal al agenției, nu un agent individual.
import { createFileRoute } from "@tanstack/react-router";
import { errorResponse, jsonResponse } from "@/lib/site-feed/auth.server";
import { requireFeedScope } from "@/lib/site-feed/handlers.server";
import { HOMEPITCH_API_VERSION, withHomePitchAuth } from "@/lib/portals/homepitch/auth.server";
import { homepitchAgentIdentity } from "@/lib/portals/homepitch/feed.server";

export const Route = createFileRoute("/api/public/homepitch/v1/agents/me")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withHomePitchAuth(request, "homepitch.agents_me", async (auth) => {
          const denied = requireFeedScope(auth, "agents:read");
          if (denied) return denied;
          const identity = await homepitchAgentIdentity(auth.organizationId);
          if (!identity) return { response: errorResponse(404, "Agency not found.") };
          return {
            response: jsonResponse({ api_version: HOMEPITCH_API_VERSION, ...identity }, 200, 60),
            items: 1,
          };
        }),
    },
  },
});
