import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  buildMyPortalItems,
  computePreselection,
  validatePortalKeys,
  type MyPortalItem,
} from "@/lib/agent-portal-preferences";

type Ctx = { userId: string; supabase: import("@supabase/supabase-js").SupabaseClient };

async function myOrg(ctx: Ctx): Promise<string> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!data?.organization_id) throw new Error("Nu aparții unei agenții.");
  return data.organization_id as string;
}

/** Doar citire: portalurile agenției cu status afișat și alegerea utilizatorului logat. */
export const getMyPortals = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<MyPortalItem[]> => {
    const ctx = context as unknown as Ctx;
    const organizationId = await myOrg(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: connections }, { data: prefs }] = await Promise.all([
      supabaseAdmin
        .from("portal_connections")
        .select(
          "portal, activated, external_account_id, portal_credentials_encrypted, last_sync_error, last_sync_status",
        )
        .eq("organization_id", organizationId),
      ctx.supabase
        .from("agent_portal_preferences")
        .select("portal_key, selected")
        .eq("user_id", ctx.userId),
    ]);
    setResponseHeader("Cache-Control", "no-store");
    // Se întorc doar id, nume, status și alegerea: nicio eroare brută sau credențial.
    return buildMyPortalItems(
      connections ?? [],
      (prefs ?? []).filter((p) => p.selected).map((p) => p.portal_key),
    ).map(({ id, name, status, selected }) => ({ id, name, status, selected }));
  });

/** Salvează alegerea utilizatorului logat (user_id și agenția vin din sesiune). */
export const saveMyPortals = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ portalKeys: z.array(z.string().min(1).max(40)).max(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const keys = validatePortalKeys(data.portalKeys);
    const organizationId = await myOrg(ctx);
    const { selectablePortalKeys } = await import("@/lib/agent-portal-preferences");
    const chosen = new Set(keys);
    const now = new Date().toISOString();
    const rows = [...selectablePortalKeys()].map((portal_key) => ({
      organization_id: organizationId,
      user_id: ctx.userId,
      portal_key,
      selected: chosen.has(portal_key),
      updated_at: now,
    }));
    // Scriere ca utilizatorul: RLS permite doar rândurile proprii din propria agenție.
    const { error } = await ctx.supabase
      .from("agent_portal_preferences")
      .upsert(rows, { onConflict: "user_id,portal_key" });
    if (error) throw new Error("Alegerea nu a putut fi salvată.");
    return { ok: true, count: keys.length };
  });

/** Portalurile de pre-bifat la un anunț nou al utilizatorului; `null` = comportamentul de acum. */
export const getPortalPreselection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ portalKeys: string[] | null }> => {
    const ctx = context as unknown as Ctx;
    const { data: prefs } = await ctx.supabase
      .from("agent_portal_preferences")
      .select("portal_key, selected, created_at")
      .eq("user_id", ctx.userId);
    if (!(prefs ?? []).some((p) => p.selected)) return { portalKeys: null };
    const organizationId = await myOrg(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("assigned_to, created_by, created_at, organization_id")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!property || property.organization_id !== organizationId) return { portalKeys: null };
    const [{ count: pubs }, { count: listings }] = await Promise.all([
      supabaseAdmin
        .from("portal_publications")
        .select("id", { count: "exact", head: true })
        .eq("property_id", data.propertyId),
      supabaseAdmin
        .from("portal_listings")
        .select("id", { count: "exact", head: true })
        .eq("property_id", data.propertyId),
    ]);
    return {
      portalKeys: computePreselection({
        userId: ctx.userId,
        prefs: prefs ?? [],
        property,
        hasPortalHistory: (pubs ?? 0) > 0 || (listings ?? 0) > 0,
      }),
    };
  });
