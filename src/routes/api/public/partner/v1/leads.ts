import { createFileRoute } from "@tanstack/react-router";
import { partnerPost, allMethods } from "@/lib/partner-api/routes.server";
export const Route = createFileRoute("/api/public/partner/v1/leads")({ server: { handlers: allMethods(request => partnerPost(request, "/leads", "lead")) } });