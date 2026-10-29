import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const syncZupNomenclature = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((input:{organizationId:string}) => z.object({organizationId:z.string().uuid()}).parse(input))
  .handler(async ({data,context}) => {
    const {data:allowed} = await context.supabase.rpc("is_superadmin");
    if (allowed !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const {synchronizeZup} = await import("./nomenclature.server");
    return synchronizeZup(data.organizationId,context.userId);
  });
export const getZupNomenclatureStatus = createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).handler(async ({context}) => {
  const {data:allowed} = await context.supabase.rpc("is_superadmin");
  if (allowed !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
  const {data,error} = await context.supabase.from("zup_nomenclature_syncs").select("created_at,success,counts,changes,error_message").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (error) throw new Error("Istoricul ZUP nu a putut fi citit.");
  return data;
});
export const previewZupPayload = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((input:{propertyId:string}) => z.object({propertyId:z.string().uuid()}).parse(input))
  .handler(async ({data,context}) => {
    const {data:allowed} = await context.supabase.rpc("is_superadmin");
    if (allowed !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const {loadZupPreview} = await import("./preview.server");
    return loadZupPreview(data.propertyId);
  });