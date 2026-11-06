// POST /api/public/sites/v1/contacts — cerere de client venită din site-ul
// conectat sau de la un portal care citește feedul (token de index).
// Logica: `src/lib/site-feed/contacts.server.ts`.
import { createFileRoute } from "@tanstack/react-router";
import {
  withFeedAuth,
  jsonResponse,
  errorResponse,
  FEED_API_VERSION,
} from "@/lib/site-feed/auth.server";
import { requireFeedScope } from "@/lib/site-feed/handlers.server";

export const Route = createFileRoute("/api/public/sites/v1/contacts")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withFeedAuth(request, "contacts", async (auth) => {
          const denied = requireFeedScope(auth, "leads:write");
          if (denied) return denied;
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return { response: errorResponse(400, "Invalid JSON body."), items: 0 };
          }
          const { contactSchema, handleSiteContact } = await import("@/lib/site-feed/contacts.server");
          const parsed = contactSchema.safeParse(body);
          if (!parsed.success) return { response: errorResponse(422, "Invalid payload."), items: 0 };
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const r = await handleSiteContact(supabaseAdmin, { organizationId: auth.organizationId, portal: auth.portal }, parsed.data);
          if ("message" in r) return { response: errorResponse(r.status, r.message), items: 0 };
          return {
            response: jsonResponse({ data: r.data, api_version: FEED_API_VERSION }, r.status),
            items: 1,
          };
        }),
    },
  },
});
