import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildCompletionPatch,
  completeAgencyDataSchema,
  missingAgencyPublicFields,
} from "@/lib/agency-public-data";

/**
 * Completarea datelor publice obligatorii de către adminul agenției.
 * Folosește `requireSupabaseAuth` (nu `requireActiveOrgAuth`), ca să poată rula chiar când poarta e închisă.
 */
export const completeAgencyPublicData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => completeAgencyDataSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context as {
      supabase: typeof context.supabase;
      userId: string;
    };
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    const orgId = profile?.organization_id;
    if (!orgId) throw new Error("Nu aparții unei agenții.");
    const { data: isAdmin } = await supabase.rpc("is_org_admin", { _org: orgId } as never);
    if (!isAdmin) throw new Error("Doar adminul agenției poate completa datele agenției.");

    const { data: org, error } = await supabase
      .from("organizations")
      .select("id,email,phone,material_address,city,postal_code,material_website,status")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !org) throw new Error("Agenția nu a fost găsită.");

    const patch = buildCompletionPatch(org, data);
    if (Object.keys(patch).length) {
      const { error: updError } = await supabase.from("organizations").update(patch).eq("id", orgId);
      if (updError) throw new Error(updError.message);
      await supabase.from("audit_logs").insert({
        organization_id: orgId,
        actor_id: userId,
        action: "organization.public_data_completed",
        entity: "organizations",
        entity_id: orgId,
        old_values: Object.fromEntries(Object.keys(patch).map((k) => [k, (org as Record<string, unknown>)[k] ?? null])),
        new_values: patch,
        created_by: userId,
      });
    }
    const after = { ...org, ...patch };
    if (missingAgencyPublicFields(after).length) throw new Error("Mai sunt câmpuri obligatorii necompletate.");
    return { ok: true };
  });
