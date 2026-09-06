/**
 * Server functions pentru modulul de portaluri imobiliare.
 *
 * Reguli respectate peste tot în acest fișier:
 *  - doar administratorul agenției poate gestiona portaluri;
 *  - agenția vine din sesiune, niciodată din input;
 *  - credențialele portalului nu sunt niciodată returnate către frontend;
 *  - cheile emise de Habitoo se afișează o singură dată, la generare;
 *  - fiecare operație este jurnalizată sanitizat în `portal_operation_logs`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PORTALS,
  derivePortalConnectionStatus,
  getPortalDefinition,
  type PortalConnectionStatus,
  type PortalDefinition,
} from "@/lib/portals/registry";
import { PORTAL_ERROR_MESSAGE } from "@/lib/portals/errors";

export type PortalHubItem = {
  portal: PortalDefinition;
  connection: {
    exists: boolean;
    status: PortalConnectionStatus;
    direction: string;
    authenticationMode: string;
    externalAccountId: string | null;
    hasPortalCredential: boolean;
    endpointUrl: string | null;
    allowLiveRequests: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  };
  keys: {
    id: string;
    label: string;
    keyPrefix: string;
    scopes: string[];
    status: string;
    lastUsedAt: string | null;
    requestCount: number;
    createdAt: string;
  }[];
  listings: { published: number; failed: number; pending: number };
  eligibleProperties: number;
  feedUrl: string;
  /** Diagnoză reală a feedului pe care îl citește portalul. */
  feed: { ok: boolean; apiVersion: string | null; properties: number | null; agents: number | null };
};

export type PortalLogItem = {
  id: string;
  portal: string;
  operation: string;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  propertyId: string | null;
  createdAt: string;
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

async function logOperation(input: {
  organizationId: string;
  portal: string;
  operation: string;
  success: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  propertyId?: string | null;
  actorId?: string | null;
}) {
  const admin = await loadAdmin();
  await admin.from("portal_operation_logs").insert({
    organization_id: input.organizationId,
    portal: input.portal,
    operation: input.operation,
    success: input.success,
    error_code: input.errorCode ?? null,
    // Doar mesaje pregătite pentru utilizator; niciun secret, niciun payload brut.
    error_message: input.errorMessage ?? null,
    property_id: input.propertyId ?? null,
    actor_id: input.actorId ?? null,
  });
}

async function feedUrlForOrg(): Promise<string> {
  const { CRM_URL } = await import("@/lib/host");
  return `${CRM_URL}/api/public/portal/v1/properties`;
}

/** Context complet pentru adaptor, cu credențialul decriptat. */
async function buildContext(organizationId: string, definition: PortalDefinition) {
  const admin = await loadAdmin();
  const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
  const { data: row } = await admin
    .from("portal_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portal", definition.id)
    .maybeSingle();

  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  return {
    row,
    ctx: {
      organizationId,
      definition,
      direction: (row?.direction ?? definition.directions[0] ?? "habitoo_to_portal") as never,
      authenticationMode: (row?.authentication_mode ?? definition.authentication[0] ?? "none") as never,
      externalAccountId: row?.external_account_id ?? null,
      portalCredential: row ? decryptPortalCredential(row.portal_credentials_encrypted) : null,
      settings,
      allowLiveRequests: settings["allow_live"] === true,
    },
  };
}

export const getPortalHub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalHubItem[]> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const feedUrl = await feedUrlForOrg();

    const { inspectFeedAgents, inspectFeedProperties } = await import("@/lib/portals/feed-inspect.server");
    const [connections, keys, listings, eligible, feedProperties, feedAgents] = await Promise.all([
      admin.from("portal_connections").select("*").eq("organization_id", organizationId),
      admin
        .from("portal_api_keys")
        .select("id, portal, label, key_prefix, scopes, status, last_used_at, request_count, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      admin.from("portal_listings").select("portal, status").eq("organization_id", organizationId),
      admin
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("publish_status", "published")
        .is("deleted_at", null)
        .in("status", ["active", "reserved", "negotiation"]),
      inspectFeedProperties(organizationId),
      inspectFeedAgents(organizationId),
    ]);

    return PORTALS.map((portal) => {
      const row = (connections.data ?? []).find((c) => c.portal === portal.id) ?? null;
      const settings = (row?.settings ?? {}) as Record<string, unknown>;
      const portalKeys = (keys.data ?? []).filter((k) => k.portal === portal.id);
      const portalListings = (listings.data ?? []).filter((l) => l.portal === portal.id);

      return {
        portal,
        connection: {
          exists: Boolean(row),
          status: derivePortalConnectionStatus({
            definition: portal,
            externalAccountId: row?.external_account_id ?? null,
            hasPortalCredential: Boolean(row?.portal_credentials_encrypted),
            hasHabitooKey: portalKeys.some((k) => k.status === "active"),
            lastError: row?.last_sync_error ?? null,
            testedOk: row?.status === "connected",
          }),
          direction: row?.direction ?? portal.directions[0] ?? "habitoo_to_portal",
          authenticationMode: row?.authentication_mode ?? portal.authentication[0] ?? "none",
          externalAccountId: row?.external_account_id ?? null,
          hasPortalCredential: Boolean(row?.portal_credentials_encrypted),
          endpointUrl: typeof settings["endpoint_url"] === "string" ? String(settings["endpoint_url"]) : null,
          allowLiveRequests: settings["allow_live"] === true,
          lastSyncAt: row?.last_sync_at ?? null,
          lastSyncStatus: row?.last_sync_status ?? null,
          lastSyncError: row?.last_sync_error ?? null,
        },
        keys: portalKeys.map((k) => ({
          id: k.id,
          label: k.label,
          keyPrefix: k.key_prefix,
          scopes: k.scopes ?? [],
          status: k.status,
          lastUsedAt: k.last_used_at,
          requestCount: Number(k.request_count ?? 0),
          createdAt: k.created_at,
        })),
        listings: {
          published: portalListings.filter((l) => l.status === "published" || l.status === "updated").length,
          failed: portalListings.filter((l) => l.status === "error").length,
          pending: portalListings.filter((l) => l.status === "pending").length,
        },
        eligibleProperties: eligible.count ?? 0,
        feedUrl,
        feed: {
          ok: feedProperties.status === 200 && feedAgents.status === 200,
          apiVersion: feedProperties.apiVersion,
          properties: feedProperties.total,
          agents: feedAgents.total,
        },
      };
    });
  });

