/**
 * Citirea funcțiilor AI activate pentru o agenție.
 *
 * Funcțiile sunt pornite implicit; doar un rând cu `enabled = false` le oprește.
 * Fail-closed: agenție lipsă, AI oprit general, agenție suspendată/arhivată sau
 * eroare de citire înseamnă „oprit”.
 */
import { defaultAiFeatureMap, emptyAiFeatureMap, isAiFeatureKey, type AiFeatureKey, type AiFeatureMap } from "./keys";

/** Harta completă a funcțiilor pentru o agenție. */
export async function loadAiFeatures(organizationId: string | null): Promise<AiFeatureMap> {
  const map = emptyAiFeatureMap();
  if (!organizationId) return map;

  if (!(await isOrgAiEnabled(organizationId))) return map;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("organization_ai_features")
    .select("feature_key,enabled")
    .eq("organization_id", organizationId);
  if (error || !data) return map;

  const effective = defaultAiFeatureMap();
  for (const row of data) {
    if (isAiFeatureKey(row.feature_key)) effective[row.feature_key] = row.enabled !== false;
  }
  return effective;
}

/** `true` când funcția nu a fost oprită de superadmin pentru agenția respectivă. */
export async function isAiFeatureEnabled(
  organizationId: string | null,
  key: AiFeatureKey,
): Promise<boolean> {
  const features = await loadAiFeatures(organizationId);
  return features[key];
}

/** Mesaj unic când AI este oprit pentru întreaga agenție. */
export const AI_DISABLED_MESSAGE =
  "Funcțiile AI nu sunt activate pentru agenția ta. Doar administratorul platformei Habitoo le poate activa.";

/**
 * Comutatorul general `organizations.ai_enabled` (setat doar de superadmin).
 * Fail-closed: lipsă/eroare = oprit.
 */
export async function isOrgAiEnabled(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("ai_enabled,status")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return false;
  const status = (data as { status?: string | null }).status;
  if (status === "suspended" || status === "cancelled") return false;
  return data.ai_enabled === true;
}
