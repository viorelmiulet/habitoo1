// „Site-ul agenției” — setări (doar administratorul agenției) și bifa per anunț.
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { assertPortalPropertyAccess, resolvePublishingOrg } from "@/lib/portals.functions";
import { AGENCY_SITE_PORTAL_KEY, normalizeAgencySiteUrl } from "@/lib/site-feed/agency-site";

type Ctx = Parameters<typeof resolvePublishingOrg>[0];

async function loadServer() {
  const [{ supabaseAdmin }, site] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/site-feed/agency-site.server"),
  ]);
  return { admin: supabaseAdmin, site };
}

async function requireAgencyAdmin(context: Ctx): Promise<string> {
  const { data: isAdmin } = await context.supabase.rpc("is_org_admin");
  if (isAdmin !== true) {
    setResponseStatus(403);
    throw new Error("Acces refuzat: doar administratorul agenției gestionează site-ul agenției.");
  }
  const { organizationId } = await resolvePublishingOrg(context);
  return organizationId;
}

export type AgencySiteSettings = {
  configured: boolean;
  siteUrl: string | null;
  displayName: string;
  active: boolean;
  agencyName: string;
};

export const getAgencySiteSettings = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<AgencySiteSettings> => {
    const organizationId = await requireAgencyAdmin(context as unknown as Ctx);
    const { admin, site } = await loadServer();
    const [row, { data: org }] = await Promise.all([
      site.loadAgencySite(admin, organizationId),
      admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    ]);
    const agencyName = org?.name ?? "";
    return {
      configured: row !== null,
      siteUrl: row?.site_url ?? null,
      displayName: row?.display_name ?? agencyName,
      active: row?.active ?? false,
      agencyName,
    };
  });

export const saveAgencySiteSettings = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({
      siteUrl: z.string().trim().max(300).nullable(),
      displayName: z.string().trim().max(80).nullable(),
      active: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ selected: number }> => {
    const organizationId = await requireAgencyAdmin(context as unknown as Ctx);
    let siteUrl: string | null;
    try {
      siteUrl = normalizeAgencySiteUrl(data.siteUrl);
    } catch (e) {
      setResponseStatus(422);
      throw e;
    }
    const { admin, site } = await loadServer();
    const { data: org } = await admin.from("organizations").select("name").eq("id", organizationId).maybeSingle();
    const out = await site.saveAgencySite(admin, {
      organizationId,
      actorId: context.userId,
      siteUrl,
      displayName: data.displayName,
      active: data.active,
      agencyName: org?.name ?? null,
    });
    return { selected: out.selected };
  });

export type PropertyAgencySite = {
  available: boolean;
  displayName: string;
  enabled: boolean;
};

const propertySchema = z.object({
  propertyId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
});

/** Rândul din fișa anunțului: doar pentru agenția proprie, doar când site-ul e activ. */
export const getPropertyAgencySite = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => propertySchema.parse(input))
  .handler(async ({ data, context }): Promise<PropertyAgencySite> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(context as unknown as Ctx, data.organizationId);
    await assertPortalPropertyAccess({ organizationId, propertyId: data.propertyId, agentOnly, userId: context.userId });
    const { admin, site } = await loadServer();
    const row = await site.loadAgencySite(admin, organizationId);
    if (!row?.active) return { available: false, displayName: "", enabled: false };
    const { data: pub } = await admin
      .from("portal_publications")
      .select("enabled")
      .eq("organization_id", organizationId)
      .eq("property_id", data.propertyId)
      .eq("portal_key", AGENCY_SITE_PORTAL_KEY)
      .maybeSingle();
    return { available: true, displayName: row.display_name, enabled: pub?.enabled === true };
  });

export const setPropertyAgencySite = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => propertySchema.extend({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }): Promise<{ changed: boolean }> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(context as unknown as Ctx, data.organizationId);
    await assertPortalPropertyAccess({ organizationId, propertyId: data.propertyId, agentOnly, userId: context.userId });
    const { admin, site } = await loadServer();
    const row = await site.loadAgencySite(admin, organizationId);
    if (!row?.active) {
      setResponseStatus(409);
      throw new Error("Site-ul agenției nu este activ.");
    }
    const { data: prop } = await admin
      .from("properties").select("id").eq("id", data.propertyId).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
    if (!prop) throw new Error("Proprietatea nu a fost găsită.");
    const changed = await site.setPropertyAgencySiteSelection(admin, {
      organizationId, propertyId: data.propertyId, enabled: data.enabled, actorId: context.userId,
    });
    return { changed };
  });
