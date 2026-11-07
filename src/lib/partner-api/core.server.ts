import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PARTNER_API_BASE = "/api/public/partner/v1";
export type Environment = "test" | "live";
export type ApiIdentity = { id: string; portal: string; prefix: string; environment: Environment; key_hash: string; status: string };
export type ApiPortal = { slug: string; display_name: string; active: boolean; integration_mode: string; rate_limit_per_minute: number };
export type Rate = { limit: number; remaining: number; reset: number; allowed: boolean };
export type Receipt = { state: "claimed" | "pending" | "conflict" | "replay"; status?: number; body?: string; headers?: Record<string,string> };
export type PartnerStore = {
  key: (hash: string) => Promise<ApiIdentity | null>; portal: (slug: string) => Promise<ApiPortal | null>;
  rate: (id: string) => Promise<Rate>; countAgencies: (portal: string, environment: Environment) => Promise<number>;
  touch: (id: string) => Promise<void>; log: (entry: Record<string, unknown>) => Promise<void>;
  claim: (portal: string, environment: Environment, key: string, hash: string, owner: string) => Promise<Receipt>;
  complete: (portal: string, environment: Environment, key: string, owner: string, response: Response) => Promise<void>;
};
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function generatePartnerKey(environment: Environment) {
  const prefix = `hbpk_${environment}_`; const key = prefix + randomBytes(32).toString("hex");
  return { key, prefix, key_hash: digest(key), last4: key.slice(-4), environment, key_type: "api" as const };
}
export function equalDigest(a: string,b: string) {
  return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
export function apiError(status: number, code: string, message: string, requestId: string, details: unknown[] = []) {
  return Response.json({ error: { code, message, details, request_id: requestId } },{ status });
}
export type PartnerContext = { identity: ApiIdentity; portal: ApiPortal; requestId: string };
/** Handler-owned authentication; only rate-check failure is fail-open. Never log body, headers, query or arbitrary URL segments. */
export async function servePartner(request: Request, store: PartnerStore, handler: (context: PartnerContext) => Promise<Response>, canonicalPath: string) {
  const requestId = crypto.randomUUID(), started = Date.now();
  let identity: ApiIdentity | null = null, portal: ApiPortal | null = null, rate: Rate | null = null, rateFailed = false;
  let response: Response;
  try {
    const bearer = request.headers.get("authorization")?.match(/^Bearer (hbpk_(test|live)_[A-Za-z0-9]{40,128})$/);
    if (!bearer) response = apiError(401,"UNAUTHORIZED","Clé API lipsă sau invalidă.",requestId);
    else {
      const hash = digest(bearer[1]); identity = await store.key(hash);
      if (!identity || !equalDigest(hash,identity.key_hash) || identity.environment !== bearer[2]) response = apiError(401,"UNAUTHORIZED","Cheie API invalidă.",requestId);
      else {
        portal = await store.portal(identity.portal);
        if (identity.status !== "active" || !portal?.active || !["api","both"].includes(portal.integration_mode)) response = apiError(403,"FORBIDDEN","Cheia a fost revocată sau portalul este dezactivat pentru API.",requestId);
        else {
          try { rate = await store.rate(identity.id); } catch { rateFailed = true; }
          if (rate && !rate.allowed) {
            response = apiError(429,"RATE_LIMIT_EXCEEDED","Limita de cereri a fost depășită.",requestId);
            response.headers.set("Retry-After",String(Math.max(1,rate.reset-Math.floor(Date.now()/1000))));
          } else {
            await store.touch(identity.id);
            const context = { identity, portal, requestId };
            const idem = request.method === "POST" ? request.headers.get("Idempotency-Key") : null;
            if (idem && (idem.length>200 || !/^[\x21-\x7e]+$/.test(idem))) response = apiError(400,"INVALID_IDEMPOTENCY_KEY","Idempotency-Key trebuie să aibă 1–200 caractere ASCII vizibile.",requestId);
            else if (idem) {
              const hash = digest(JSON.stringify([request.method,new URL(request.url).pathname,new URL(request.url).search,request.headers.get("content-type"),await request.clone().text()]));
              const receipt = await store.claim(identity.portal,identity.environment,idem,hash,requestId);
              if (receipt.state === "conflict") response = apiError(409,"IDEMPOTENCY_CONFLICT","Această cheie de idempotență a fost folosită pentru altă cerere.",requestId);
              else if (receipt.state === "pending") { response = apiError(409,"REQUEST_IN_PROGRESS","Cererea inițială este încă în procesare.",requestId); response.headers.set("Retry-After","1"); }
              else if (receipt.state === "replay") response = new Response(receipt.body,{status:receipt.status,headers:receipt.headers});
              else { response = await handler(context); await store.complete(identity.portal,identity.environment,idem,requestId,response.clone()); }
            } else response = await handler(context);
          }
        }
      }
    }
  } catch { response = apiError(503,"SERVICE_UNAVAILABLE","Serviciul nu este disponibil momentan. Reîncercați mai târziu.",requestId); }
  response.headers.set("X-Request-Id",requestId); response.headers.set("Cache-Control","no-store");
  const effective = rate ?? (portal ? { limit:portal.rate_limit_per_minute,remaining:0,reset:(Math.floor(Date.now()/60000)+1)*60,allowed:true } : null);
  if(effective) { response.headers.set("X-RateLimit-Limit",String(effective.limit)); response.headers.set("X-RateLimit-Remaining",String(effective.remaining)); response.headers.set("X-RateLimit-Reset",String(effective.reset)); }
  try { await store.log({request_id:requestId,portal:identity?.portal??null,key_prefix:identity?.prefix??null,method:["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD"].includes(request.method)?request.method:"OTHER",path:canonicalPath,status:response.status,duration_ms:Date.now()-started,rate_check_failed:rateFailed}); } catch { console.warn("partner_api_log_unavailable",requestId); }
  return response;
}
export function meResponse(context: PartnerContext, agencyCount: number) {
  return Response.json({ portal: { id:context.portal.slug,name:context.portal.display_name,slug:context.portal.slug }, environment:context.identity.environment, rate_limits:{requests_per_minute:context.portal.rate_limit_per_minute,window_seconds:60}, active_agencies:agencyCount, api_version:"1.0" });
}