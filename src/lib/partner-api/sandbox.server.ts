import { z } from "zod";
import { apiError, type PartnerContext } from "./core.server";
import { SANDBOX_AGENCY_ID } from "./sandbox";
import type { PartnerWriteStore, WriteResult } from "./write.server";
import type { PartnerReadStore } from "./read.server";
export const simulateSchema=z.object({action:z.enum(["listing_update","listing_withdraw","listing_create","agent_update"])}).strict();
export async function handleSandbox(ctx:PartnerContext,kind:"simulate"|"reset",body:unknown,run:(kind:"simulate"|"reset",action?:string)=>Promise<unknown>){
  if(ctx.identity.environment!=="test")return apiError(403,"FORBIDDEN","Acțiunea este disponibilă numai cu o cheie de test.",ctx.requestId);
  const p=(kind==="simulate"?simulateSchema:z.object({}).strict()).safeParse(body);
  if(!p.success)return apiError(422,"VALIDATION_ERROR","Date de simulare invalide.",ctx.requestId);
  return Response.json(await run(kind,"action" in p.data?String(p.data.action):undefined));
}
export async function sandboxWriteStore(read:PartnerReadStore):Promise<PartnerWriteStore>{
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const write=async(ctx:PartnerContext,kind:"publication"|"lead"|"message"|"stats",external:string,payload:Record<string,unknown>)=>{
    if(ctx.identity.environment!=="test")throw new Error("Sandbox requires test key");
    const r=await db.rpc("partner_api_sandbox_write",{_portal:ctx.portal.slug,_kind:kind,_external:external,_payload:payload as never});if(r.error)throw r.error;return r.data as WriteResult;
  };
  const allowed=async(ctx:PartnerContext,id:string,recent=true)=>{
    const row=await read.listing(ctx.portal.slug,id);return row?.organization_id===SANDBOX_AGENCY_ID&&(row.visible||(recent&&row.withdrawn_at!==null&&Date.parse(row.withdrawn_at)>Date.now()-30*86400000));
  };
  return {read,
    publication:async(ctx,id,body)=>await allowed(ctx,id)?write(ctx,"publication",id,{...body,listing_id:id,occurred_at:body.occurred_at??new Date().toISOString()}):{not_found:true},
    lead:async(ctx,org,body)=>org===SANDBOX_AGENCY_ID?write(ctx,"lead",body.external_id,{...body,agency_id:org}):{not_found:true},
    message:async(ctx,id,body)=>{
      const r=await db.from("partner_api_sandbox_data").select("id").eq("portal",ctx.portal.slug).eq("kind","lead").eq("id",id).gt("expires_at",new Date().toISOString()).maybeSingle();if(r.error)throw r.error;if(!r.data)return {not_found:true};
      return write(ctx,"message",`${id}:${body.external_id}`,{...body,lead_id:id});
    },
    stats:async(ctx,body)=>{
      for(const item of body.items)if(!await allowed(ctx,item.listing_id))return {not_found:true};
      for(const item of body.items)await write(ctx,"stats",`${item.listing_id}:${item.date}`,item);
      return {accepted:body.items.length};
    }
  };
}