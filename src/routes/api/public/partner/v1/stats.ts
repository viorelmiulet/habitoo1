import { createFileRoute } from "@tanstack/react-router";
import { partnerPost, allMethods } from "@/lib/partner-api/routes.server";
export const Route = createFileRoute("/api/public/partner/v1/stats")({ server: { handlers: allMethods(request => partnerPost(request, "/stats", "stats")) } });