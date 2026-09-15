/**
 * Server functions specifice La Cheie: testarea conexiunii de producție,
 * catalogul și jurnalul operațiilor.
 *
 * La Cheie are un singur mediu real (production), cu adresa API fixată
 * server-side. Configurarea rămâne exclusiv la Superadmin, iar cheia API nu
 * este niciodată returnată către frontend. Scrierile reale (creare,
 * actualizare, retragere) se fac doar prin fluxul normal de publicare din
 * pagina proprietății, niciodată automat la încărcarea UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { getPortalDefinition } from "@/lib/portals/registry";
import {
  LACHEIE_ENVIRONMENT,
  LACHEIE_PORTAL_KEY,
  LACHEIE_PRODUCTION_BASE_URL,
  activeBaseUrl,
  laCheieReadiness,
  readLaCheieSettings,
  type LaCheieEnvironment,
  type LaCheieReadiness,
} from "@/lib/portals/lacheie/config";

type AuthContext = {
  supabase: {
    rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: unknown }>;
  };
  userId: string;
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requireSuperadminOrg(context: AuthContext, organizationId: string): Promise<string> {
  const { data } = await context.supabase.rpc("is_superadmin");
  if (data !== true) {
    throw new Error("Acces refuzat: integrarea La Cheie se gestionează doar de Superadmin.");
  }
  const admin = await loadAdmin();
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) throw new Error("Agenția nu a fost găsită.");
  return org.id;
}

async function connectionRow(organizationId: string) {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("portal_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portal", LACHEIE_PORTAL_KEY)
    .maybeSingle();
  return data;
}

async function buildLaCheieContext(organizationId: string) {
  const definition = getPortalDefinition(LACHEIE_PORTAL_KEY);
  if (!definition) throw new Error("Portalul La Cheie nu este definit.");
  const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
  const row = await connectionRow(organizationId);
  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  return {
    row,
    settings,
    ctx: {
      organizationId,
      definition,
      direction: (row?.direction ?? "habitoo_to_portal") as never,
      authenticationMode: (row?.authentication_mode ?? "portal_api_key") as never,
      externalAccountId: row?.external_account_id ?? null,
      portalCredential: row ? decryptPortalCredential(row.portal_credentials_encrypted) : null,
      settings,
      allowLiveRequests: settings["allow_live"] === true,
    },
  };
}

async function mergeSettings(
  organizationId: string,
  patch: Record<string, unknown>,
  actorId: string | null,
): Promise<void> {
  const admin = await loadAdmin();
  const row = await connectionRow(organizationId);
  if (!row) throw new Error("Conexiunea La Cheie nu este creată. Salvează mai întâi cheia API.");
  const settings = { ...((row.settings ?? {}) as Record<string, unknown>), ...patch };
  await admin
    .from("portal_connections")
    .update({ settings: settings as never, updated_by: actorId })
    .eq("id", row.id);
}

async function logLaCheie(input: {
  organizationId: string;
  operation: string;
  success: boolean;
  errorMessage?: string | null;
  errorCode?: string | null;
  propertyId?: string | null;
  actorId: string | null;
  environment: LaCheieEnvironment;
  externalId?: string | null;
  sourceVersion?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
}) {
  const admin = await loadAdmin();
  await admin.from("portal_operation_logs").insert({
    organization_id: input.organizationId,
    portal: LACHEIE_PORTAL_KEY,
    operation: input.operation,
    success: input.success,
    error_code: input.errorCode ?? null,
    // Doar mesaje pregătite pentru utilizator: fără cheie API, fără payload brut.
    error_message: input.errorMessage ?? null,
    property_id: input.propertyId ?? null,
    actor_id: input.actorId,
    environment: input.environment,
    external_id: input.externalId ?? null,
    source_version: input.sourceVersion ?? null,
    http_status: input.httpStatus ?? null,
    duration_ms: input.durationMs ?? null,
  });
}

export type LaCheieState = {
  hasApiKey: boolean;
  environment: LaCheieEnvironment;
  /** Adresa API documentată, fixată server-side (production-only). */
  baseUrl: string;
  offersPath: string;
  readiness: LaCheieReadiness;
  catalog: {
    fetchedAt: string | null;
    optionGroups: number;
    counties: number;
    cities: number;
    error: string | null;
  };
  lastError: string | null;
  logs: {
    id: string;
    operation: string;
    success: boolean;
    errorMessage: string | null;
    environment: string | null;
    externalId: string | null;
    sourceVersion: string | null;
    httpStatus: number | null;
    durationMs: number | null;
    createdAt: string;
  }[];
  versions: {
    externalId: string;
    environment: string;
    sourceVersion: string;
    acceptedVersion: string | null;
    conflict: boolean;
    lastOperation: string | null;
    lastStatus: string | null;
    updatedAt: string;
  }[];
};

