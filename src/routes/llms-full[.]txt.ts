import { createFileRoute } from "@tanstack/react-router";
import { llmsFullResponse } from "@/lib/marketing/llms-full";
import { loadLlmsStatistics } from "@/lib/blog-discovery.server";

export const Route = createFileRoute("/llms-full.txt")({ server: { handlers: { GET: async () => llmsFullResponse(await loadLlmsStatistics(), new Date().toISOString()) } } });