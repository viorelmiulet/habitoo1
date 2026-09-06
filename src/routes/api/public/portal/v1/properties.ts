// GET /api/public/portal/v1/properties — același feed, autentificat cu o cheie
// emisă de Habitoo pentru un portal. Agenția rezultă exclusiv din cheie.
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth } from "@/lib/site-feed/auth.server";
import { handlePropertiesList } from "@/lib/site-feed/handlers.server";

export const Route = createFileRoute("/api/public/portal/v1/properties")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "portal.properties", (auth) => handlePropertiesList(request, auth)),
    },
  },
});