export const getLaCheieState = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<LaCheieState> => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const admin = await loadAdmin();
    const row = await connectionRow(organizationId);
    const settings = readLaCheieSettings((row?.settings ?? {}) as Record<string, unknown>);
    const hasApiKey = Boolean(row?.portal_credentials_encrypted);

    const { readLaCheieCatalog } = await import("@/lib/portals/lacheie/catalog.server");
    const catalog = await readLaCheieCatalog(admin, {
      organizationId,
      environment: settings.environment,
    });

    const [{ data: logs }, { data: versions }] = await Promise.all([
      admin
        .from("portal_operation_logs")
        .select(
          "id, operation, success, error_message, environment, external_id, source_version, http_status, duration_ms, created_at",
        )
        .eq("organization_id", organizationId)
        .eq("portal", LACHEIE_PORTAL_KEY)
        .order("created_at", { ascending: false })
        .limit(25),
      admin
        .from("portal_listing_versions")
        .select(
          "external_id, environment, source_version, accepted_version, conflict, last_operation, last_status, updated_at",
        )
        .eq("organization_id", organizationId)
        .eq("portal", LACHEIE_PORTAL_KEY)
        .order("updated_at", { ascending: false })
        .limit(25),
    ]);

    return {
      hasApiKey,
      environment: settings.environment,
      baseUrl: LACHEIE_PRODUCTION_BASE_URL,
      offersPath: settings.offersPath,
      readiness: laCheieReadiness({
        hasApiKey,
        lastError: row?.last_sync_error ?? null,
      }),
      catalog: {
        fetchedAt: catalog?.fetchedAt ?? settings.catalogFetchedAt,
        optionGroups: catalog ? Object.keys(catalog.options).length : 0,
        counties: catalog?.counties.length ?? 0,
        cities: catalog
          ? Object.values(catalog.cities).reduce((total, list) => total + list.length, 0)
          : 0,
        error: settings.catalogError,
      },
      lastError: row?.last_sync_error ?? null,
      logs: (logs ?? []).map((log) => ({
        id: log.id,
        operation: log.operation,
        success: log.success,
        errorMessage: log.error_message,
        environment: log.environment,
        externalId: log.external_id,
        sourceVersion: log.source_version,
        httpStatus: log.http_status,
        durationMs: log.duration_ms,
        createdAt: log.created_at,
      })),
      versions: (versions ?? []).map((version) => ({
        externalId: version.external_id,
        environment: version.environment,
        sourceVersion: version.source_version,
        acceptedVersion: version.accepted_version,
        conflict: version.conflict,
        lastOperation: version.last_operation,
        lastStatus: version.last_status,
        updatedAt: version.updated_at,
      })),
    };
  });

/**
 * Testarea conexiunii de producție: GET `/account` cu cheia API a agenției.
 * Read-only — nu creează, nu modifică și nu retrage niciun anunț.
 */
export const testLaCheieConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireSuperadminOrg(auth, data.organizationId);
    const { row, ctx } = await buildLaCheieContext(organizationId);

    const { portalRateLimited } = await import("@/lib/portals/rate-limit.server");
    if (portalRateLimited("test", `${organizationId}|${LACHEIE_PORTAL_KEY}`)) {
      throw new Error("Prea multe testări consecutive. Reia în câteva momente.");
    }

    const { getPortalAdapter } = await import("@/lib/portals/adapters/index.server");
    const adapter = getPortalAdapter(LACHEIE_PORTAL_KEY);
    if (!adapter) throw new Error("Adaptorul La Cheie nu este disponibil.");

    const started = Date.now();
    const result = await adapter.testConnection(ctx);
    const duration = Date.now() - started;
    const ok = result.ok && result.data.live;
    const message = result.ok ? result.data.detail : result.message;

    const admin = await loadAdmin();
    if (row) {
      await admin
        .from("portal_connections")
        .update({
          status: ok ? "connected" : "error",
          last_sync_status: ok ? "ok" : "error",
          last_sync_error: ok ? null : message,
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }

    await logLaCheie({
      organizationId,
      operation: "test_connection",
      success: ok,
      errorMessage: ok ? null : message,
      actorId: auth.userId,
      environment: LACHEIE_ENVIRONMENT,
      durationMs: duration,
    });

    if (!ok) throw new Error(message ?? "La Cheie nu a confirmat conexiunea.");
    return { detail: message };
  });

export const refreshLaCheieCatalog = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireSuperadminOrg(auth, data.organizationId);
    const { ctx } = await buildLaCheieContext(organizationId);
    const settings = readLaCheieSettings(ctx.settings as Record<string, unknown>);
    const base = activeBaseUrl(settings);
    const credential = (ctx.portalCredential ?? "").trim();
    if (!credential) {
      throw new Error("Salvează cheia API La Cheie înainte de sincronizarea catalogului.");
    }


    const admin = await loadAdmin();
    const { refreshLaCheieCatalog: refresh } = await import(
      "@/lib/portals/lacheie/catalog.server"
    );
    const result = await refresh(
      admin,
      {
        baseUrl: base,
        apiKey: credential,
        environment: settings.environment,
        connectionKey: `${organizationId}:${settings.environment}`,
      },
      { organizationId, environment: settings.environment, actorId: auth.userId },
    );

    await mergeSettings(
      organizationId,
      result.ok
        ? {
            lacheie_catalog_fetched_at: result.catalog.fetchedAt,
            lacheie_catalog_error: null,
          }
        : { lacheie_catalog_error: result.message },
      auth.userId,
    );
    await logLaCheie({
      organizationId,
      operation: "catalog",
      success: result.ok,
      errorMessage: result.ok ? null : result.message,
      actorId: auth.userId,
      environment: settings.environment,
      httpStatus: result.ok ? 200 : result.status,
    });

    if (!result.ok) throw new Error(result.message);
    return { fetchedAt: result.catalog.fetchedAt, counts: result.counts };
  });

