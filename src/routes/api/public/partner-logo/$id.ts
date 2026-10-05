// GET /api/public/partner-logo/<id> — logo-ul unei agenții partenere vizibile; 404 în rest.
import { createFileRoute } from "@tanstack/react-router";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });

export const Route = createFileRoute("/api/public/partner-logo/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!UUID.test(params.id)) return notFound();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: path } = await supabaseAdmin.rpc("public_partner_logo_path", { _id: params.id });
        if (!path) return notFound();
        const { AGENCY_LOGO_BUCKET } = await import("@/lib/storage");
        const { data: blob, error } = await supabaseAdmin.storage.from(AGENCY_LOGO_BUCKET).download(path);
        if (error || !blob) return notFound();
        const type = blob.type && blob.type.startsWith("image/") ? blob.type : "application/octet-stream";
        return new Response(await blob.arrayBuffer(), {
          headers: {
            "Content-Type": type,
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
          },
        });
      },
    },
  },
});
