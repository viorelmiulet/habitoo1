/**
 * Mail Center — delivery events webhook (Mailgun tracking).
 * Public by necessity; every request must carry a valid HMAC signature.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mailgun/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleMailgunEvents } = await import("@/lib/mailgun-events.server");
        const signingKey = process.env["MAILGUN_WEBHOOK_SIGNING_KEY"]?.trim() || null;
        return handleMailgunEvents(request, {
          signingKey,
          getDb: async () =>
            (await import("@/integrations/supabase/client.server")).supabaseAdmin,
        });
      },
      GET: () =>
        new Response("Method Not Allowed", { status: 405, headers: { allow: "POST, OPTIONS" } }),
      OPTIONS: () => new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } }),
    },
  },
});
