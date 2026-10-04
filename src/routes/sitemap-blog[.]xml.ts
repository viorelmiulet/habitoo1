import { createFileRoute } from "@tanstack/react-router";
import { buildBlogSitemapXml } from "@/lib/blog-discovery";
import { loadDiscoverableBlogPosts } from "@/lib/blog-discovery.server";

export const Route = createFileRoute("/sitemap-blog.xml")({
  server: { handlers: { GET: async () => new Response(buildBlogSitemapXml(await loadDiscoverableBlogPosts()), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  }) } },
});