import { createFileRoute } from "@tanstack/react-router";
import { partnerPost, allMethods } from "@/lib/partner-api/routes.server";
export const Route = createFileRoute("/api/public/partner/v1/listings/$id/publication")({ server: { handlers: allMethods((request, params) => partnerPost(request, "/listings/{id}/publication", "publication", params.id)) } });