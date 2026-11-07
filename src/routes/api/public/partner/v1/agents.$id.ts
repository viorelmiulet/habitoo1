import { createFileRoute } from "@tanstack/react-router";
import { partnerGet, allMethods } from "@/lib/partner-api/routes.server";
import { handleAgents } from "@/lib/partner-api/read.server";
export const Route = createFileRoute("/api/public/partner/v1/agents/$id")({ server: { handlers: allMethods((request, params) => partnerGet(request, "/agents/{id}", (ctx, store) => handleAgents(ctx, store, new URL(request.url), params.id ?? ""))) } });
