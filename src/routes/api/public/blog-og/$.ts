// Imaginea de distribuire (PNG 1200×630) a unui articol publicat. Dacă imaginea
// lipsește, redirecționează către imaginea generală a site-ului.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/blog-og/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const m = /^([0-9a-f-]{36})\.png$/.exec(params._splat ?? "");
        const fallback = new Response(null, {
          status: 302,
          headers: { location: "https://www.habitoo.ro/assets/og-cover.jpg" },
        });
        if (!m) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: post } = await supabaseAdmin
          .from("blog_posts")
          .select("id")
          .eq("id", m[1]!)
          .eq("status", "published")
          .lte("published_at", new Date().toISOString())
          .maybeSingle();
        if (!post) return new Response("Not found", { status: 404 });
        const { data } = await supabaseAdmin.storage.from("blog-media").download(`og/${post.id}.png`);
        if (!data) return fallback;
        return new Response(data, {
          headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, s-maxage=86400" },
        });
      },
    },
  },
});
