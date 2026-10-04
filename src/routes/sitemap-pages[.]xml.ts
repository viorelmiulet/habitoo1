import { createFileRoute } from "@tanstack/react-router";
import { buildStaticSitemapXml } from "@/lib/blog-discovery";

export const Route = createFileRoute("/sitemap-pages.xml")({
  server: { handlers: { GET: async () => new Response(buildStaticSitemapXml(), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  }) } },
});