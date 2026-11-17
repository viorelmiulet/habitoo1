import { createFileRoute } from "@tanstack/react-router";
import { loadPublicPartners } from "@/lib/public-partners.server";
import { buildSitemapXml } from "@/lib/blog-discovery";
import { loadDiscoverableBlogPosts } from "@/lib/blog-discovery.server";

export const Route = createFileRoute("/sitemap.xml")({ server: { handlers: { GET: async () => {
  const [posts, partners] = await Promise.all([loadDiscoverableBlogPosts(), loadPublicPartners()]);
  const body = buildSitemapXml(posts, new Date(), partners.length > 0, partners);
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" } });
} } } });
