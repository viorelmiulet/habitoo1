import { createFileRoute } from "@tanstack/react-router";
import { buildLlmsTxt } from "@/lib/blog-discovery";
import { loadDiscoverableBlogPosts } from "@/lib/blog-discovery.server";

export const Route = createFileRoute("/llms.txt")({
  server: { handlers: { GET: async () => new Response(buildLlmsTxt(await loadDiscoverableBlogPosts()), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  }) } },
});