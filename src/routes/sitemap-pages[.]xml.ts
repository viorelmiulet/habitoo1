import { createFileRoute } from "@tanstack/react-router";
import { hasPublicPartners } from "@/lib/public-partners.server";
import { buildStaticSitemapXml } from "@/lib/blog-discovery";

export const Route = createFileRoute("/sitemap-pages.xml")({
  server: { handlers: { GET: async () => new Response(buildStaticSitemapXml(await hasPublicPartners()), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  }) } },
});