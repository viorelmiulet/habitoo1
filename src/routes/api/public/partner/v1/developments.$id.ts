import { createFileRoute } from "@tanstack/react-router";
import { partnerGet, allMethods } from "@/lib/partner-api/routes.server";
import { handleDevelopment } from "@/lib/partner-api/read.server";
export const Route = createFileRoute("/api/public/partner/v1/developments/$id")({ server: { handlers: allMethods((request, params) => partnerGet(request, "/developments/{id}", (ctx, store) => handleDevelopment(ctx, store, params.id ?? ""))) } });
