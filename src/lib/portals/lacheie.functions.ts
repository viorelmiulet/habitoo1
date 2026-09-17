/**
 * Server functions specifice La Cheie: activarea agenției, testarea conexiunii,
 * catalogul și jurnalul operațiilor.
 *
 * Model real de furnizor CRM: o singură cheie `lc_crm_…` păstrată exclusiv în
 * secretele de server, iar fiecare agenție are `external_id`, status și
 * versiune proprii. Cheia nu este niciodată returnată către frontend, logată
 * sau salvată în audit. Scrierile pe oferte (creare, actualizare, retragere) se
 * fac doar prin fluxul normal de publicare din pagina proprietății, niciodată
 * automat la încărcarea UI.
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
  isLegacyLaCheieTestEnvironmentError,
  laCheieReadiness,
  normalizeLaCheiePortalSettings,
  readLaCheieSettings,
  type LaCheieEnvironment,
  type LaCheieReadiness,
} from "@/lib/portals/lacheie/config";
import {
  LACHEIE_AGENCY_FIELD_LABEL,
  LACHEIE_AGENCY_STATUS_LABEL,
  buildLaCheieAgencyPayload,
  canActivateLaCheieAgency,
  classifyLaCheieAgencyPut,
  isLaCheieAgencyReactivation,
  laCheieAgencyBodyHash,
  laCheieAgencyExternalId,
  laCheieAgencyPendingCleared,
  laCheieAgencyPendingPatch,
  laCheieAgencyStatusAfterDelete,
  nextLaCheieAgencyVersion,
  planLaCheieAgencyOperation,
  readLaCheieAgencyPending,
  readLaCheieAgencyState,
  type LaCheieAgencyStatus,
} from "@/lib/portals/lacheie/agency";

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

async function existingOrg(organizationId: string): Promise<string> {
  const admin = await loadAdmin();
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) throw new Error("Agenția nu a fost găsită.");
  return org.id;
}

/**
 * Administrarea integrării (jurnal, versiuni, catalog, testare, dezactivare)
 * rămâne strict la Superadmin.
 */
async function requireSuperadmin(context: AuthContext, organizationId: string): Promise<string> {
  const { data: superadmin } = await context.supabase.rpc("is_superadmin");
  if (superadmin !== true) {
    throw new Error("Acces refuzat: integrarea La Cheie se administrează de Superadmin.");
  }
  return existingOrg(organizationId);
}

/**
 * Activarea (și citirea stării proprii) o poate declanșa Superadminul sau un
 * `agency_admin`. Pentru non-superadmini agenția vine EXCLUSIV din sesiune,
 * niciodată din datele trimise de client.
 */
