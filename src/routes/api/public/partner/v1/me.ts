import { createFileRoute } from "@tanstack/react-router";
import { servePartner, meResponse, apiError, PARTNER_API_BASE } from "@/lib/partner-api/core.server";
import { partnerStore } from "@/lib/partner-api/store.server";
async function handle(request: Request) {
  const store=await partnerStore();
  return servePartner(request,store,async context => request.method === "GET" ? meResponse(context,await store.countAgencies(context.identity.portal,context.identity.environment)) : apiError(400,"METHOD_NOT_ALLOWED","Această adresă acceptă doar GET.",context.requestId),`${PARTNER_API_BASE}/me`);
}
export const Route=createFileRoute("/api/public/partner/v1/me")({server:{handlers:{GET:({request})=>handle(request),POST:({request})=>handle(request),PUT:({request})=>handle(request),PATCH:({request})=>handle(request),DELETE:({request})=>handle(request)}}});