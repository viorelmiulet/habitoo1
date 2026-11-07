import {apiError,servePartner,PARTNER_API_BASE,type PartnerContext,type Environment} from './core.server';
import {partnerStore} from './store.server';
import {webhookInput,webhookDeliveryQuery,type WebhookConfig,type WebhookDelivery,type WebhookEvent} from './webhook';
import {validateWebhookUrl,WebhookUrlError,newWebhookSecret,sendWebhook} from './webhook-security.server';
import {encryptPortalCredential,decryptPortalCredential} from '@/lib/portals/crypto.server';
export type StoredWebhook=WebhookConfig & {secret_encrypted:string;generation:string};
export type ClaimedWebhook={id:string;portal:string;environment:Environment;generation:string;event:WebhookEvent;seq:number;created_at:string;attempt:number;url:string;secret_encrypted:string};
export type WebhookStore={get:(portal:string,env:Environment)=>Promise<StoredWebhook|null>;put:(portal:string,env:Environment,url:string,events:string[],secret:string|null)=>Promise<void>;remove:(portal:string,env:Environment)=>Promise<void>;deliveries:(portal:string,env:Environment,limit:number,cursor?:string)=>Promise<{data:WebhookDelivery[];next_cursor:string|null}>;test:(portal:string,env:Environment)=>Promise<string|null>;claim:(owner:string,portal?:string,env?:Environment)=>Promise<ClaimedWebhook|null>;finish:(row:ClaimedWebhook,owner:string,delivery:string,result:Awaited<ReturnType<typeof sendWebhook>>)=>Promise<void>;wake:()=>Promise<void>};
export function publicWebhook(w:StoredWebhook|null):WebhookConfig|null{return w?{url:w.url,events:w.events,status:w.status,has_secret:true,last_success_at:w.last_success_at,consecutive_failures:w.consecutive_failures}:null;}
export async function webhookStore():Promise<WebhookStore>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const db=supabaseAdmin as any;
 const check=(r:any)=>{if(r.error)throw new Error('Webhook storage unavailable');return r.data;};
 return {
  async get(portal,environment){const r=check(await db.from('partner_api_webhooks').select('*').eq('portal',portal).eq('environment',environment).maybeSingle());return r?{...r,has_secret:true}:null;},
  async put(portal,environment,url,events,secret){const r=check(await db.rpc('partner_webhook_put',{_portal:portal,_environment:environment,_url:url,_events:events,_secret:secret}));if(r?.retry)throw new Error('Concurrent webhook change');},
  async remove(portal,environment){check(await db.from('partner_api_webhooks').delete().eq('portal',portal).eq('environment',environment));},
  async deliveries(portal,environment,limit,cursor){let q=db.from('partner_api_webhook_deliveries').select('cursor_id,id,event,seq,http_status,duration_ms,attempt,occurred_at,error').eq('portal',portal).eq('environment',environment).gte('occurred_at',new Date(Date.now()-14*86400000).toISOString()).order('cursor_id',{ascending:false}).limit(limit+1);if(cursor)q=q.lt('cursor_id',cursor);const rows=check(await q) as (WebhookDelivery&{cursor_id:number})[];const page=rows.slice(0,limit);return {data:page.map(({cursor_id,...row})=>row),next_cursor:rows.length>limit?String(page.at(-1)?.cursor_id):null};},
  async test(portal,environment){return check(await db.rpc('partner_webhook_test_enqueue',{_portal:portal,_environment:environment}));},
  async claim(owner,portal,environment){return check(await db.rpc('partner_webhook_claim',{_owner:owner,_portal:portal??null,_environment:environment??null}));},
  async finish(row,owner,delivery,result){check(await db.rpc('partner_webhook_finish',{_id:row.id,_owner:owner,_delivery:delivery,_ok:result.ok,_http:result.http_status,_duration:result.duration_ms,_error:result.error}));},
  async wake(){check(await db.rpc('partner_webhook_wake'));},
 };
}
export async function runWebhookWorker(store?:WebhookStore,send:typeof fetch=fetch,portal?:string,env?:Environment){
 const s=store??await webhookStore(),started=Date.now();let processed=0;
 while(processed<10 && Date.now()-started<40000){const owner=crypto.randomUUID(),row=await s.claim(owner,portal,env);if(!row)break;
  const delivery=crypto.randomUUID();let result:Awaited<ReturnType<typeof sendWebhook>>;
  if(Date.now()>=Date.parse(row.created_at)+86400000)result={ok:false,http_status:null,duration_ms:0,error:'Livrarea a depășit intervalul de 24 de ore.'};
  else try{const secret=decryptPortalCredential(row.secret_encrypted);if(!secret)throw new Error('missing secret');result=await sendWebhook(row.url,secret,row.event,delivery,send);}catch{result={ok:false,http_status:null,duration_ms:0,error:'Secretul webhook nu poate fi citit.'};}
  await s.finish(row,owner,delivery,result);processed++;
 }
 return {processed};
}
export const webhookInternals={webhookTestBody};
export async function handleWebhook(request:Request,ctx:PartnerContext,store:WebhookStore,kind:'config'|'test'|'deliveries',send:typeof fetch=fetch){
 const p=ctx.portal.slug,env=ctx.identity.environment;
 if(kind==='deliveries'){
  if(request.method!=='GET')return apiError(405,'METHOD_NOT_ALLOWED','Folosiți GET.',ctx.requestId);
  const q=webhookDeliveryQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!q.success)return apiError(422,'VALIDATION_ERROR','limit trebuie să fie 1–100, cursor numeric.',ctx.requestId);
  return Response.json(await store.deliveries(p,env,q.data.limit,q.data.cursor));
 }
 if(kind==='test'){
  if(request.method!=='POST')return apiError(405,'METHOD_NOT_ALLOWED','Folosiți POST.',ctx.requestId);
  if(!request.headers.get('Idempotency-Key'))return apiError(400,'IDEMPOTENCY_KEY_REQUIRED','Idempotency-Key este obligatoriu.',ctx.requestId);
  const raw=await request.text();if(raw.length>1000)return apiError(413,'PAYLOAD_TOO_LARGE','Corpul cererii este prea mare.',ctx.requestId);
  if(raw){try{if(!webhookTestBody(JSON.parse(raw)))throw new Error();}catch{return apiError(422,'VALIDATION_ERROR','Trimiteți un obiect JSON gol.',ctx.requestId);}}
  const id=await store.test(p,env);if(!id)return apiError(404,'NOT_FOUND','Webhook activ inexistent.',ctx.requestId);
  await runWebhookWorker(store,send,p,env);await store.wake();return Response.json({id,queued:true});
 }
 if(request.method==='GET')return Response.json(publicWebhook(await store.get(p,env)));
 if(request.method==='DELETE'){await store.remove(p,env);return Response.json({deleted:true});}
 if(request.method!=='PUT')return apiError(405,'METHOD_NOT_ALLOWED','Folosiți GET, PUT sau DELETE.',ctx.requestId);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return apiError(415,'UNSUPPORTED_MEDIA_TYPE','Folosiți application/json.',ctx.requestId);
 const raw=await request.text();if(raw.length>4096)return apiError(413,'PAYLOAD_TOO_LARGE','Corpul cererii este prea mare.',ctx.requestId);
 let body:unknown;try{body=JSON.parse(raw);}catch{return apiError(422,'INVALID_JSON','JSON invalid.',ctx.requestId);}
 const input=webhookInput.safeParse(body);if(!input.success)return apiError(422,'VALIDATION_ERROR','Date webhook invalide.',ctx.requestId);
 let url:URL;try{url=await validateWebhookUrl(input.data.url,send);}catch(e){return apiError(422,'VALIDATION_ERROR',e instanceof WebhookUrlError?e.message:'Adresa webhook nu poate fi verificată.',ctx.requestId);}
 const previous=await store.get(p,env),secret=!previous||input.data.rotate_secret?newWebhookSecret():null;
 await store.put(p,env,url.toString(),input.data.events??[],secret?encryptPortalCredential(secret):null);
 return Response.json({...publicWebhook(await store.get(p,env)),...(secret?{secret}:{})});
}
function webhookTestBody(body:unknown){return !!body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).length===0;}
export async function partnerWebhook(request:Request,kind:'config'|'test'|'deliveries'){
 return servePartner(request,await partnerStore(),ctx=>webhookStore().then(store=>handleWebhook(request,ctx,store,kind)),`${PARTNER_API_BASE}/webhook${kind==='config'?'':`/${kind}`}`);
}
