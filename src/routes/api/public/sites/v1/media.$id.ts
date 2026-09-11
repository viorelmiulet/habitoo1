// GET /api/public/sites/v1/media/:id — URL public stabil pentru o imagine din feed.
// Redirect 302 către un URL semnat generat server-side; nu expune bucketul,
// nici credentiale de storage. Servește numai imagini marcate pentru publicare,
// ne-confidențiale, care aparțin unei proprietăți eligibile pentru feed.
import { createFileRoute } from "@tanstack/react-router";
import { isPropertyFeedEligible } from "@/lib/site-feed/mapper";
import { watermarkFromOrg } from "@/lib/watermark";

const SIGNED_URL_TTL = 60 * 60 * 24; // 24h

export const Route = createFileRoute("/api/public/sites/v1/media/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // Acceptăm și forma `{id}.jpg`: unele portaluri (iMove) validează
        // extensia imaginii din URL înainte de a o descărca.
        const id = String(params.id ?? "").replace(/\.(jpe?g|png|webp)$/i, "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return new Response("Not found", { status: 404 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: image } = await supabaseAdmin
            .from("property_images")
            .select(
              "id, url, storage_path, property_id, organization_id, include_in_publish, is_confidential",
            )
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
            // Watermark doar pe varianta servită portalurilor; originalul rămâne intact.
            let path = image.storage_path;
            const { data: org } = await supabaseAdmin
              .from("organizations")
              .select(
                "logo_path, watermark_enabled, watermark_position, watermark_scale_percent, watermark_opacity_percent, watermark_margin_percent",
              )
              .eq("id", image.organization_id)
              .maybeSingle();
            const cfg = watermarkFromOrg(org);
            if (cfg.enabled) {
              const { ensureWatermarkedPath } = await import("@/lib/watermark.server");
              path = (await ensureWatermarkedPath(supabaseAdmin, image.storage_path, cfg)) ?? path;
            }
            const { data: signed } = await supabaseAdmin.storage
              .from("property-media")
              .createSignedUrl(path, SIGNED_URL_TTL);
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
