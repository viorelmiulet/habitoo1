import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
export const getZupListingStatus=createServerFn({method:"POST"}).middleware([requireActiveOrgAuth])
  .inputValidator((d:unknown)=>z.object({organizationId:z.string().uuid().optional(),propertyId:z.string().uuid()}).parse(d))
  .handler(async({data,context})=>{
    const {resolvePublishingOrg,assertPortalPropertyAccess}=await import("@/lib/portals.functions");const {organizationId,agentOnly}=await resolvePublishingOrg(context as never,data.organizationId);await assertPortalPropertyAccess({organizationId,propertyId:data.propertyId,agentOnly,userId:context.userId});
    const {refreshZupStatus}=await import("./status.server");const rows=await refreshZupStatus({organizationId,propertyId:data.propertyId});
    return rows.map(r=>({id:r.zup_id,transaction:r.transaction,status:r.status,url:r.public_url,error:r.last_error,checkedAt:r.last_checked_at}));
  });