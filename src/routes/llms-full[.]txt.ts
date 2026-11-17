import { createFileRoute } from "@tanstack/react-router";
import { llmsFullResponse } from "@/lib/marketing/llms-full";
import { loadLlmsStatistics } from "@/lib/blog-discovery.server";

export const Route = createFileRoute("/llms-full.txt")({ server: { handlers: { GET: async () => {
  const { loadPublicDynamicFeedPortals } = await import("@/lib/public-feed-portals.server");
  const { publicRead } = await import("@/lib/public-read");
  const dynamic = await publicRead("dynamic_public_portals", loadPublicDynamicFeedPortals, []);
  return llmsFullResponse(await loadLlmsStatistics(), new Date().toISOString(), dynamic);
} } } });
