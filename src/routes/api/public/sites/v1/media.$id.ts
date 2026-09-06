// GET /api/public/sites/v1/media/:id — URL public stabil pentru o imagine din feed.
// Redirect 302 către un URL semnat generat server-side; nu expune bucketul,
// nici credentiale de storage. Servește numai imagini marcate pentru publicare,
// ne-confidențiale, care aparțin unei proprietăți eligibile pentru feed.
import { createFileRoute } from "@tanstack/react-router";
import { isPropertyFeedEligible } from "@/lib/site-feed/mapper";

const SIGNED_URL_TTL = 60 * 60 * 24; // 24h

export const Route = createFileRoute("/api/public/sites/v1/media/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id ?? "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return new Response("Not found", { status: 404 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: image } = await supabaseAdmin
            .from("property_images")
            .select("id, url, storage_path, property_id, include_in_publish, is_confidential")
            .eq("id", id)
            .maybeSingle();
          if (!image || image.include_in_publish !== true || image.is_confidential === true) {
            return new Response("Not found", { status: 404 });
          }

          const { data: property } = await supabaseAdmin
            .from("properties")
            .select("publish_status, deleted_at, status")
            .eq("id", image.property_id)
            .maybeSingle();
          if (!property || !isPropertyFeedEligible(property)) {
            return new Response("Not found", { status: 404 });
          }

          let target = image.url;
          if (image.storage_path) {
            const { data: signed } = await supabaseAdmin.storage
              .from("property-media")
              .createSignedUrl(image.storage_path, SIGNED_URL_TTL);
            if (signed?.signedUrl) target = signed.signedUrl;
          }
          if (!target) return new Response("Not found", { status: 404 });

          return new Response(null, {
            status: 302,
            headers: {
              location: target,
              "cache-control": "public, max-age=3600",
            },
          });
        } catch (error) {
          console.error("[site-feed] media redirect failed", error);
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});
