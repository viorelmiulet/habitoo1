import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { dynamicFeedPortalSchema } from "@/lib/dynamic-feed-portals";

export const partnerPortalSchema=dynamicFeedPortalSchema.extend({integration_mode:z.enum(["feed","api","both"]),rate_limit_per_minute:z.number().int().min(1).max(100000),active:z.boolean().default(true)});
const slugSchema=dynamicFeedPortalSchema.shape.slug;
export const listPartnerPortals=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const access=await context.supabase.rpc("is_superadmin");if(access.error||access.data!==true)throw new Error("Acces refuzat.");
  const portals=await context.supabase.from("dynamic_feed_portals").select("slug,display_name,key_prefix,website,logo_path,xml_enabled,active,show_public,integration_mode,rate_limit_per_minute").order("display_name");
  const keys=await context.supabase.from("portal_index_keys").select("id,portal,prefix,last4,environment,status,created_at,last_used_at").eq("key_type","api").order("created_at",{ascending:false});
  if(portals.error||keys.error)throw new Error("Portalurile nu pot fi încărcate.");
  return {portals:portals.data,keys:keys.data};
});
export const savePartnerPortal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(partnerPortalSchema.extend({editing:z.boolean()})).handler(async({data,context})=>{
  const access=await context.supabase.rpc("is_superadmin");if(access.error||access.data!==true)throw new Error("Acces refuzat.");
  if(data.logo_path&&!data.logo_path.startsWith(`${data.slug}/`))throw new Error("Logo invalid.");
  const {editing,slug,...patch}=data;
  if(editing){const r=await context.supabase.from("dynamic_feed_portals").update(patch).eq("slug",slug).select("slug").single();if(r.error)throw new Error("Portalul nu a putut fi salvat.");}
  else {
    const {STATIC_PORTALS,PROMOTION_CATALOGS}=await import("@/lib/portals/registry");
    if([...STATIC_PORTALS,...PROMOTION_CATALOGS].some(p=>p.id===slug))throw new Error("Identificatorul există deja în registry.");
    const {chooseFeedPrefix}=await import("@/lib/dynamic-feed-portals");
    const {INDEX_PORTALS}=await import("@/lib/portals/clickimob/index-feed");
    const current=await context.supabase.from("dynamic_feed_portals").select("slug,key_prefix");if(current.error)throw new Error("Catalog indisponibil.");
    if(current.data.some(p=>p.slug===slug))throw new Error("Identificatorul există deja.");
    const key_prefix=chooseFeedPrefix(slug,[...Object.values(INDEX_PORTALS).map(p=>p.prefix),"hbps_",...current.data.map(p=>p.key_prefix)]);
    const r=await context.supabase.from("dynamic_feed_portals").insert({...patch,slug,key_prefix,created_by:context.userId});if(r.error)throw new Error("Portalul nu a putut fi creat; verifică identificatorul unic.");
  }
  return {ok:true};
});
export const generatePartnerApiKey=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(z.object({portal:slugSchema,environment:z.enum(["test","live"])})).handler(async({data,context})=>{
  const access=await context.supabase.rpc("is_superadmin");if(access.error||access.data!==true)throw new Error("Acces refuzat.");
  const p=await context.supabase.from("dynamic_feed_portals").select("active,integration_mode").eq("slug",data.portal).single();if(p.error||!p.data.active||p.data.integration_mode==="feed")throw new Error("Activează modul API pentru portal.");
  const {generatePartnerKey}=await import("./core.server");const generated=generatePartnerKey(data.environment);
  const {key,...metadata}=generated;const r=await context.supabase.from("portal_index_keys").insert({...metadata,portal:data.portal,created_by:context.userId});if(r.error)throw new Error("Cheia nu a putut fi generată.");
  return {key};
});
export const revokePartnerApiKey=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid()})).handler(async({data,context})=>{
  const access=await context.supabase.rpc("is_superadmin");if(access.error||access.data!==true)throw new Error("Acces refuzat.");
  const r=await context.supabase.from("portal_index_keys").update({status:"revoked",revoked_at:new Date().toISOString()}).eq("id",data.id).eq("key_type","api").select("id").single();if(r.error)throw new Error("Cheia nu a putut fi revocată.");return {ok:true};
});
export const listPartnerApiLogs=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).inputValidator(z.object({portal:slugSchema.optional(),status:z.number().int().min(100).max(599).optional(),path:z.string().max(100).optional(),page:z.number().int().min(0).max(10000).default(0)})).handler(async({data,context})=>{
  const access=await context.supabase.rpc("is_superadmin");if(access.error||access.data!==true)throw new Error("Acces refuzat.");
  let q=context.supabase.from("partner_api_request_logs").select("id,request_id,portal,key_prefix,method,path,status,duration_ms,rate_check_failed,created_at",{count:"exact"}).gte("created_at",new Date(Date.now()-7*86400000).toISOString()).order("created_at",{ascending:false}).order("id");
  if(data.portal)q=q.eq("portal",data.portal);if(data.status)q=q.eq("status",data.status);if(data.path)q=q.eq("path",data.path);
  const r=await q.range(data.page*50,data.page*50+49);if(r.error)throw new Error("Jurnal indisponibil.");return {rows:r.data,total:r.count??0};
});