// GET /api/public/listings/media/:id?p=<path> — URL public stabil pentru o
// imagine a unui anunț particular. Redirect 302 către un URL semnat generat
// server-side; nu expune bucketul. Calea `p` este validată strict: doar
// <external_id>/<index>-<uuid>.<ext>, fără traversare.
import { createFileRoute } from "@tanstack/react-router";

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 zile
const PATH_PATTERN = /^[a-zA-Z0-9_.-]{1,180}\/\d{1,2}-[0-9a-f]{8}-[0-9a-f-]{27,36}\.(jpg|png|webp|gif)$/i;

export const Route = createFileRoute("/api/public/listings/media/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // id este un UUID de prezentare; fișierul real vine din parametrul `p`.
        const id = String(params.id ?? "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return new Response("Not found", { status: 404 });
        }
        const path = new URL(request.url).searchParams.get("p") ?? "";
        if (!PATH_PATTERN.test(path)) {
          return new Response("Not found", { status: 404 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: signed } = await supabaseAdmin.storage
            .from("listing-images")
            .createSignedUrl(path, SIGNED_URL_TTL);
          if (!signed?.signedUrl) return new Response("Not found", { status: 404 });
          return new Response(null, {
            status: 302,
            headers: {
              location: signed.signedUrl,
              "cache-control": "public, max-age=3600",
            },
          });
        } catch (error) {
          console.error("[listings-media] redirect failed", error);
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});
