import { createFileRoute } from "@tanstack/react-router";
import { buildRssXml } from "@/lib/blog-discovery";
import { loadDiscoverableBlogPosts } from "@/lib/blog-discovery.server";

export const Route = createFileRoute("/blog/rss.xml")({
  server: { handlers: { GET: async () => new Response(buildRssXml(await loadDiscoverableBlogPosts(20)), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  }) } },
});