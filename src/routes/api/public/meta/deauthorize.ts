/** POST /api/public/meta/deauthorize — Meta anunță că utilizatorul a eliminat aplicația. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meta/deauthorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["META_APP_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });
        const [{ parseSignedRequest }, m] = await Promise.all([import("@/lib/meta/core"), import("@/lib/meta/meta.server")]);
        const payload = parseSignedRequest(await m.readSignedRequest(request), secret);
        if (!payload) return new Response("invalid signature", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const orgs = await m.clearMetaTokens(supabaseAdmin, { metaUserId: payload.user_id });
        for (const o of orgs) await m.metaAudit(supabaseAdmin, o, null, "meta.disconnected", { source: "meta_deauthorize" });
        return Response.json({ ok: true });
      },
    },
  },
});
