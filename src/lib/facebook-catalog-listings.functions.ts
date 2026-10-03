// Opt-in per anunț în Catalogul Facebook. Toate scrierile pe server, cu verificarea
// organizației (din sesiune) și a rolului, ca la publicarea pe portaluri.
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { assertPortalPropertyAccess, resolvePublishingOrg } from "@/lib/portals.functions";
import type { FacebookListingReason } from "@/lib/facebook-catalog-status";

type Ctx = Parameters<typeof resolvePublishingOrg>[0];

async function loadServer() {
  const [{ supabaseAdmin }, optin] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/site-feed/facebook-catalog-optin.server"),
  ]);
  return { admin: supabaseAdmin, optin };
}

export type PropertyFacebookCatalog = {
  enabled: boolean;
  reason: FacebookListingReason | null;
  canEdit: boolean;
};

export function canEditFacebookCatalog(agentOnly: boolean, agentsEnabled: boolean): boolean {
  return !agentOnly || agentsEnabled;
}

const propertySchema = z.object({
  propertyId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
});

export const getPropertyFacebookCatalog = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => propertySchema.parse(input))
  .handler(async ({ data, context }): Promise<PropertyFacebookCatalog> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(context as unknown as Ctx, data.organizationId);
    const { admin, optin } = await loadServer();
    const [{ data: prop }, { data: organization }] = await Promise.all([
      admin
        .from("properties")
        .select("id")
        .eq("id", data.propertyId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle(),
      admin
        .from("organizations")
        .select("facebook_catalog_agents_enabled")
        .eq("id", organizationId)
        .maybeSingle(),
    ]);
    if (!prop) throw new Error("Proprietatea nu a fost găsită.");
    const [{ data: row }, reasons] = await Promise.all([
      admin
        .from("portal_publications")
        .select("enabled")
        .eq("organization_id", organizationId)
        .eq("property_id", data.propertyId)
        .eq("portal_key", "facebook_catalog")
        .eq("enabled", true)
        .limit(1),
      optin.facebookEligibility(admin, organizationId, [data.propertyId]),
    ]);
    return {
      enabled: (row ?? []).length > 0,
      reason: reasons.get(data.propertyId) ?? null,
      canEdit: canEditFacebookCatalog(
        agentOnly,
        organization?.facebook_catalog_agents_enabled === true,
      ),
    };
  });

export const setPropertyFacebookCatalog = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => propertySchema.extend({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(
      context as unknown as Ctx,
      data.organizationId,
    );
    const { admin, optin } = await loadServer();
    const { data: organization } = await admin
      .from("organizations")
      .select("facebook_catalog_agents_enabled")
      .eq("id", organizationId)
      .maybeSingle();
    if (!canEditFacebookCatalog(agentOnly, organization?.facebook_catalog_agents_enabled === true)) {
      setResponseStatus(403);
      throw new Error("Doar managerul agenției poate adăuga anunțuri în Catalog Facebook.");
    }
    // Agentul doar pe anunțurile lui, ca la celelalte portaluri.
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const { data: prop } = await admin
      .from("properties")
      .select("id")
      .eq("id", data.propertyId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!prop) throw new Error("Proprietatea nu a fost găsită.");
    await optin.setFacebookCatalogEnabled(admin, {
      organizationId,
      propertyIds: [data.propertyId],
      enabled: data.enabled,
      actorId: context.userId,
      source: "property_publishing",
    });
    return { ok: true };
  });

/** Setări → Promovare: adaugă toate anunțurile eligibile / scoate toate. Doar administratorul agenției. */
export const bulkSetFacebookCatalog = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ mode: z.enum(["add_eligible", "remove_all"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ changed: number }> => {
    const ctx = context as unknown as Ctx;
    const { data: isAdmin } = await ctx.supabase.rpc("is_org_admin");
    if (isAdmin !== true) {
      throw new Error("Acces refuzat: doar administratorul agenției poate modifica tot catalogul.");
    }
    const { organizationId } = await resolvePublishingOrg(ctx);
    const { admin, optin } = await loadServer();
    let ids: string[];
    if (data.mode === "add_eligible") {
      const reasons = await optin.facebookEligibility(admin, organizationId);
      ids = [...reasons].filter(([, r]) => r === null).map(([id]) => id);
    } else {
      ids = [...(await optin.optedInPropertyIds(admin, organizationId))];
    }
    const changed = await optin.setFacebookCatalogEnabled(admin, {
      organizationId,
      propertyIds: ids,
      enabled: data.mode === "add_eligible",
      actorId: context.userId,
      source: data.mode,
    });
    return { changed };
  });
