import { createFileRoute } from "@tanstack/react-router";
import { partnerGet, allMethods } from "@/lib/partner-api/routes.server";
import { handleAgencies } from "@/lib/partner-api/read.server";
export const Route = createFileRoute("/api/public/partner/v1/agencies/$id")({ server: { handlers: allMethods((request, params) => partnerGet(request, "/agencies/{id}", (ctx, store) => handleAgencies(ctx, store, params.id ?? ""))) } });