const saveSchema = z.object({
  portalId: z.string().min(1).max(40),
  externalAccountId: z.string().trim().max(200).optional(),
  credential: z.string().trim().min(1).max(500).optional(),
  endpointUrl: z.string().trim().max(300).optional(),
  allowLiveRequests: z.boolean().optional(),
});

export const savePortalConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");
    if (definition.status !== "available") throw new Error("Integrarea cu acest portal nu este încă disponibilă.");

    const admin = await loadAdmin();
    const { encryptPortalCredential } = await import("@/lib/portals/crypto.server");
    const { row } = await buildContext(organizationId, definition);
    const settings = { ...((row?.settings ?? {}) as Record<string, unknown>) };
    if (data.endpointUrl !== undefined) {
      if (data.endpointUrl) settings["endpoint_url"] = data.endpointUrl;
      else delete settings["endpoint_url"];
    }
    if (data.allowLiveRequests !== undefined) settings["allow_live"] = data.allowLiveRequests;

    const patch: Record<string, unknown> = {
      organization_id: organizationId,
      portal: definition.id,
      direction: row?.direction ?? definition.directions[0] ?? "habitoo_to_portal",
      authentication_mode: row?.authentication_mode ?? definition.authentication[0] ?? "none",
      settings,
      updated_by: context.userId,
    };
    if (data.externalAccountId !== undefined) {
      patch["external_account_id"] = data.externalAccountId || null;
    }
    if (data.credential) {
      patch["portal_credentials_encrypted"] = encryptPortalCredential(data.credential);
    }
    // Orice modificare de configurare invalidează un test reușit anterior.
    patch["status"] = "ready";
    patch["last_sync_error"] = null;

    if (row) {
      const { error } = await admin
        .from("portal_connections")
        .update(patch as never)
        .eq("id", row.id);
      if (error) throw new Error("Configurarea nu a putut fi salvată.");
    } else {
      const { error } = await admin
        .from("portal_connections")
        .insert({ ...patch, created_by: context.userId } as never);
      if (error) throw new Error("Configurarea nu a putut fi salvată.");
    }

    await logOperation({
      organizationId,
      portal: definition.id,
      operation: "save_connection",
      success: true,
      actorId: context.userId,
    });
    return { ok: true as const };
  });

export const disconnectPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();

    await admin
      .from("portal_connections")
      .update({
        status: "disconnected",
        portal_credentials_encrypted: null,
        external_account_id: null,
        last_sync_error: null,
        updated_by: context.userId,
      })
      .eq("organization_id", organizationId)
      .eq("portal", data.portalId);

    await admin
      .from("portal_api_keys")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: context.userId })
      .eq("organization_id", organizationId)
      .eq("portal", data.portalId)
      .eq("status", "active");

    await logOperation({
      organizationId,
      portal: data.portalId,
      operation: "disconnect",
      success: true,
      actorId: context.userId,
    });
    return { ok: true as const };
  });

