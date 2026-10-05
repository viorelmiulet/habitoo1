import { createFileRoute } from "@tanstack/react-router";
import { hasPublicPartners } from "@/lib/public-partners.server";
import { buildSitemapXml } from "@/lib/blog-discovery";
import { loadDiscoverableBlogPosts } from "@/lib/blog-discovery.server";

export const Route = createFileRoute("/sitemap.xml")({ server: { handlers: { GET: async () => {
  const body = buildSitemapXml(await loadDiscoverableBlogPosts(), new Date(), await hasPublicPartners());
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" } });
} } } });
