import { type PortalAdapter, type PortalContext, type ListingRef, type ListingOutcome, type PortalResult } from "../adapter";
import { zupConfigured, ZUP_MISSING_MESSAGE } from "../zup/config";
import { PortalError } from "../errors";
import { publishZup, deactivateZup, zupPortalStatus, type ZupState } from "../zup/publish";
const fail=(error:unknown):PortalResult<ListingOutcome>=>({ok:false,code:error instanceof PortalError?error.code:"PORTAL_ERROR",message:error instanceof PortalError?error.message:"Operația ZUP nu a putut fi finalizată; verifică anunțul înainte să reîncerci.",detail:error instanceof PortalError?error.detail:null});
function outcome(states:ZupState[],live:boolean):PortalResult<ListingOutcome>{
  const active=states.filter(s=>s.zup_id&&s.status!=="inactive");const url=active.find(s=>s.public_url)?.public_url;
  return {ok:true,data:{externalId:active.map(s=>`${s.transaction.toUpperCase()}:${s.zup_id}`).join("|")||states.filter(s=>s.zup_id).map(s=>`${s.transaction.toUpperCase()}:${s.zup_id}`).join("|")||null,live,detail:`zup_listings=${states.length}`,processed:states.length,portalStatus:zupPortalStatus(states),publicUrl:url??null,message:live?"Anunțurile ZUP au fost procesate.":"ZUP: validare locală, fără trimitere."}};
}
async function upsert(ctx:PortalContext,ref:ListingRef):Promise<PortalResult<ListingOutcome>>{
  try{
    const {loadZupPreview}=await import("../zup/preview.server");const built=await loadZupPreview(ref.propertyId,ctx.organizationId);
    if(!built.ok) return {ok:false,code:"VALIDATION_ERROR",message:built.reasons.join(" ")};
    if(!ctx.allowLiveRequests)return {ok:true,data:{externalId:ref.externalId,live:false,detail:"zup_dry_run",message:"ZUP: validare locală, fără trimitere."}};
    const {withZupListingLock,loadZupStored,zupPublishingDeps}=await import("../zup/listings.server");const input={organizationId:ctx.organizationId,propertyId:ref.propertyId};
    return await withZupListingLock(input,async()=>{const stored=await loadZupStored(input);const deps=await zupPublishingDeps(input);const drafts=built.bodies.map((body,index)=>({body,transaction:built.transactions[index]==="vanzare"?"sale" as const:"rent" as const}));return outcome(await publishZup(drafts,stored,deps),true);});
  }catch(error){return fail(error);}
}
export const zupAdapter: PortalAdapter = {
  id: "zup",
  async getStatus() { return { ok: true, data: { configured: zupConfigured(process.env), live: false, detail: zupConfigured(process.env) ? "Conectează contul ZUP." : ZUP_MISSING_MESSAGE } }; },
  async testConnection(ctx) {
    try {
      const { zupDependencies } = await import("../zup/store.server");
      const { testZupConnection } = await import("../zup/oauth.server");
      const r = await testZupConnection(ctx.organizationId, await zupDependencies());
      return { ok: true, data: { configured: true, live: true, detail: r.message } };
    } catch (e) { return { ok: false, code: e instanceof PortalError ? e.code : "PORTAL_ERROR", message: e instanceof PortalError ? e.message : "Conexiunea ZUP nu a putut fi verificată." }; }
  },
  publishListing:upsert,
  updateListing:upsert,
  async withdrawListing(ctx,ref){try{const {withZupListingLock,loadZupStored,zupPublishingDeps}=await import("../zup/listings.server");const input={organizationId:ctx.organizationId,propertyId:ref.propertyId};if(!ctx.allowLiveRequests)return {ok:true,data:{externalId:ref.externalId,live:false,detail:"zup_withdraw_dry_run"}};return await withZupListingLock(input,async()=>{const states=await loadZupStored(input);const d=await zupPublishingDeps(input);const changed:ZupState[]=[];for(const s of states)changed.push(await deactivateZup(s,d));return outcome(changed,true);});}catch(error){return fail(error);}},
  async sync(ctx,refs){let processed=0,failed=0;for(const ref of refs){const r=await upsert(ctx,ref);if(r.ok)processed++;else failed++;}return {ok:true,data:{processed,failed}};},
};