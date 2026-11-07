import { createFileRoute } from "@tanstack/react-router";
import { servePartner,apiError,PARTNER_API_BASE } from "@/lib/partner-api/core.server";
import { partnerStore } from "@/lib/partner-api/store.server";
async function handle(request:Request) {return servePartner(request,await partnerStore(),async context=>apiError(404,"NOT_FOUND","Endpoint API inexistent.",context.requestId),`${PARTNER_API_BASE}/{endpoint}`);}
export const Route=createFileRoute("/api/public/partner/v1/$")({server:{handlers:{GET:({request})=>handle(request),POST:({request})=>handle(request),PUT:({request})=>handle(request),PATCH:({request})=>handle(request),DELETE:({request})=>handle(request)}}});