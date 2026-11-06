// GET /api/public/sites/v1/media/agency/:id — redirect 302 public către URL semnat 24h.
import { createFileRoute } from "@tanstack/react-router";
import { agencyLogoRedirect } from "@/lib/site-feed/media-redirect.server";

export const Route = createFileRoute("/api/public/sites/v1/media/agency/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { parseImageParams } = await import("@/lib/site-feed/image-params");
        return agencyLogoRedirect(params.id, undefined, parseImageParams(new URL(request.url).searchParams));
      },
    },
  },
});
