// Server functions pentru cardul „Portaluri imobiliare” din Setări → Integrări.
// Secretul portalului nu este niciodată returnat către frontend sau logat.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PORTALS, derivePortalStatus, getPortalDefinition, type PortalIntegrationStatus } from "@/lib/portals/registry";

export type PortalCardData = {
  key: string;
  name: string;
  website: string;
  description: string;
  status: PortalIntegrationStatus;
  enabled: boolean;
  externalAgencyId: string | null;
  hasCredential: boolean;
  credentialPrefix: string | null;
  endpointUrl: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  eligibleProperties: number;
  publications: number;
  hasFeedToken: boolean;
  feedBaseUrl: string;
};

type AuthContext = {
  supabase: {
    rpc: (fn: "is_org_admin") => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
    from: (table: "profiles") => {
      select: (cols: string) => {
        eq: (
          col: string,
          value: string,
        ) => { maybeSingle: () => PromiseLike<{ data: { organization_id: string | null } | null }> };
      };
    };
  };
  userId: string;
};

async function requireOrgAdmin(context: AuthContext): Promise<string> {
  const { data: isAdmin, error } = await context.supabase.rpc("is_org_admin");
  if (error || isAdmin !== true) {
    throw new Error("Acces refuzat: doar administratorul agenției poate gestiona portalurile.");
  }
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error("Agenția nu este configurată.");
  return profile.organization_id;
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getPortalIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalCardData[]> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { CANONICAL_CRM_URL, FEED_BASE_PATH } = await import("@/lib/portals/urls.server");

    const [{ data: rows }, eligible, tokens, { data: pubs }] = await Promise.all([
      admin
        .from("portal_integrations")
        .select(
          "portal_key, status, enabled, endpoint_url, external_agency_id, credential_prefix, credential_secret, last_sync_at, last_error, last_error_at",
        )
        .eq("organization_id", organizationId),
      admin
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("publish_status", "published")
        .is("deleted_at", null)
        .in("status", ["active", "reserved", "negotiation"]),
      admin
        .from("site_feed_tokens")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("revoked_at", null),
      admin
        .from("portal_publications")
        .select("portal_key")
        .eq("organization_id", organizationId)
        .eq("enabled", true),
    ]);

    const byKey = new Map((rows ?? []).map((r) => [r.portal_key, r]));
    const pubCount = new Map<string, number>();
    for (const p of pubs ?? []) pubCount.set(p.portal_key, (pubCount.get(p.portal_key) ?? 0) + 1);

    return PORTALS.map((definition) => {
      const row = byKey.get(definition.key);
      const hasCredential = Boolean(row?.credential_secret);
      const status = derivePortalStatus({
        definition,
        externalAgencyId: row?.external_agency_id ?? null,
        hasCredential,
        enabled: Boolean(row?.enabled),
        lastError: row?.last_error ?? null,
      });
      return {
        key: definition.key,
        name: definition.name,
        website: definition.website,
        description: definition.description,
        status,
        enabled: Boolean(row?.enabled),
        externalAgencyId: row?.external_agency_id ?? null,
        hasCredential,
        credentialPrefix: row?.credential_prefix ?? null,
        endpointUrl: row?.endpoint_url ?? null,
        lastSyncAt: row?.last_sync_at ?? null,
        lastError: row?.last_error ?? null,
        lastErrorAt: row?.last_error_at ?? null,
        eligibleProperties: eligible.count ?? 0,
        publications: pubCount.get(definition.key) ?? 0,
        hasFeedToken: (tokens.count ?? 0) > 0,
        feedBaseUrl: `${CANONICAL_CRM_URL}${FEED_BASE_PATH}`,
      };
    });
  });

const saveSchema = z.object({
  portalKey: z.string().trim().min(2).max(40),
  externalAgencyId: z.string().trim().max(120).optional(),
  credential: z.string().trim().max(400).optional(),
  endpointUrl: z.string().trim().url().max(300).optional(),
  enabled: z.boolean().optional(),
});

