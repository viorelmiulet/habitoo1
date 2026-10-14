/** POST /api/public/meta/data-deletion — cererea Meta de ștergere a datelor unui utilizator. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meta/data-deletion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["META_APP_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });
        const [core, m] = await Promise.all([import("@/lib/meta/core"), import("@/lib/meta/meta.server")]);
        const payload = core.parseSignedRequest(await m.readSignedRequest(request), secret);
        if (!payload) return new Response("invalid signature", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const code = core.newConfirmationCode();
        await supabaseAdmin.from("meta_data_deletion_requests").insert({ confirmation_code: code, meta_user_id: payload.user_id });
        const { data: conns } = await supabaseAdmin.from("meta_connections").select("organization_id").eq("meta_user_id", payload.user_id);
        // Șterge complet conexiunile (paginile și conturile Instagram cad în cascadă).
        await supabaseAdmin.from("meta_connections").delete().eq("meta_user_id", payload.user_id);
        for (const c of conns ?? []) await m.metaAudit(supabaseAdmin, c.organization_id, null, "meta.data_deleted", { confirmation_code: code });
        await supabaseAdmin
          .from("meta_data_deletion_requests")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("confirmation_code", code);
        return Response.json({ url: `https://www.habitoo.ro/stergere-date?cod=${code}`, confirmation_code: code });
      },
    },
  },
});
