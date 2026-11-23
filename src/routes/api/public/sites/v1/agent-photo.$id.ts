// GET /api/public/sites/v1/agent-photo/:profileId — poza agentului (JPEG), read-only, fără alte date.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sites/v1/agent-photo/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { serveAgentPhoto } = await import("@/lib/site-feed/agent-photo.server");
        return serveAgentPhoto(params.id);
      },
    },
  },
});
