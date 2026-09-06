// GET /api/public/sites/v1/properties/:id — o singură proprietate publicabilă a agenției.
// :id acceptă atât UUID-ul intern stabil, cât și referința (ex. RF-1001).
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth, jsonResponse, errorResponse, FEED_API_VERSION } from "@/lib/site-feed/auth.server";
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import {
  isPropertyFeedEligible,
  mapPropertyToFeed,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/sites/v1/properties/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withFeedAuth(request, "properties.detail", async (auth) => {
          const id = String(params.id ?? "").trim();
          if (!id || id.length > 64) {
            return { response: errorResponse(400, "Invalid property id."), items: 0 };
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const query = supabaseAdmin
            .from("properties")
            .select("*")
            .eq("organization_id", auth.organizationId)
            .limit(1);
          const { data, error } = UUID_RE.test(id)
            ? await query.eq("id", id)
            : await query.eq("reference", id);
          if (error) throw error;

          const row = (data ?? [])[0] as PropertyRow | undefined;
          if (!row || !isPropertyFeedEligible(row)) {
            return { response: errorResponse(404, "Property not found."), items: 0 };
          }

          const [images, agent] = await Promise.all([
            supabaseAdmin
              .from("property_images")
              .select("*")
              .eq("organization_id", auth.organizationId)
              .eq("property_id", row.id)
              .eq("include_in_publish", true)
              .eq("is_confidential", false),
            row.assigned_to
              ? supabaseAdmin.from("profiles").select("id, full_name").eq("id", row.assigned_to).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);

          const { baseUrl, publicSiteUrl } = feedUrlsForRequest(new URL(request.url));
          const mapped = mapPropertyToFeed(row, {
            baseUrl,
            publicSiteUrl,
            images: (images.data ?? []) as PropertyImageRow[],
            agent: agent.data ?? null,
          });

          return {
            response: jsonResponse({ data: mapped, api_version: FEED_API_VERSION }, 200, 60),
            items: 1,
          };
        }),
    },
  },
});
