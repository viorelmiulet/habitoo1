import { createFileRoute } from "@tanstack/react-router";
import { buildOfferSitemapXml } from "@/lib/marketing/offer-seo";
import { loadOfferSitemapPage } from "@/lib/marketing/offer-sitemap.server";

export const Route = createFileRoute("/sitemap-oferte.xml")({ server: { handlers: { GET: async ({ request }) => {
  const page = Math.max(1, Math.floor(Number(new URL(request.url).searchParams.get("pagina") ?? "1")) || 1);
  return new Response(buildOfferSitemapXml(await loadOfferSitemapPage(page)), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
} } } });
