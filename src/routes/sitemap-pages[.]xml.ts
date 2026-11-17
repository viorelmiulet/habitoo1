import { createFileRoute } from "@tanstack/react-router";
import { loadPublicPartners } from "@/lib/public-partners.server";
import { buildStaticSitemapXml } from "@/lib/blog-discovery";
import { loadDiscoverableBlogPosts } from "@/lib/blog-discovery.server";

export const Route = createFileRoute("/sitemap-pages.xml")({
  server: { handlers: { GET: async () => {
    const [posts, partners] = await Promise.all([loadDiscoverableBlogPosts(), loadPublicPartners()]);
    return new Response(buildStaticSitemapXml(partners.length > 0, posts, new Date(), partners), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  }); } } },
});