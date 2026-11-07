import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {z} from "zod";
export const resetPartnerSandbox=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator(z.object({portal:z.string().regex(/^[a-z][a-z0-9-]{1,39}$/)})).handler(async({data,context})=>{
  const access=await context.supabase.rpc("is_superadmin");if(access.error||access.data!==true)throw new Error("Acces refuzat.");
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const result=await db.rpc("partner_api_sandbox_reset",{_portal:data.portal});if(result.error)throw new Error("Resetarea datelor demo a eșuat.");return result.data;
});
export const partnerSandboxActivity=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).inputValidator(z.object({portal:z.string().regex(/^[a-z][a-z0-9-]{1,39}$/)})).handler(async({data,context})=>{
  const access=await context.supabase.rpc("is_superadmin");if(access.error||access.data!==true)throw new Error("Acces refuzat.");
  const result=await context.supabase.from("partner_api_request_logs").select("id,method,path,status,created_at").eq("portal",data.portal).eq("key_prefix","hbpk_test_").order("created_at",{ascending:false}).limit(5);
  if(result.error)throw new Error("Activitatea demo nu poate fi încărcată.");return result.data;
});