import type { OferaState } from "./publish";
import { buildOferaPreview } from "./preview.server";
import { OFERA_MISSING_MESSAGE, oferaConfigured } from "./config";
type Input = { organizationId: string; propertyId: string };
async function database() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
export async function buildOferaBodies(input: Input) {
  const db = await database();
  const { data, error } = await db.from("properties").select("id").eq("organization_id", input.organizationId).eq("id", input.propertyId).is("deleted_at", null).maybeSingle();
  if (error || !data) throw new Error("Proprietatea nu aparține agenției sau nu poate fi citită.");
  return buildOferaPreview(input.propertyId);
}
export async function oferaReasonsFor(input: Input): Promise<string[]> {
  const r = await buildOferaBodies(input);
  return [...r.reasons, ...(!oferaConfigured(process.env) ? [OFERA_MISSING_MESSAGE] : [])];
}
export async function loadOferaStates(input: Input): Promise<OferaState[]> {
  const db = await database();
  const { data, error } = await db.from("ofera_listings").select("*").eq("organization_id", input.organizationId).eq("property_id", input.propertyId);
  if (error) throw new Error("Starea Ofera nu a putut fi citită.");
  return data as OferaState[];
}
export async function saveOferaState(input: Input, state: OferaState) {
  const db = await database();
  const { error } = await db.from("ofera_listings").upsert({ ...state, organization_id: input.organizationId, property_id: input.propertyId, updated_at: new Date().toISOString() }, { onConflict: "organization_id,property_id,transaction" });
  if (error) throw new Error("Starea Ofera nu a putut fi salvată.");
}
export async function clearRejectedOferaCreate(input: Input, externalId: string) {
  const db = await database();
  const { error } = await db.from("ofera_listings").delete().eq("organization_id", input.organizationId).eq("property_id", input.propertyId).eq("external_id", externalId).eq("status", "unconfirmed").is("ofera_id", null);
  if (error) throw new Error("Starea încercării Ofera nu a putut fi finalizată.");
}