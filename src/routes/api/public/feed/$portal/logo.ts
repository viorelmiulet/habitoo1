import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/feed/$portal/logo")({ server: { handlers: {
  GET: async ({ params, request }) => {
    const { loadDynamicFeedPortals } = await import("@/lib/dynamic-feed-portals.server");
    const row = (await loadDynamicFeedPortals()).find(p => p.slug === params.portal);
    // Nonpublic portal logos remain readable only to signed-in members (not by guessing the slug).
    if (!row?.active || !row.logo_path) return new Response(null, { status: 404 });
    if (!row.show_public) {
      const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "");
      if (!bearer) return new Response(null, { status: 401 });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.auth.getUser(bearer);
      if (error || !data.user) return new Response(null, { status: 401 });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage.from("feed-portal-logos").download(row.logo_path);
    if (error || !data) return new Response(null, { status: 404 });
    return new Response(data, { headers: { "content-type": data.type, "cache-control": row.show_public ? "public, max-age=300" : "private, no-store", "x-content-type-options": "nosniff" } });
  },
} } });