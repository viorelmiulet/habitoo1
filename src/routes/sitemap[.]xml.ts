import { createFileRoute } from "@tanstack/react-router";
import { buildLovablePublishedSitemapXml, buildRootSitemapIndexXml, isLovablePublishedHostname } from "@/lib/marketing/offer-seo";
import { loadOfferSitemapCount } from "@/lib/marketing/offer-sitemap.server";

export const Route = createFileRoute("/sitemap.xml")({ server: { handlers: { GET: async ({ request }) => {
  const host = (request.headers.get("x-forwarded-host") ?? new URL(request.url).hostname).split(",")[0]?.trim().split(":")[0] ?? "";
  const body = isLovablePublishedHostname(host)
    ? buildLovablePublishedSitemapXml()
    : buildRootSitemapIndexXml(await loadOfferSitemapCount());
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" } });
} } } });
