import { createFileRoute } from "@tanstack/react-router";
import { partnerGet, allMethods } from "@/lib/partner-api/routes.server";
import { handleListings } from "@/lib/partner-api/read.server";
export const Route = createFileRoute("/api/public/partner/v1/listings")({ server: { handlers: allMethods(request => partnerGet(request, "/listings", (ctx, store) => handleListings(ctx, store, new URL(request.url)))) } });
