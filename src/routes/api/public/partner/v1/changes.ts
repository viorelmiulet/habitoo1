import { createFileRoute } from "@tanstack/react-router";
import { partnerGet, allMethods } from "@/lib/partner-api/routes.server";
import { handleChanges } from "@/lib/partner-api/read.server";
export const Route = createFileRoute("/api/public/partner/v1/changes")({ server: { handlers: allMethods(request => partnerGet(request, "/changes", (ctx, store) => handleChanges(ctx, store, new URL(request.url)))) } });
