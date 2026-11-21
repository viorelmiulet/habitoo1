import { createFileRoute } from "@tanstack/react-router";
import { buildRootSitemapIndexXml } from "@/lib/marketing/offer-seo";
import { loadOfferSitemapCount } from "@/lib/marketing/offer-sitemap.server";

export const Route = createFileRoute("/sitemap.xml")({ server: { handlers: { GET: async () => {
  const body = buildRootSitemapIndexXml(await loadOfferSitemapCount());
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" } });
} } } });
