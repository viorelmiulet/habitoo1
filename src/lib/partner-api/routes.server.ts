import { servePartner, apiError, PARTNER_API_BASE, type PartnerContext } from "./core.server";
import { partnerStore } from "./store.server";
import type { PartnerReadStore } from "./read.server";

/** GET-only Partner API endpoint; the canonical template is logged, never the concrete path or query. */
export async function partnerGet(request: Request, template: string, run: (ctx: PartnerContext, store: PartnerReadStore) => Promise<Response> | Response) {
  return servePartner(request, await partnerStore(), async ctx => {
    if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "Această adresă acceptă doar GET.", ctx.requestId);
    const { supabaseReadStore } = await import("./read.server");
    return run(ctx, await supabaseReadStore());
  }, `${PARTNER_API_BASE}${template}`);
}
export async function partnerPost(request: Request, template: string, kind: "publication" | "lead" | "message" | "stats", id?: string) {
  return servePartner(request, await partnerStore(), async ctx => {
    if (request.method !== "POST") return apiError(405, "METHOD_NOT_ALLOWED", "Această adresă acceptă doar POST.", ctx.requestId);
    if (!request.headers.get("Idempotency-Key")) return apiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key este obligatoriu.", ctx.requestId);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Folosiți application/json.", ctx.requestId);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1048576) return apiError(413, "PAYLOAD_TOO_LARGE", "Corpul cererii este prea mare.", ctx.requestId);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return apiError(422, "INVALID_JSON", "Corpul cererii nu este JSON valid.", ctx.requestId); }
    const { handlePartnerWrite, supabaseWriteStore } = await import("./write.server");
    if(ctx.identity.environment==="test"){
      const {sandboxWriteStore}=await import("./sandbox.server");
      const {supabaseReadStore}=await import("./read.server");
      return handlePartnerWrite(ctx,await sandboxWriteStore(await supabaseReadStore()),kind,body,id);
    }
    return handlePartnerWrite(ctx, await supabaseWriteStore(), kind, body, id);
  }, `${PARTNER_API_BASE}${template}`);
}
export async function partnerSandboxPost(request:Request,kind:"simulate"|"reset"){
  return servePartner(request,await partnerStore(),async ctx=>{
    if(request.method!=="POST")return apiError(405,"METHOD_NOT_ALLOWED","Folosiți POST.",ctx.requestId);
    if(ctx.identity.environment!=="test")return apiError(403,"FORBIDDEN","Acțiunea este disponibilă numai cu o cheie de test.",ctx.requestId);
    if(!request.headers.get("Idempotency-Key"))return apiError(400,"IDEMPOTENCY_KEY_REQUIRED","Idempotency-Key este obligatoriu.",ctx.requestId);
    if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return apiError(415,"UNSUPPORTED_MEDIA_TYPE","Folosiți application/json.",ctx.requestId);
    const raw=await request.text();if(raw.length>1000)return apiError(413,"PAYLOAD_TOO_LARGE","Corpul cererii este prea mare.",ctx.requestId);
    let body:unknown;try{body=JSON.parse(raw);}catch{return apiError(422,"INVALID_JSON","Corpul cererii nu este JSON valid.",ctx.requestId);}
    const {handleSandbox}=await import("./sandbox.server");
    return handleSandbox(ctx,kind,body,async(operation,action)=>{
      const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
      const r=operation==="reset"?await db.rpc("partner_api_sandbox_reset",{_portal:ctx.portal.slug}):await db.rpc("partner_api_sandbox_simulate",{_portal:ctx.portal.slug,_action:action??""});
      if(r.error)throw r.error;return r.data;
    });
  },`${PARTNER_API_BASE}/sandbox/${kind}`);
}
export const allMethods = (h: (request: Request, params: Record<string, string>) => Promise<Response>) => {
  const f = ({ request, params }: { request: Request; params: Record<string, string> }) => h(request, params);
  return { GET: f, POST: f, PUT: f, PATCH: f, DELETE: f };
};
