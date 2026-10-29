import { loadZupStored, saveZupState, withZupListingLock, zupPublishingDeps, type ZupInput } from "./listings.server";
import { zupRemoteState, reconcilePhotos, zupPortalStatus } from "./publish";
export async function refreshZupStatus(i:ZupInput) {
  const {getPortalDefinition}=await import("../registry");const {buildContext}=await import("@/lib/portals.functions");const def=getPortalDefinition("zup");if(!def)throw new Error("Portal ZUP indisponibil.");
  const {ctx}=await buildContext(i.organizationId,def);if(!ctx.allowLiveRequests)return loadZupStored(i);
  return withZupListingLock(i,async()=>{
    const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");const deps=await zupPublishingDeps(i);const rows=await loadZupStored(i);
    for(const s of rows){if(!s.zup_id)continue;const {data,error}=await db.rpc("zup_claim_status",{_organization:i.organizationId,_property:i.propertyId,_transaction:s.transaction});if(error)throw new Error("Statusul ZUP nu a putut fi verificat.");if(data!==true)continue;
      try{const r=await deps.call(`anunturi/${s.zup_id}`,"GET");await saveZupState(i,{...reconcilePhotos(zupRemoteState(s,r),r),last_error:null});}
      catch(error){await saveZupState(i,{...s,last_error:error instanceof Error?error.message:"Verificarea ZUP a eșuat."});}
    }
    const fresh=await loadZupStored(i);const {error}=await db.from("portal_listings").update({status:zupPortalStatus(fresh),last_sync_at:new Date().toISOString(),last_error:fresh.find(s=>s.last_error)?.last_error??null}).eq("organization_id",i.organizationId).eq("property_id",i.propertyId).eq("portal","zup").neq("status","withdrawn");if(error)throw new Error("Statusul ZUP nu a putut fi salvat.");return fresh;
  });
}