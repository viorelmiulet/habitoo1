import { createFileRoute } from "@tanstack/react-router";
import { partnerGet, allMethods } from "@/lib/partner-api/routes.server";
import { handleTaxonomies } from "@/lib/partner-api/read.server";
export const Route = createFileRoute("/api/public/partner/v1/taxonomies")({ server: { handlers: allMethods(request => partnerGet(request, "/taxonomies", () => handleTaxonomies())) } });
