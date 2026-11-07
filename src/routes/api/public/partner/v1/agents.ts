import { createFileRoute } from "@tanstack/react-router";
import { partnerGet, allMethods } from "@/lib/partner-api/routes.server";
import { handleAgents } from "@/lib/partner-api/read.server";
export const Route = createFileRoute("/api/public/partner/v1/agents")({ server: { handlers: allMethods(request => partnerGet(request, "/agents", (ctx, store) => handleAgents(ctx, store, new URL(request.url)))) } });
