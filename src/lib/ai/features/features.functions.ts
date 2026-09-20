/**
 * Server functions pentru funcțiile AI per agenție.
 *
 * Utilizatorii își pot citi doar propria hartă (pentru meniu și pagini), iar
 * activarea/oprirea este permisă exclusiv superadminului, cu audit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_FEATURE_KEYS, emptyAiFeatureMap, isAiFeatureKey, type AiFeatureMap } from "./keys";

/** Harta funcțiilor AI pentru agenția utilizatorului curent. */
export const listMyAiFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiFeatureMap> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    const { loadAiFeatures } = await import("./features.server");
    return loadAiFeatures(profile?.organization_id ?? null);
  });

export type OrganizationAiFeatures = {
  organizationId: string;
  organizationName: string;
  features: AiFeatureMap;
};

async function assertSuperadmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
  };
  const { data } = await supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "superadmin",
  });
  if (data !== true) throw new Error("Doar administratorul platformei poate schimba funcțiile AI.");
}

/** Toate agențiile, cu starea fiecărei funcții AI. Doar pentru superadmin. */
export const listOrganizationAiFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrganizationAiFeatures[]> => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: orgs }, { data: rows }] = await Promise.all([
      supabaseAdmin.from("organizations").select("id,name").order("name", { ascending: true }),
      supabaseAdmin.from("organization_ai_features").select("organization_id,feature_key,enabled"),
    ]);

    return (orgs ?? []).map((org) => {
      const features = emptyAiFeatureMap();
      for (const row of rows ?? []) {
        if (row.organization_id === org.id && isAiFeatureKey(row.feature_key)) {
          features[row.feature_key] = row.enabled === true;
        }
      }
      return { organizationId: org.id, organizationName: org.name, features };
    });
  });

const setSchema = z.object({
  organizationId: z.string().uuid(),
  featureKey: z.enum(AI_FEATURE_KEYS),
  enabled: z.boolean(),
});

/** Activează sau oprește o funcție AI pentru o agenție. Doar pentru superadmin. */
export const setOrganizationAiFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("organization_ai_features").upsert(
      {
        organization_id: data.organizationId,
        feature_key: data.featureKey,
        enabled: data.enabled,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "organization_id,feature_key" },
    );
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: data.organizationId,
      actor_id: context.userId,
      action: "organization.ai_feature_changed",
      entity: "organization_ai_features",
      entity_id: data.organizationId,
      new_values: { feature_key: data.featureKey, enabled: data.enabled },
    } as never);

    return { ok: true };
  });