export const testPortalConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    const { portalRateLimited } = await import("@/lib/portals/rate-limit.server");
    if (portalRateLimited("test", `${organizationId}|${data.portalId}`)) {
      return { ok: false as const, code: "RATE_LIMIT", message: PORTAL_ERROR_MESSAGE.RATE_LIMIT };
    }

    const { getPortalAdapter } = await import("@/lib/portals/adapters/index.server");
    const adapter = getPortalAdapter(definition.id);
    if (!adapter) {
      return { ok: false as const, code: "NOT_SUPPORTED", message: PORTAL_ERROR_MESSAGE.NOT_SUPPORTED };
    }

    const { row, ctx } = await buildContext(organizationId, definition);
    const result = await adapter.testConnection(ctx);
    const admin = await loadAdmin();
    if (row) {
      await admin
        .from("portal_connections")
        .update({
          status: result.ok ? "connected" : "error",
          last_sync_status: result.ok ? "ok" : "error",
          last_sync_error: result.ok ? null : result.message,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }

    await logOperation({
      organizationId,
      portal: definition.id,
      operation: "test_connection",
      success: result.ok,
      errorCode: result.ok ? null : result.code,
      errorMessage: result.ok ? null : result.message,
      actorId: context.userId,
    });

    return result.ok
      ? {
          ok: true as const,
          live: result.data.live,
          detail: result.data.detail,
          feed: result.data.feed ?? null,
        }
      : { ok: false as const, code: result.code, message: result.message };
  });

export const issuePortalApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        portalId: z.string().min(1).max(40),
        label: z.string().trim().min(2).max(80),
        scopes: z.array(z.enum(["feed:read", "agents:read", "leads:write"])).min(1).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    const { portalRateLimited } = await import("@/lib/portals/rate-limit.server");
    if (portalRateLimited("key", organizationId)) {
      throw new Error(PORTAL_ERROR_MESSAGE.RATE_LIMIT);
    }

    const { generatePortalKey } = await import("@/lib/portals/keys.server");
    const generated = generatePortalKey(definition.id);
    const admin = await loadAdmin();
    const { error } = await admin.from("portal_api_keys").insert({
      organization_id: organizationId,
      portal: definition.id,
      label: data.label,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes: data.scopes ?? ["feed:read", "agents:read"],
      created_by: context.userId,
    });
    if (error) throw new Error("Cheia nu a putut fi creată.");

    await logOperation({
      organizationId,
      portal: definition.id,
      operation: "issue_api_key",
      success: true,
      actorId: context.userId,
    });

    // Singura dată când cheia în clar părăsește serverul.
    return { ok: true as const, key: generated.key, prefix: generated.prefix };
  });

export const revokePortalApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ keyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { data: row } = await admin
      .from("portal_api_keys")
      .select("id, portal")
      .eq("id", data.keyId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!row) throw new Error("Cheia nu a fost găsită.");

    await admin
      .from("portal_api_keys")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: context.userId })
      .eq("id", row.id);

    await logOperation({
      organizationId,
      portal: row.portal,
      operation: "revoke_api_key",
      success: true,
      actorId: context.userId,
    });
    return { ok: true as const };
  });

/** Operațiile pe o ofertă: publicare, actualizare, retragere. */
const listingSchema = z.object({
  portalId: z.string().min(1).max(40),
  propertyId: z.string().uuid(),
  action: z.enum(["publish", "update", "withdraw"]),
});

