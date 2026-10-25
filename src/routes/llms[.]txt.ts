import { createFileRoute } from "@tanstack/react-router";
import { hasPublicPartners } from "@/lib/public-partners.server";
import { buildLlmsTxt } from "@/lib/blog-discovery";
import { loadDiscoverableBlogPosts, loadLlmsStatistics } from "@/lib/blog-discovery.server";

export const Route = createFileRoute("/llms.txt")({
  server: { handlers: { GET: async () => {
    const [posts, partners, statistics] = await Promise.all([loadDiscoverableBlogPosts(), hasPublicPartners(), loadLlmsStatistics()]);
    return new Response(buildLlmsTxt(posts, new Date(), partners, statistics), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
  } } },
});