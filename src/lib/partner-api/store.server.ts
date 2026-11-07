import type { ApiIdentity, ApiPortal, Environment, PartnerStore, Rate, Receipt } from "./core.server";
export async function partnerStore(): Promise<PartnerStore> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return {
    async key(hash) { const r=await db.from("portal_index_keys").select("id,portal,prefix,environment,key_hash,status").eq("key_type","api").eq("key_hash",hash).maybeSingle(); if(r.error) throw r.error; return r.data as ApiIdentity|null; },
    async portal(slug) { const r=await db.from("dynamic_feed_portals").select("slug,display_name,active,integration_mode,rate_limit_per_minute").eq("slug",slug).maybeSingle(); if(r.error) throw r.error; return r.data as ApiPortal|null; },
    async rate(id) { const r=await db.rpc("partner_api_rate_take",{_key_id:id}); if(r.error) throw r.error; return r.data as unknown as Rate; },
    async touch(id) { const r=await db.rpc("portal_index_key_touch",{_id:id}); if(r.error) console.warn("partner_api_touch_unavailable"); },
    async countAgencies(portal,environment: Environment) {
      if(environment==="test"){
        const {supabaseReadStore}=await import("./read.server");
        return (await (await supabaseReadStore()).scope(portal,environment)).active.size;
      }
      const test=await db.from("partner_api_test_agencies").select("organization_id"); if(test.error) throw test.error;
      const ids=test.data.map(r=>r.organization_id);
      let q=db.from("portal_connections").select("organization_id,organizations!inner(id,is_demo,archived_at)",{count:"exact",head:true}).eq("portal",portal).eq("activated",true).is("organizations.archived_at",null);
      q=q.eq("organizations.is_demo",false); if(ids.length) q=q.not("organization_id","in",`(${ids.join(",")})`);
      const r=await q; if(r.error) throw r.error; return r.count??0;
    },
    async log(entry) { const r=await db.from("partner_api_request_logs").insert(entry as never); if(r.error) throw r.error; },
    async claim(portal,environment,key,hash,owner) {const r=await db.rpc("partner_api_idempotency_claim",{_portal:portal,_environment:environment,_key:key,_hash:hash,_owner:owner}); if(r.error) throw r.error; return r.data as unknown as Receipt;},
    async complete(portal,environment,key,owner,response) {
      const headers: Record<string,string>={}; for(const name of ["content-type","location"]) {const v=response.headers.get(name);if(v)headers[name]=v;}
      const r=await db.from("partner_api_idempotency").update({response_status:response.status,response_body:await response.text(),response_headers:headers}).eq("portal",portal).eq("environment",environment).eq("idempotency_key",key).eq("owner_id",owner).select("owner_id").single(); if(r.error) throw r.error;
    },
  };
}