import { createFileRoute } from "@tanstack/react-router";
import { partnerPost, allMethods } from "@/lib/partner-api/routes.server";
export const Route = createFileRoute("/api/public/partner/v1/leads/$id/messages")({ server: { handlers: allMethods((request, params) => partnerPost(request, "/leads/{id}/messages", "message", params.id)) } });