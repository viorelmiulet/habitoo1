/**
 * Server functions specifice La Cheie: mediu (test/producție), catalog,
 * testele CRUD cerute de portal înainte de activarea producției și jurnalul.
 *
 * Reguli: configurarea integrărilor rămâne exclusiv la Superadmin, cheia API nu
 * este niciodată returnată către frontend, iar în producție nu pleacă nicio
 * cerere până la confirmarea activării de către La Cheie.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { getPortalDefinition } from "@/lib/portals/registry";
import {
  LACHEIE_PORTAL_KEY,
  activeBaseUrl,
  crudTestsPassed,
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
    .update({ settings, updated_by: actorId })
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
  testBaseUrlSet: boolean;
  productionBaseUrlSet: boolean;
  productionActive: boolean;
  productionConfirmedAt: string | null;
  offersPath: string;
  crudTests: { create: string | null; update: string | null; withdraw: string | null };
  crudTestsPassed: boolean;
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
      testBaseUrlSet: Boolean(settings.testBaseUrl),
      productionBaseUrlSet: Boolean(settings.productionBaseUrl),
      productionActive: settings.productionActive,
      productionConfirmedAt: settings.productionConfirmedAt,
      offersPath: settings.offersPath,
      crudTests: settings.crudTests,
      crudTestsPassed: crudTestsPassed(settings.crudTests),
      readiness: laCheieReadiness({
        hasApiKey,
        settings,
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

export const setLaCheieEnvironment = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        environment: z.enum(["test", "production"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireSuperadminOrg(auth, data.organizationId);
    const { settings } = await buildLaCheieContext(organizationId);
    const current = readLaCheieSettings(settings);

    if (data.environment === "production") {
      if (!current.productionActive) {
        throw new Error(
          "Producția La Cheie nu este confirmată pentru această agenție. Bifează activarea după confirmarea primită de la La Cheie.",
        );
      }
      if (!current.productionBaseUrl) {
        throw new Error("Completează adresa API de producție înainte de a comuta mediul.");
      }
      if (!crudTestsPassed(current.crudTests)) {
        throw new Error(
          "Testele de creare, actualizare și retragere din mediul de test nu sunt trecute.",
        );
      }
    }

    await mergeSettings(organizationId, { lacheie_environment: data.environment }, auth.userId);
    await logLaCheie({
      organizationId,
      operation: "environment",
      success: true,
      actorId: auth.userId,
      environment: data.environment,
    });
    return { environment: data.environment };
  });

/**
 * Confirmarea manuală a activării producției. Documentația La Cheie nu descrie
 * niciun endpoint de auto-activare, deci nu inventăm unul: bifa se pune de
 * Superadmin după confirmarea primită de la portal.
 */
export const confirmLaCheieProduction = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireSuperadminOrg(auth, data.organizationId);
    const patch: Record<string, unknown> = {
      lacheie_production_active: data.active,
      lacheie_production_confirmed_at: data.active ? new Date().toISOString() : null,
    };
    // Dezactivarea producției readuce imediat integrarea în mediul de test.
    if (!data.active) patch["lacheie_environment"] = "test";
    await mergeSettings(organizationId, patch, auth.userId);
    await logLaCheie({
      organizationId,
      operation: "production_activation",
      success: true,
      actorId: auth.userId,
      environment: data.active ? "production" : "test",
    });
    return { productionActive: data.active };
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
    if (!credential || !base) {
      throw new Error("Salvează cheia API și adresa mediului activ înainte de sincronizare.");
    }
    if (settings.environment === "production" && !settings.productionActive) {
      throw new Error("Producția La Cheie nu este activată pentru această agenție.");
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

/**
 * Testele CRUD cerute de La Cheie înainte de activarea producției: creare,
 * actualizare și retragere, rulate pe o ofertă reală, EXCLUSIV în mediul de test.
 */
export const runLaCheieCrudCheck = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid(), propertyId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireSuperadminOrg(auth, data.organizationId);
    const { ctx } = await buildLaCheieContext(organizationId);
    const settings = readLaCheieSettings(ctx.settings as Record<string, unknown>);
    if (settings.environment !== "test") {
      throw new Error("Testele CRUD se rulează numai în mediul de test.");
    }

    const { getPortalAdapter } = await import("@/lib/portals/adapters/index.server");
    const adapter = getPortalAdapter(LACHEIE_PORTAL_KEY);
    if (!adapter) throw new Error("Adaptorul La Cheie nu este disponibil.");

    const ref = { propertyId: data.propertyId, externalId: null };
    const steps: { operation: "create" | "update" | "withdraw"; ok: boolean; message: string }[] =
      [];
    const passed: Record<string, string> = {};

    for (const operation of ["create", "update", "withdraw"] as const) {
      const result =
        operation === "create"
          ? await adapter.publishListing(ctx, ref)
          : operation === "update"
            ? await adapter.updateListing(ctx, ref)
            : await adapter.withdrawListing(ctx, ref);
      const ok = result.ok;
      const message = ok ? (result.data.message ?? "OK") : result.message;
      steps.push({ operation, ok, message });
      await logLaCheie({
        organizationId,
        operation: `crud_test_${operation}`,
        success: ok,
        errorMessage: ok ? null : message,
        propertyId: data.propertyId,
        actorId: auth.userId,
        environment: "test",
        externalId: ok ? result.data.externalId : null,
      });
      if (!ok) break;
      passed[operation] = new Date().toISOString();
    }

    if (Object.keys(passed).length) {
      await mergeSettings(
        organizationId,
        { lacheie_tests: { ...settings.crudTests, ...passed } },
        auth.userId,
      );
    }

    return { steps, allPassed: steps.length === 3 && steps.every((step) => step.ok) };
  });