export const savePortalIntegration = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ status: PortalIntegrationStatus }> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const definition = getPortalDefinition(data.portalKey);
    if (!definition) throw new Error("Portal necunoscut.");
    const admin = await loadAdmin();

    const { data: existing } = await admin
      .from("portal_integrations")
      .select("id, external_agency_id, credential_secret, enabled")
      .eq("organization_id", organizationId)
      .eq("portal_key", definition.key)
      .maybeSingle();

    const credential = data.credential?.trim() || null;
    const externalAgencyId = data.externalAgencyId?.trim() || existing?.external_agency_id || null;
    const hasCredential = Boolean(credential ?? existing?.credential_secret);
    const enabled = data.enabled ?? Boolean(existing?.enabled);
    const status = derivePortalStatus({
      definition,
      externalAgencyId,
      hasCredential,
      enabled,
      lastError: null,
    });

    const payload = {
      organization_id: organizationId,
      portal_key: definition.key,
      external_agency_id: externalAgencyId,
      endpoint_url: data.endpointUrl ?? null,
      enabled: status === "not_configured" ? false : enabled,
      status,
      last_error: null,
      last_error_at: null,
      updated_by: context.userId,
      ...(credential
        ? { credential_secret: credential, credential_prefix: credential.slice(0, 4) }
        : {}),
    };

    const { error } = existing
      ? await admin.from("portal_integrations").update(payload).eq("id", existing.id)
      : await admin
          .from("portal_integrations")
          .insert({ ...payload, created_by: context.userId });
    if (error) throw new Error("Configurarea portalului nu a putut fi salvată.");

    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      action: "portal_integration.saved",
      entity: "portal_integrations",
      // Fără secret în audit: doar cheia portalului și starea rezultată.
      new_values: { portal_key: definition.key, status, enabled: payload.enabled },
    });

    return { status };
  });

export const disconnectPortalIntegration = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ portalKey: z.string().trim().min(2).max(40) }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { error } = await admin
      .from("portal_integrations")
      .update({
        enabled: false,
        status: "not_configured",
        credential_secret: null,
        credential_prefix: null,
        external_agency_id: null,
        last_error: null,
        last_error_at: null,
        updated_by: context.userId,
      })
      .eq("organization_id", organizationId)
      .eq("portal_key", data.portalKey);
    if (error) throw new Error("Deconectarea portalului a eșuat.");

    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      action: "portal_integration.disconnected",
      entity: "portal_integrations",
      new_values: { portal_key: data.portalKey },
    });
    return { ok: true };
  });

/**
 * Verificare locală (dry-run): confirmă configurarea și pregătește cererea de
 * notificare fără să contacteze portalul. Nu se face niciun request extern.
 */
export const testPortalIntegration = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ portalKey: z.string().trim().min(2).max(40) }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ready: boolean; reason: string; safeUrl: string | null }> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const [{ data: row }, { data: sample }] = await Promise.all([
      admin
        .from("portal_integrations")
        .select("external_agency_id, credential_secret, endpoint_url, enabled")
        .eq("organization_id", organizationId)
        .eq("portal_key", data.portalKey)
        .maybeSingle(),
      admin
        .from("properties")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("publish_status", "published")
        .is("deleted_at", null)
        .limit(1),
    ]);

    if (data.portalKey !== "clickimob") {
      return { ready: false, reason: "unsupported_portal", safeUrl: null };
    }
    const { notifyPropertyChanged } = await import("@/lib/portals/clickimob");
    const result = await notifyPropertyChanged({
      config: {
        agencyId: row?.external_agency_id ?? "",
        webhookToken: row?.credential_secret ?? "",
        endpointUrl: row?.endpoint_url ?? undefined,
      },
      propertyId: sample?.[0]?.id ?? "00000000-0000-4000-8000-000000000000",
      enabled: Boolean(row?.enabled),
      // Fără cereri reale către portal până la acceptarea Habitoo ca provider.
      allowLiveRequests: false,
    });
    return {
      ready: result.sent === false && result.reason === "dry_run",
      reason: result.sent ? "sent" : result.reason,
      safeUrl: result.sent ? result.safeUrl : result.safeUrl,
    };
  });
