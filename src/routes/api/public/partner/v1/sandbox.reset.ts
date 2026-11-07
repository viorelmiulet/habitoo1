import {createFileRoute} from "@tanstack/react-router";
import {allMethods,partnerSandboxPost} from "@/lib/partner-api/routes.server";
export const Route=createFileRoute("/api/public/partner/v1/sandbox/reset")({server:{handlers:allMethods(request=>partnerSandboxPost(request,"reset"))}});