export const runPortalListingAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    const admin = await loadAdmin();
    const { data: property } = await admin
      .from("properties")
      .select("id, publish_status, status, deleted_at")
      .eq("id", data.propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!property) throw new Error("Proprietatea nu a fost găsită.");

    const { isPropertyFeedEligible } = await import("@/lib/site-feed/mapper");
    if (data.action !== "withdraw" && !isPropertyFeedEligible(property as never)) {
      return {
        ok: false as const,
        code: "VALIDATION_ERROR",
        message: "Oferta nu este publicabilă: verifică statusul și publicarea pe site.",
      };
    }

    const { portalRateLimited } = await import("@/lib/portals/rate-limit.server");
    if (portalRateLimited(data.action, `${organizationId}|${data.portalId}`)) {
      return { ok: false as const, code: "RATE_LIMIT", message: PORTAL_ERROR_MESSAGE.RATE_LIMIT };
    }

    const { getPortalAdapter } = await import("@/lib/portals/adapters/index.server");
    const adapter = getPortalAdapter(definition.id);
    if (!adapter) {
      return { ok: false as const, code: "NOT_SUPPORTED", message: PORTAL_ERROR_MESSAGE.NOT_SUPPORTED };
    }

    const { data: listing } = await admin
      .from("portal_listings")
      .select("id, external_id")
      .eq("organization_id", organizationId)
      .eq("portal", definition.id)
      .eq("property_id", data.propertyId)
      .maybeSingle();

    const { ctx } = await buildContext(organizationId, definition);
    const ref = { propertyId: data.propertyId, externalId: listing?.external_id ?? null };
    const result =
      data.action === "publish"
        ? await adapter.publishListing(ctx, ref)
        : data.action === "update"
          ? await adapter.updateListing(ctx, ref)
          : await adapter.withdrawListing(ctx, ref);

    const now = new Date().toISOString();
    const status = !result.ok
      ? "error"
      : data.action === "withdraw"
        ? "withdrawn"
        : data.action === "update"
          ? "updated"
          : "published";
    const patch: Record<string, unknown> = {
      organization_id: organizationId,
      portal: definition.id,
      property_id: data.propertyId,
      status,
      last_sync_at: now,
      last_error: result.ok ? null : result.message,
      ...(result.ok && result.data.externalId ? { external_id: result.data.externalId } : {}),
      ...(result.ok && data.action === "publish" ? { published_at: now } : {}),
      updated_by: context.userId,
    };
    if (listing) await admin.from("portal_listings").update(patch as never).eq("id", listing.id);
    else await admin.from("portal_listings").insert({ ...patch, created_by: context.userId } as never);

    await logOperation({
      organizationId,
      portal: definition.id,
      operation: data.action,
      success: result.ok,
      errorCode: result.ok ? null : result.code,
      errorMessage: result.ok ? null : result.message,
      propertyId: data.propertyId,
      actorId: context.userId,
    });

    return result.ok
      ? {
          ok: true as const,
          live: result.data.live,
          detail: result.data.detail,
          status,
          externalId: result.data.externalId,
          feedVisible: result.data.feedVisible ?? null,
          processed: result.data.processed ?? null,
          message: result.data.message ?? null,
        }
      : { ok: false as const, code: result.code, message: result.message };
  });

export const getPropertyPortalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const [{ data: listings }, { data: connections }] = await Promise.all([
      admin
        .from("portal_listings")
        .select("portal, status, external_id, published_at, last_sync_at, last_error")
        .eq("organization_id", organizationId)
        .eq("property_id", data.propertyId),
      admin
        .from("portal_connections")
        .select("portal, status")
        .eq("organization_id", organizationId),
    ]);

    const { getPortalAdapter } = await import("@/lib/portals/adapters/index.server");
    const available = PORTALS.filter((p) => p.status === "available");

    return await Promise.all(
      available.map(async (portal) => {
        const listing = (listings ?? []).find((l) => l.portal === portal.id) ?? null;
        const connection = (connections ?? []).find((c) => c.portal === portal.id) ?? null;
        const adapter = getPortalAdapter(portal.id);

        // Statusul REAL: pe lângă ce am salvat noi, ce vede efectiv portalul.
        let diagnostics: {
          feedVisible: boolean;
          externalId: string | null;
          offerUrl: string | null;
          agentName: string | null;
          images: { total: number; resolvable: number; broken: number; primary: boolean };
          notes: string[];
        } | null = null;
        if (adapter?.diagnoseListing) {
          const { ctx } = await buildContext(organizationId, portal);
          const result = await adapter.diagnoseListing(ctx, {
            propertyId: data.propertyId,
            externalId: listing?.external_id ?? null,
          });
          if (result.ok) {
            diagnostics = {
              feedVisible: result.data.feedVisible,
              externalId: result.data.externalId,
              offerUrl: result.data.offerUrl,
              agentName: result.data.agentName,
              images: result.data.images,
              notes: result.data.notes,
            };
          }
        }

        return {
          portalId: portal.id,
          portalName: portal.display_name,
          connected: connection?.status === "connected" || connection?.status === "ready",
          status: listing?.status ?? "not_published",
          externalId: listing?.external_id ?? diagnostics?.externalId ?? null,
          publishedAt: listing?.published_at ?? null,
          lastSyncAt: listing?.last_sync_at ?? null,
          lastError: listing?.last_error ?? null,
          diagnostics,
        };
      }),
    );
  });

export const getPortalLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalLogItem[]> => {
    const organizationId = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { data } = await admin
      .from("portal_operation_logs")
      .select("id, portal, operation, success, error_code, error_message, property_id, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    return (data ?? []).map((row) => ({
      id: row.id,
      portal: row.portal,
      operation: row.operation,
      success: row.success,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      propertyId: row.property_id,
      createdAt: row.created_at,
    }));
  });
