// GET /api/public/sites/v1/properties — feed paginat cu proprietățile publicabile ale agenției.
import { createFileRoute } from "@tanstack/react-router";
import { withFeedAuth, jsonResponse, FEED_API_VERSION } from "@/lib/site-feed/auth.server";
import {
  buildPaginatedFeed,
  mapPropertyToFeed,
  parsePagination,
  FEED_PUBLIC_STATUSES,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";

export const Route = createFileRoute("/api/public/sites/v1/properties")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "properties", async (auth) => {
          const url = new URL(request.url);
          const { page, perPage } = parsePagination(url);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const from = (page - 1) * perPage;
          const { data, count, error } = await supabaseAdmin
            .from("properties")
            .select("*", { count: "exact" })
            .eq("organization_id", auth.organizationId)
            .eq("publish_status", "published")
            .is("deleted_at", null)
            .in("status", FEED_PUBLIC_STATUSES as unknown as string[])
            .order("updated_at", { ascending: false })
            .range(from, from + perPage - 1);
          if (error) throw error;

          const rows = (data ?? []) as PropertyRow[];
          const ids = rows.map((r) => r.id);
          const agentIds = [...new Set(rows.map((r) => r.assigned_to).filter((v): v is string => Boolean(v)))];

          const [images, agents] = await Promise.all([
            ids.length
              ? supabaseAdmin
                  .from("property_images")
                  .select("*")
                  .eq("organization_id", auth.organizationId)
                  .in("property_id", ids)
                  .eq("include_in_publish", true)
                  .eq("is_confidential", false)
              : Promise.resolve({ data: [] as PropertyImageRow[], error: null }),
            agentIds.length
              ? supabaseAdmin.from("profiles").select("id, full_name").in("id", agentIds)
              : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
          ]);

          const imagesByProperty = new Map<string, PropertyImageRow[]>();
          for (const img of (images.data ?? []) as PropertyImageRow[]) {
            const list = imagesByProperty.get(img.property_id) ?? [];
            list.push(img);
            imagesByProperty.set(img.property_id, list);
          }
          const agentById = new Map((agents.data ?? []).map((a) => [a.id, a]));

          const baseUrl = url.origin;
          const feed = buildPaginatedFeed({
            data: rows.map((row) =>
              mapPropertyToFeed(row, {
                baseUrl,
                publicSiteUrl: baseUrl,
                images: imagesByProperty.get(row.id) ?? [],
                agent: row.assigned_to ? (agentById.get(row.assigned_to) ?? null) : null,
              }),
            ),
            total: count ?? 0,
            page,
            perPage,
            requestUrl: url,
          });

          return {
            response: jsonResponse({ ...feed, api_version: FEED_API_VERSION }, 200, 60),
            items: feed.data.length,
          };
        }),
    },
  },
});
