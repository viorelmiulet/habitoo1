import {createFileRoute} from "@tanstack/react-router";
import {allMethods} from "@/lib/partner-api/routes.server";
import {partnerWebhook} from "@/lib/partner-api/webhook.server";
export const Route=createFileRoute("/api/public/partner/v1/webhook/test")({server:{handlers:allMethods(request=>partnerWebhook(request,"test"))}});
