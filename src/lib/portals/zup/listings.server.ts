import { PortalError } from "../errors";
import { zupCall } from "./oauth.server";
import { zupDependencies } from "./store.server";
import type { ZupState } from "./publish";
export type ZupInput={organizationId:string;propertyId:string};
export async function loadZupStored(i:ZupInput):Promise<ZupState[]> {
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const {data,error}=await db.from("zup_listings").select("*").eq("organization_id",i.organizationId).eq("property_id",i.propertyId);
  if(error)throw new PortalError("CONFIG_ERROR","zup_listing_read","Starea anunțului ZUP nu a putut fi citită.");
  return (data??[]).map(r=>({...r,transaction:r.transaction as "sale"|"rent",photos:r.photos as unknown as ZupState["photos"],pending_images:r.pending_images as unknown as string[]}));
}
export async function saveZupState(i:ZupInput,s:ZupState) {
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const {error}=await db.from("zup_listings").upsert({...i,organization_id:i.organizationId,property_id:i.propertyId,transaction:s.transaction,zup_id:s.zup_id,slug:s.slug,public_url:s.public_url,status:s.status,photos:s.photos as never,pending_images:s.pending_images as never,attempted_at:s.attempted_at,attempted_title:s.attempted_title,attempted_price:s.attempted_price,last_error:s.last_error,updated_at:new Date().toISOString()}, {onConflict:"organization_id,property_id,transaction"});
  if(error)throw new PortalError("CONFIG_ERROR","zup_listing_save","Starea anunțului ZUP nu a putut fi salvată. Nu retrimite înainte să verifici pe ZUP.");
}
export async function withZupListingLock<T>(i:ZupInput,fn:()=>Promise<T>):Promise<T> {
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");const owner=crypto.randomUUID();const key=`listing:${i.propertyId}`;
  const {data,error}=await db.rpc("acquire_portal_operation_lock",{_organization_id:i.organizationId,_portal:"zup",_lock_key:key,_owner_token:owner,_ttl_seconds:300});
  if(error||data!==true)throw new PortalError("INVALID_REQUEST","zup_listing_busy","O operație ZUP este deja în curs pentru această proprietate. Reîncearcă după finalizare.");
  try{return await fn();}finally{await db.rpc("release_portal_operation_lock",{_organization_id:i.organizationId,_portal:"zup",_lock_key:key,_owner_token:owner});}
}
export async function zupPublishingDeps(i:ZupInput) {const d=await zupDependencies();return {call:(path:string,method:"GET"|"POST"|"PUT"|"DELETE",body?:unknown)=>zupCall(i.organizationId,path,method,body,d),save:(state:ZupState)=>saveZupState(i,state)};}