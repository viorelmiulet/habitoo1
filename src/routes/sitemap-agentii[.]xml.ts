import { createFileRoute } from "@tanstack/react-router";
import { buildAgencySitemapXml } from "@/lib/marketing/agency-seo";
import { loadAgencySitemap } from "@/lib/public-profiles.server";

export const Route = createFileRoute("/sitemap-agentii.xml")({ server: { handlers: { GET: async () =>
  new Response(buildAgencySitemapXml(await loadAgencySitemap()), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" } }),
} } });