async function requireLaCheieActivator(
  context: AuthContext,
  requestedOrganizationId?: string | null,
): Promise<string> {
  const admin = await loadAdmin();
  const { data: superadmin } = await context.supabase.rpc("is_superadmin");
  if (superadmin === true) {
    if (!requestedOrganizationId) throw new Error("Selectează agenția.");
    return existingOrg(requestedOrganizationId);
  }

  const { data: role } = await admin
    .from("user_roles")
    .select("organization_id")
    .eq("user_id", context.userId)
    .eq("role", "agency_admin")
    .not("organization_id", "is", null)
    .maybeSingle();
  if (!role?.organization_id) {
    throw new Error(
      "Acces refuzat: activarea La Cheie se solicită de administratorul agenției sau de Superadmin.",
    );
  }
  return existingOrg(role.organization_id);
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

/** Conexiunea există chiar dacă agenția nu deține nicio cheie: cheia e a CRM-ului. */
async function ensureConnectionRow(organizationId: string, actorId: string | null) {
  const existing = await connectionRow(organizationId);
  if (existing) return existing;
  const admin = await loadAdmin();
  const { data } = await admin
    .from("portal_connections")
    .insert({
      organization_id: organizationId,
      portal: LACHEIE_PORTAL_KEY,
      direction: "habitoo_to_portal",
      authentication_mode: "portal_api_key",
      status: "pending",
      settings: {} as never,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .maybeSingle();
  if (!data) throw new Error("Conexiunea La Cheie nu a putut fi creată.");
  return data;
}

async function buildLaCheieContext(organizationId: string) {
  const definition = getPortalDefinition(LACHEIE_PORTAL_KEY);
  if (!definition) throw new Error("Portalul La Cheie nu este definit.");
  const row = await connectionRow(organizationId);
  const settings = normalizeLaCheiePortalSettings(
    (row?.settings ?? {}) as Record<string, unknown>,
  );
  return {
    row,
    settings,
    ctx: {
      organizationId,
      definition,
      direction: (row?.direction ?? "habitoo_to_portal") as never,
      authenticationMode: (row?.authentication_mode ?? "portal_api_key") as never,
      externalAccountId: row?.external_account_id ?? null,
      // Cheia de furnizor este citită server-side din secret, nu din conexiune.
      portalCredential: null,
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
  const row = await ensureConnectionRow(organizationId, actorId);
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
  requestId?: string | null;
  portalResponse?: unknown;
}) {
  const admin = await loadAdmin();
  await admin.from("portal_operation_logs").insert({
    organization_id: input.organizationId,
    portal: LACHEIE_PORTAL_KEY,
    operation: input.operation,
    success: input.success,
    error_code: input.errorCode ?? null,
    // Doar mesaje pregătite pentru utilizator: fără cheie de furnizor, fără antete.
    error_message: input.errorMessage ?? null,
    property_id: input.propertyId ?? null,
    actor_id: input.actorId,
    environment: input.environment,
    external_id: input.externalId ?? null,
    source_version: input.sourceVersion ?? null,
    http_status: input.httpStatus ?? null,
    duration_ms: input.durationMs ?? null,
    portal_response:
      input.portalResponse === undefined && !input.requestId
        ? null
        : ({
            ...(input.requestId ? { request_id: input.requestId } : {}),
            ...(input.portalResponse === undefined ? {} : { body: input.portalResponse }),
          } as never),
  });
}

/* ------------------------------ stare pentru UI ---------------------------- */

export type LaCheieAgencyView = {
  externalId: string | null;
  status: LaCheieAgencyStatus;
  statusLabel: string;
  version: string | null;
  acceptedVersion: string | null;
  syncedAt: string | null;
  error: string | null;
  /** Câmpuri reale lipsă în Habitoo, necesare la înregistrare. */
  missingFields: string[];
  canActivate: boolean;
};

export type LaCheieState = {
  /** Cheia de furnizor CRM este configurată pe server (valoarea nu se expune). */
  hasProviderKey: boolean;
  environment: LaCheieEnvironment;
  /** Adresa API documentată, fixată server-side (production-only). */
  baseUrl: string;
  propertiesPath: string;
  readiness: LaCheieReadiness;
  agency: LaCheieAgencyView;
  /** Cine a cerut activarea și când. */
  activationRequest: LaCheieActivationRequest | null;

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

/**
 * Payload-ul de agenție construit din date REALE: numele/telefonul/adresa
 * agenției din Habitoo și emailul VERIFICAT al unui `agency_admin`.
 */
async function buildAgencyRegistration(organizationId: string, actorUserId: string | null) {
  const admin = await loadAdmin();
  const { resolveLaCheieAdminEmail } = await import("@/lib/portals/lacheie/agency.server");
  const [{ data: org }, adminEmail] = await Promise.all([
    admin
      .from("organizations")
      .select("name, legal_name, phone, material_phone, material_address")
      .eq("id", organizationId)
      .maybeSingle(),
    resolveLaCheieAdminEmail(admin as never, { organizationId, actorUserId }),
  ]);
  const built = buildLaCheieAgencyPayload({
    name: org?.name ?? null,
    legalName: org?.legal_name ?? null,
    adminEmail: adminEmail.ok ? adminEmail.email : null,
    phone: org?.phone ?? null,
    materialPhone: org?.material_phone ?? null,
    // Fără substituire cu orașul: adresa lipsă se raportează ca lipsă.
    address: org?.material_address ?? null,
  });
  const issues = built.ok ? [] : [...built.issues, ...(adminEmail.ok ? [] : [adminEmail.reason])];
  return { built, adminEmail, issues };
}

async function agencyView(
  organizationId: string,
  actorUserId: string | null,
): Promise<LaCheieAgencyView> {
  const row = await connectionRow(organizationId);
  const state = readLaCheieAgencyState((row?.settings ?? {}) as Record<string, unknown>);
  const { built } = await buildAgencyRegistration(organizationId, actorUserId);
  return {
    externalId: state.externalId ?? laCheieAgencyExternalId(organizationId),
    status: state.status,
    statusLabel: LACHEIE_AGENCY_STATUS_LABEL[state.status],
    version: state.version,
    acceptedVersion: state.acceptedVersion,
    syncedAt: state.syncedAt,
    error: state.error,
    missingFields: built.ok
      ? []
      : built.missing.map((field) => LACHEIE_AGENCY_FIELD_LABEL[field] ?? field),
    canActivate: canActivateLaCheieAgency(state.status) && built.ok,
  };
}

const LACHEIE_ACTIVATION_OPERATIONS = ["agency_register", "agency_reactivate"] as const;

/** Limită durabilă: o cerere de activare la 30 s pe agenție, citită din jurnal. */
async function activationTooSoon(organizationId: string): Promise<boolean> {
  const admin = await loadAdmin();
  const since = new Date(Date.now() - 30_000).toISOString();
  const { data } = await admin
    .from("portal_operation_logs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("portal", LACHEIE_PORTAL_KEY)
    .in("operation", LACHEIE_ACTIVATION_OPERATIONS as unknown as string[])
    .gte("created_at", since)
    .limit(1);
  return (data ?? []).length > 0;
}

export type LaCheieActivationRequest = {
  operation: string;
  requestedAt: string;
  success: boolean;
  actorName: string | null;
  actorEmail: string | null;
};

/** Cine a cerut activarea și când (actorul din jurnalul operațiilor). */
async function lastActivationRequest(
  organizationId: string,
): Promise<LaCheieActivationRequest | null> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("portal_operation_logs")
    .select("operation, success, actor_id, created_at")
    .eq("organization_id", organizationId)
    .eq("portal", LACHEIE_PORTAL_KEY)
    .in("operation", LACHEIE_ACTIVATION_OPERATIONS as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  let actorName: string | null = null;
  let actorEmail: string | null = null;
  if (data.actor_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", data.actor_id)
      .maybeSingle();
    actorName = profile?.full_name ?? null;
    actorEmail = profile?.email ?? null;
  }
  return {
    operation: data.operation,
    requestedAt: data.created_at,
    success: data.success,
    actorName,
    actorEmail,
  };
}

/**
 * Vedere READ-ONLY pentru administratorul agenției: statusul, eroarea afișabilă
 * și datele care vor fi trimise. Fără jurnal, versiuni, corpuri de cerere sau chei.
 */
export type LaCheieAgencySelfView = {
  status: LaCheieAgencyStatus;
  statusLabel: string;
  error: string | null;
  canActivate: boolean;
  suspended: boolean;
  data: { name: string | null; adminEmail: string | null; phone: string | null; address: string | null };
  missingFields: string[];
  issues: string[];
};

export const getLaCheieAgencyStatusForAgency = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<LaCheieAgencySelfView> => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireLaCheieActivator(auth, data.organizationId ?? null);
    const row = await connectionRow(organizationId);
    const state = readLaCheieAgencyState((row?.settings ?? {}) as Record<string, unknown>);
    const { built, adminEmail, issues } = await buildAgencyRegistration(
      organizationId,
      auth.userId,
    );
    const admin = await loadAdmin();
    const { data: org } = await admin
      .from("organizations")
      .select("name, legal_name, phone, material_phone, material_address")
      .eq("id", organizationId)
      .maybeSingle();

    return {
      status: state.status,
      statusLabel: LACHEIE_AGENCY_STATUS_LABEL[state.status],
      error: state.error,
      canActivate: canActivateLaCheieAgency(state.status) && built.ok,
      suspended: state.status === "suspended",
      data: {
        name: org?.name ?? org?.legal_name ?? null,
        adminEmail: adminEmail.ok ? adminEmail.email : null,
        phone: org?.phone ?? org?.material_phone ?? null,
        address: org?.material_address ?? null,
      },
      missingFields: built.ok
        ? []
        : built.missing.map((field) => LACHEIE_AGENCY_FIELD_LABEL[field] ?? field),
      issues,
    };
  });


export const getLaCheieState = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<LaCheieState> => {
    const organizationId = await requireSuperadmin(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const admin = await loadAdmin();
    const row = await connectionRow(organizationId);
    const settings = readLaCheieSettings((row?.settings ?? {}) as Record<string, unknown>);
    const { hasLaCheieCrmApiKey } = await import("@/lib/portals/lacheie/credentials.server");
    const hasProviderKey = hasLaCheieCrmApiKey();
    const lastError = isLegacyLaCheieTestEnvironmentError(row?.last_sync_error)
      ? null
      : (row?.last_sync_error ?? null);

    const { readLaCheieCatalog } = await import("@/lib/portals/lacheie/catalog.server");
    const [catalog, agency, activationRequest] = await Promise.all([
      readLaCheieCatalog(admin, { organizationId, environment: settings.environment }),
      agencyView(organizationId, (context as unknown as AuthContext).userId),
      lastActivationRequest(organizationId),
    ]);

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
      hasProviderKey,
      environment: settings.environment,
      baseUrl: LACHEIE_PRODUCTION_BASE_URL,
      propertiesPath: settings.propertiesPath,
      readiness: laCheieReadiness({
        hasApiKey: hasProviderKey && agency.status === "active",
        lastError,
      }),
      agency,
      activationRequest,
      catalog: {
        fetchedAt: catalog?.fetchedAt ?? settings.catalogFetchedAt,
        optionGroups: catalog ? Object.keys(catalog.options).length : 0,
        counties: catalog?.counties.length ?? 0,
        cities: catalog
          ? Object.values(catalog.cities).reduce((total, list) => total + list.length, 0)
          : 0,
        error: settings.catalogError,
      },
      lastError,
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

/* --------------------------- activarea agenției --------------------------- */

async function crmConfig(organizationId: string, agencyExternalId: string | null) {
  const { laCheieCrmApiKey } = await import("@/lib/portals/lacheie/credentials.server");
  return {
    baseUrl: activeBaseUrl(),
    apiKey: laCheieCrmApiKey(),
    environment: LACHEIE_ENVIRONMENT,
    agencyExternalId,
    connectionKey: `${organizationId}:${LACHEIE_ENVIRONMENT}`,
  };
}

/**
 * `PUT /agencies/{external_id}` — înregistrarea inițială (versiune 1) sau
 * reactivarea (versiune mai mare, doar dacă portalul a acceptat deja o
 * înregistrare). Payload-ul folosește exclusiv date reale ale agenției din
 * Habitoo și emailul VERIFICAT al unui administrator; ce lipsește este cerut în
 * UI, nu inventat.
 *
 * Idempotență: operația se persistă înainte de apel (operație, versiune, SHA-256
 * al corpului exact). La timeout, eroare de rețea, 429 sau 5xx rămâne pending și
 * următoarea încercare refolosește aceeași versiune și același corp; o versiune
 * nouă se alocă numai după un răspuns definitiv (2xx, 400, 403, 409).
 */
export const activateLaCheieAgency = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireLaCheieActivator(auth, data.organizationId ?? null);
    const admin = await loadAdmin();

    // O cerere de activare la 30 secunde pe agenție (limită durabilă, din jurnal).
    if (await activationTooSoon(organizationId)) {
      throw new Error("O cerere de activare a fost trimisă acum. Reia în câteva secunde.");
    }

    const row = await ensureConnectionRow(organizationId, auth.userId);
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    const state = readLaCheieAgencyState(settings);
    const pending = readLaCheieAgencyPending(settings);
    if (!canActivateLaCheieAgency(state.status)) {

      throw new Error(
        "Agenția este suspendată administrativ de La Cheie; reactivarea nu este posibilă din CRM. Contactați La Cheie.",
      );
    }

    const { built, issues } = await buildAgencyRegistration(organizationId, auth.userId);
    if (!built.ok) {
      const labels = built.missing.map((field) => LACHEIE_AGENCY_FIELD_LABEL[field] ?? field);
      throw new Error(
        `Completează datele agenției înainte de activare: ${labels.join(", ")}. ${issues.join(" ")}`,
      );
    }

    const externalId = state.externalId ?? laCheieAgencyExternalId(organizationId);
    const isReactivation = isLaCheieAgencyReactivation(state);
    const operation = isReactivation ? "reactivate" : "register";
    const bodyHash = await laCheieAgencyBodyHash(operation, built.payload);
    const plan = planLaCheieAgencyOperation({ state, pending, operation, bodyHash });
    const version = plan.version;

    // Operația se persistă ÎNAINTE de apel, ca un retry să o poată refolosi identic.
    await mergeSettings(
      organizationId,
      laCheieAgencyPendingPatch(plan, bodyHash, new Date().toISOString()),
      auth.userId,
    );

    const { putLaCheieAgency, getLaCheieAgency: readAgency } = await import(
      "@/lib/portals/lacheie/agency.server"
    );
    const call = await putLaCheieAgency(await crmConfig(organizationId, externalId), {
      externalId,
      payload: built.payload,
      version,
    });

    const outcome = classifyLaCheieAgencyPut({
      httpStatus: call.response.status,
      body: call.response.body,
      conflictAcceptedVersion: call.response.conflict?.acceptedVersion ?? null,
      previousStatus: state.status,
      fallbackMessage: call.response.classification?.message ?? null,
    });
    const ok = call.response.ok;
    let acceptedVersion = outcome.acceptedVersion ?? (ok ? version : state.acceptedVersion);
    let status: LaCheieAgencyStatus = outcome.status;

    // 409 pe versiune: citim versiunea acceptată de portal, ca reluarea să poată
    // folosi o versiune mai mare. Nu reîncercăm automat.
    if (outcome.versionConflict) {
      const refreshed = await readAgency(await crmConfig(organizationId, externalId), {
        externalId,
      });
      if (refreshed.response.ok) {
        acceptedVersion = refreshed.agency.acceptedVersion ?? acceptedVersion;
        status = refreshed.agency.status;
      }
      await logLaCheie({
        organizationId,
        operation: "agency_status",
        success: refreshed.response.ok,
        errorMessage: refreshed.response.ok
          ? null
          : (refreshed.response.classification?.message ?? null),
        actorId: auth.userId,
        environment: LACHEIE_ENVIRONMENT,
        externalId,
        httpStatus: refreshed.response.status,
        durationMs: refreshed.response.durationMs,
        requestId: refreshed.response.requestId,
        portalResponse: refreshed.response.body,
      });
    }

    await mergeSettings(
      organizationId,
      {
        lacheie_agency_external_id: externalId,
        lacheie_agency_status: status,
        lacheie_agency_version: version,
        ...(acceptedVersion ? { lacheie_agency_accepted_version: acceptedVersion } : {}),
        lacheie_agency_synced_at: new Date().toISOString(),
        lacheie_agency_error: outcome.message,
        // Pending se păstrează doar pentru erorile reluabile identic.
        ...(outcome.keepPending
          ? laCheieAgencyPendingPatch(plan, bodyHash, new Date().toISOString())
          : laCheieAgencyPendingCleared()),
      },
      auth.userId,
    );
    if (ok) {
      await admin
        .from("portal_connections")
        .update({
          status: "connected",
          activated: true,
          last_sync_status: "ok",
          last_sync_error: null,
          last_sync_at: new Date().toISOString(),
          updated_by: auth.userId,
        })
        .eq("id", row.id);
    }

    await logLaCheie({
      organizationId,
      operation: isReactivation ? "agency_reactivate" : "agency_register",
      success: ok,
      errorMessage: outcome.message,
      errorCode: ok ? null : (call.response.classification?.code ?? null),
      actorId: auth.userId,
      environment: LACHEIE_ENVIRONMENT,
      externalId,
      sourceVersion: version,
      httpStatus: call.response.status,
      durationMs: call.response.durationMs,
      requestId: call.response.requestId,
      portalResponse: call.response.body,
    });

    if (!ok) throw new Error(outcome.message ?? "Activarea agenției la La Cheie a eșuat.");
    return {
      externalId,
      status,
      version,
      reactivated: isReactivation,
      retriedSameVersion: plan.reused,
      /** După reactivare, ofertele trebuie retrimise complet, cu versiuni mai mari. */
      requiresResend: isReactivation,
    };
  });


/** `GET /agencies/{external_id}` — statusul real raportat de portal. */
export const refreshLaCheieAgencyStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireSuperadmin(auth, data.organizationId);
    const row = await connectionRow(organizationId);
    const state = readLaCheieAgencyState((row?.settings ?? {}) as Record<string, unknown>);
    if (!state.externalId) throw new Error("Agenția nu este încă înregistrată la La Cheie.");

    const { getLaCheieAgency } = await import("@/lib/portals/lacheie/agency.server");
    const call = await getLaCheieAgency(await crmConfig(organizationId, state.externalId), {
      externalId: state.externalId,
    });
    const ok = call.response.ok;
    const message = ok
      ? null
      : (call.response.classification?.message ??
        `La Cheie a răspuns HTTP ${call.response.status}.`);

    await mergeSettings(
      organizationId,
      {
        lacheie_agency_status: ok ? call.agency.status : state.status,
        lacheie_agency_accepted_version: call.agency.acceptedVersion ?? state.acceptedVersion,
        lacheie_agency_synced_at: new Date().toISOString(),
        lacheie_agency_error: message,
      },
      auth.userId,
    );
    await logLaCheie({
      organizationId,
      operation: "agency_status",
      success: ok,
      errorMessage: message,
      errorCode: ok ? null : (call.response.classification?.code ?? null),
      actorId: auth.userId,
      environment: LACHEIE_ENVIRONMENT,
      externalId: state.externalId,
      httpStatus: call.response.status,
      durationMs: call.response.durationMs,
      requestId: call.response.requestId,
      portalResponse: call.response.body,
    });

    if (!ok) throw new Error(message ?? "Statusul agenției nu a putut fi citit.");
    return {
      status: call.agency.status,
      statusLabel: LACHEIE_AGENCY_STATUS_LABEL[call.agency.status],
      acceptedVersion: call.agency.acceptedVersion,
    };
  });

/**
 * `DELETE /agencies/{external_id}` — oprește sincronizarea și retrage ofertele
 * acestei conexiuni. Necesită confirmare explicită din UI.
 */
export const deactivateLaCheieAgency = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid(), confirm: z.literal(true) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireSuperadmin(auth, data.organizationId);
    const admin = await loadAdmin();
    const row = await connectionRow(organizationId);
    const settings = (row?.settings ?? {}) as Record<string, unknown>;
    const state = readLaCheieAgencyState(settings);
    const pending = readLaCheieAgencyPending(settings);
    if (!state.externalId) throw new Error("Agenția nu este înregistrată la La Cheie.");

    const bodyHash = await laCheieAgencyBodyHash("deactivate", null);
    const plan = planLaCheieAgencyOperation({
      state,
      pending,
      operation: "deactivate",
      bodyHash,
    });
    const version = plan.version;
    await mergeSettings(
      organizationId,
      laCheieAgencyPendingPatch(plan, bodyHash, new Date().toISOString()),
      auth.userId,
    );

    const { deleteLaCheieAgency: remove } = await import("@/lib/portals/lacheie/agency.server");
    const call = await remove(await crmConfig(organizationId, state.externalId), {
      externalId: state.externalId,
      version,
    });
    const result = laCheieAgencyStatusAfterDelete({
      httpStatus: call.response.status,
      body: call.response.body,
      previousStatus: state.status,
    });
    const ok = result.ok;
    const message = ok
      ? null
      : (call.response.classification?.message ??
        `La Cheie a răspuns HTTP ${call.response.status}.`);

    await mergeSettings(
      organizationId,
      {
        lacheie_agency_status: result.status,
        lacheie_agency_version: version,
        lacheie_agency_synced_at: new Date().toISOString(),
        lacheie_agency_error: message,
        ...(result.keepPending
          ? laCheieAgencyPendingPatch(plan, bodyHash, new Date().toISOString())
          : laCheieAgencyPendingCleared()),
      },
      auth.userId,
    );
    if (ok && row) {
      await admin
        .from("portal_connections")
        .update({ status: "disabled", activated: false, updated_by: auth.userId })
        .eq("id", row.id);
      // Starea locală: ofertele acestei conexiuni sunt retrase, fără apeluri extra.
      await Promise.all([
        admin
          .from("portal_listings")
          .update({ status: "withdrawn", updated_by: auth.userId })
          .eq("organization_id", organizationId)
          .eq("portal", LACHEIE_PORTAL_KEY),
        admin
          .from("portal_publications")
          .update({ status: "withdrawn", updated_by: auth.userId })
          .eq("organization_id", organizationId)
          .eq("portal_key", LACHEIE_PORTAL_KEY),
      ]);
    }
    await logLaCheie({
      organizationId,
      operation: "agency_deactivate",
      success: ok,
      errorMessage: message,
      errorCode: ok ? null : (call.response.classification?.code ?? null),
      actorId: auth.userId,
      environment: LACHEIE_ENVIRONMENT,
      externalId: state.externalId,
      sourceVersion: version,
      httpStatus: call.response.status,
      durationMs: call.response.durationMs,
      requestId: call.response.requestId,
      portalResponse: call.response.body,
    });



    if (!ok) throw new Error(message ?? "Dezactivarea conexiunii La Cheie a eșuat.");
    return { status: result.status, version };

  });

/**
 * Testarea conexiunii: GET `/account` cu cheia de furnizor și
 * `X-Agency-External-ID`. Read-only — nu creează, nu modifică, nu retrage.
 */
export const testLaCheieConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireSuperadmin(auth, data.organizationId);
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

/** Catalogul (`/options`, `/counties`, `/cities`) folosește doar cheia CRM. */
export const refreshLaCheieCatalog = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    const organizationId = await requireSuperadmin(auth, data.organizationId);
    const { ctx } = await buildLaCheieContext(organizationId);
    const settings = readLaCheieSettings(ctx.settings as Record<string, unknown>);

    const admin = await loadAdmin();
    const { refreshLaCheieCatalog: refresh } = await import("@/lib/portals/lacheie/catalog.server");
    const result = await refresh(
      admin,
      await crmConfig(organizationId, null),
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
