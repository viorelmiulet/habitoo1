import { CRM_URL } from "@/lib/host";
import { feedImageUrl } from "@/lib/site-feed/mapper";
import { mapPropertyToZup, type ZupRow } from "./mapper";
import type { ZupCatalogue } from "./nomenclature";
import { imo24Transactions } from "../imo24/mapper";
export async function loadZupPreview(propertyId: string, organizationId?: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  let query = db.from("properties").select("*").eq("id",propertyId).is("deleted_at",null);
  if (organizationId) query = query.eq("organization_id",organizationId);
  const { data: p, error } = await query.maybeSingle();
  if (error || !p) throw new Error("Proprietatea nu a putut fi citită.");
  const [{ data: catalog, error: ce }, { data: images, error: ie }, profile] = await Promise.all([
    db.from("zup_nomenclature").select("snapshot").eq("id",1).maybeSingle(),
    db.from("property_images").select("id,storage_path").eq("property_id",propertyId).eq("organization_id",p.organization_id).eq("include_in_publish",true).or("is_confidential.eq.false,is_confidential.is.null").order("is_primary",{ascending:false,nullsFirst:false}).order("position").order("id"),
    p.assigned_to ? db.from("profiles").select("full_name,phone").eq("id",p.assigned_to).eq("organization_id",p.organization_id).maybeSingle() : Promise.resolve({data:null,error:null}),
  ]);
  if (ce || ie || profile.error) throw new Error("Datele pentru previzualizarea ZUP nu au putut fi citite.");
  const catalogue = (catalog?.snapshot ?? { categories: [], locations: [] }) as unknown as ZupCatalogue;
  const result = mapPropertyToZup(p as ZupRow,{ catalogue, images: (images ?? []).map(i => ({url:feedImageUrl(CRM_URL,i.id),path:i.storage_path})), contact: profile.data ? {fullName:profile.data.full_name ?? "",phone:profile.data.phone ?? ""} : null });
  return {...result,transactions:imo24Transactions(p),bodiesJson:result.bodies.length ? JSON.stringify(result.bodies,null,2) : null};
}