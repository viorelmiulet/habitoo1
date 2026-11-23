import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DESCRIPTION_PORTALS, portalDescriptionFromDraft, type DescriptionPortal } from "./portal-description";

/** Only explicitly applied portal drafts; CRM text and unpublished choices stay unchanged. */
export async function readPortalDescription(db: SupabaseClient<Database>, organizationId: string, property: Record<string, unknown>, portal: string): Promise<string | null> {
  if (!(DESCRIPTION_PORTALS as readonly string[]).includes(portal)) return null;
  const { data, error } = await db.from("marketing_drafts").select("body,context_hash,context_snapshot,applied_at").eq("organization_id", organizationId).eq("property_id", String(property["id"])).contains("context_snapshot", { portalDescription: portal as DescriptionPortal }).not("applied_at", "is", null).order("applied_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Descrierea selectată pentru portal nu a putut fi citită.");
  return portalDescriptionFromDraft(data, property, portal);
}