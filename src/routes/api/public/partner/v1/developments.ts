import { createFileRoute } from "@tanstack/react-router";
import { partnerGet, allMethods } from "@/lib/partner-api/routes.server";
import { handleDevelopments } from "@/lib/partner-api/read.server";
export const Route = createFileRoute("/api/public/partner/v1/developments")({ server: { handlers: allMethods(request => partnerGet(request, "/developments", (ctx, store) => handleDevelopments(ctx, store, new URL(request.url)))) } });
