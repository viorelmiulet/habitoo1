import {createFileRoute} from "@tanstack/react-router";
import {authenticateCronRequest} from "@/integrations/supabase/cron-auth";
export const Route=createFileRoute("/api/public/jobs/partner-webhooks")({server:{handlers:{POST:async({request})=>{
 const nonce=request.headers.get("x-cron-nonce");
 if(nonce){const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const r=await supabaseAdmin.rpc("cron_nonce_claim",{_purpose:"partner_webhooks",_token:nonce});if(r.error||r.data!==true)return new Response("Unauthorized",{status:401});}
 else{const denied=await authenticateCronRequest(request);if(denied)return denied;}
 const body=await request.json().catch(()=>({}));if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length)return new Response("Invalid body",{status:422});
 const {runWebhookWorker}=await import("@/lib/partner-api/webhook.server");try{return Response.json(await runWebhookWorker());}catch{return Response.json({success:false},{status:503});}
}}}});
