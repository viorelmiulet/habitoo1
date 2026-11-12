import { createFileRoute } from "@tanstack/react-router";

// Logo-ul public al unui portal adăugat din SuperAdmin, pentru paginile /integrari/<slug>.
// Servește doar portaluri active și vizibile public; altfel 404.
export const Route = createFileRoute("/api/public/portal-logo/$slug")({ server: { handlers: {
  GET: async ({ params }) => {
    const { loadDynamicFeedPortals } = await import("@/lib/dynamic-feed-portals.server");
    const row = (await loadDynamicFeedPortals()).find(p => p.slug === params.slug);
    if (!row?.active || !row.show_public || !row.logo_path) return new Response(null, { status: 404 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage.from("feed-portal-logos").download(row.logo_path);
    if (error || !data) return new Response(null, { status: 404 });
    return new Response(data, { headers: { "content-type": data.type, "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" } });
  },
} } });
