import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
    const { data: isAdmin } = await supabase.rpc("is_org_admin");
    if (!isAdmin) throw new Error("Doar adminul agenției poate completa datele agenției.");

    const { data: org, error } = await supabase
      .from("organizations")
      .select("id,email,phone,material_address,city,postal_code,material_website,status")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !org) throw new Error("Agenția nu a fost găsită.");

    const patch = buildCompletionPatch(org, data);
    if (Object.keys(patch).length) {
      const { error: updError } = await supabase.from("organizations").update(patch as never).eq("id", orgId);
      if (updError) throw new Error(updError.message);
      await supabase.from("audit_logs").insert({
        organization_id: orgId,
        actor_id: userId,
        action: "organization.public_data_completed",
        entity: "organizations",
        entity_id: orgId,
        old_values: Object.fromEntries(Object.keys(patch).map((k) => [k, ((org as Record<string, unknown>)[k] as string | null) ?? null])) as never,
        new_values: patch,
        created_by: userId,
      });
    }
    const after = { ...org, ...patch };
    if (missingAgencyPublicFields(after).length) throw new Error("Mai sunt câmpuri obligatorii necompletate.");
    return { ok: true };
  });

const companySchema = z.object({
  legal_name: z.string().trim().max(200).optional(),
  cui: z.string().trim().regex(/^(RO)?\d{2,10}$/i, "CUI: doar cifre, cu „RO” opțional în față.").optional().or(z.literal("")),
  trade_registry_number: z.string().trim().max(50).optional(),
});

/**
 * Adminul agenției completează DOAR datele firmei încă goale (denumire legală, CUI,
 * nr. Registrul Comerțului). Valorile existente rămân modificabile doar de superadmin.
 */
export const completeAgencyCompanyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => companySchema.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; changed: string[] }> => {
    const { supabase, userId } = context as { supabase: typeof context.supabase; userId: string };
    const { data: isAdmin } = await supabase.rpc("is_org_admin");
    if (!isAdmin) throw new Error("Doar adminul agenției poate completa datele firmei.");
    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = profile?.organization_id;
    if (!orgId) throw new Error("Nu aparții unei agenții.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("legal_name,cui,trade_registry_number")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) throw new Error("Agenția nu a fost găsită.");
    const patch: Record<string, string> = {};
    for (const key of ["legal_name", "cui", "trade_registry_number"] as const) {
      const v = (data[key] ?? "").trim();
      if (v && !String(org[key] ?? "").trim()) patch[key] = key === "cui" ? v.toUpperCase() : v;
    }
    const changed = Object.keys(patch);
    if (changed.length) {
      const { error } = await supabaseAdmin.from("organizations").update(patch as never).eq("id", orgId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("audit_logs").insert({
        organization_id: orgId,
        actor_id: userId,
        action: "organization.company_data_completed",
        entity: "organizations",
        entity_id: orgId,
        new_values: patch,
      } as never);
      const { retryPendingImospotRequests } = await import("@/lib/portals/imospot-key-request.server");
      await retryPendingImospotRequests(orgId, userId);
    }
    return { ok: true, changed };
  });
