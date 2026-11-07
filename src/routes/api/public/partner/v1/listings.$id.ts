import { createFileRoute } from "@tanstack/react-router";
import { partnerGet, allMethods } from "@/lib/partner-api/routes.server";
import { handleListing } from "@/lib/partner-api/read.server";
export const Route = createFileRoute("/api/public/partner/v1/listings/$id")({ server: { handlers: allMethods((request, params) => partnerGet(request, "/listings/{id}", (ctx, store) => handleListing(ctx, store, params.id ?? ""))) } });
