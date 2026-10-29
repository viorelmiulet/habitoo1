/**
 * Configurarea portalurilor de către administratorul agenției (self-service).
 *
 * Reguli:
 *  - doar `agency_admin`, doar pentru agenția din SESIUNE (niciodată din input);
 *  - aceeași logică ca în Superadmin (nucleele din `portals.functions.ts`);
 *  - niciun secret nu părăsește serverul: doar „salvat / nesalvat”;
 *  - testul de conexiune: maximum unul la 10 secunde pe portal și agenție.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  derivePortalConnectionStatus,
  getPortalDefinition,
  isPortalCovered,
  portalActivationMode,
  portalDisplayName,
  validatePortalConfigValues,
  type PortalActivationMode,
  type PortalConfigField,
  type PortalConnectionStatus,
} from "@/lib/portals/registry";
import { PORTAL_ERROR_MESSAGE } from "@/lib/portals/errors";

export class AgencyPortalAccessError extends Error {
  readonly status = 403;
}

/** Portaluri gestionate în altă parte (catalog, OAuth, panou propriu). */
export const AGENCY_SETUP_EXCLUDED = new Set(["facebook_catalog"]);
/** Câmpuri rezervate Superadminului (ex. ID-ul agenției la Ofera). */
const SUPERADMIN_ONLY_FIELD_PORTALS = new Set(["ofera"]);
export const AGENCY_TEST_INTERVAL_MS = 10_000;

type Ctx = { userId: string; supabase: unknown };

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Agenția din sesiune; refuză agenții și orice altă agenție cerută explicit. */
export async function requireAgencyPortalAdmin(context: Ctx, requestedOrganizationId?: string): Promise<string> {
  const { requireOrgAdminOrg } = await import("@/lib/portal-activation.functions");
  let organizationId: string;
  try {
    organizationId = await requireOrgAdminOrg(context as never);
  } catch {
    throw new AgencyPortalAccessError("Acces refuzat: doar administratorul agenției poate configura portalurile.");
  }
  if (requestedOrganizationId && requestedOrganizationId !== organizationId) {
    throw new AgencyPortalAccessError("Acces refuzat: poți configura doar portalurile agenției tale.");
  }
  return organizationId;
}

function requireSetupPortal(portalId: string) {
  const definition = getPortalDefinition(portalId);
  if (!definition || isPortalCovered(portalId) || AGENCY_SETUP_EXCLUDED.has(portalId) || definition.status !== "available") {
    throw new Error("Portal necunoscut.");
  }
  return definition;
}

export function agencyEditableFields(portalId: string): PortalConfigField[] {
  const definition = getPortalDefinition(portalId);
  if (!definition || SUPERADMIN_ONLY_FIELD_PORTALS.has(portalId)) return [];
  return definition.configuration_schema.fields;
}

export type AgencyPortalSetup = {
  id: string;
  displayName: string;
  description: string;
  accessSource: string;
  website: string | null;
  docs: string | null;
  activation: PortalActivationMode;
  oauth: boolean;
  fields: PortalConfigField[];
  usesHabitooKey: boolean;
  supportsConnectionTest: boolean;
  feedOnly: boolean;
  /** Link de feed (fără nicio cheie inclusă). */
  feedUrl: string | null;
  feedUrlCsv: string | null;
  feedKeyHint: string | null;
  instructions: string | null;
  connection: {
    activated: boolean;
    status: PortalConnectionStatus;
    hasPortalCredential: boolean;
    hasWebhookSecret: boolean;
    keyMode: "live" | "test" | null;
    externalAccountId: string | null;
    endpointUrl: string | null;
    lastSyncAt: string | null;
    lastSyncError: string | null;
  };
  keys: { id: string; label: string; keyPrefix: string; lastUsedAt: string | null; requestCount: number }[];
};

export async function loadAgencyPortalSetup(organizationId: string, portalId: string): Promise<AgencyPortalSetup> {
  const definition = requireSetupPortal(portalId);
  const admin = await loadAdmin();
  const [{ data: row }, { data: keys }] = await Promise.all([
    admin
      .from("portal_connections")
      .select("activated, external_account_id, portal_credentials_encrypted, settings, last_sync_at, last_sync_status, last_sync_error")
      .eq("organization_id", organizationId)
      .eq("portal", definition.id)
      .maybeSingle(),
    admin
      .from("portal_api_keys")
      .select("id, label, key_prefix, last_used_at, request_count, status")
      .eq("organization_id", organizationId)
      .eq("portal", definition.id)
      .eq("status", "active"),
  ]);
  const settings = ((row?.settings ?? {}) as Record<string, unknown>);
  const { homedirectKeyMissing } = await import("@/lib/portals/homedirect/config");
  const { oferaConfigured } = await import("@/lib/portals/ofera/config");
  const { zupConfigured } = await import("@/lib/portals/zup/config");
  const { getPortalAdapter } = await import("@/lib/portals/adapters/index.server");
  const fields = agencyEditableFields(definition.id);
  const { CRM_URL } = await import("@/lib/host");
  const feedBase = definition.id === "imove" ? `${CRM_URL}/api/public/portal/v1/imove/feed` : null;
  return {
    id: definition.id,
    displayName: portalDisplayName(definition.id),
    description: definition.description,
    accessSource: fields.find((f) => f.help)?.help ?? definition.description,
    website: definition.website ?? null,
    docs: definition.docs ?? null,
    activation: portalActivationMode(definition.id),
    oauth: definition.authentication.includes("oauth"),
    fields,
    usesHabitooKey: definition.authentication.includes("habitoo_api_key"),
    supportsConnectionTest: Boolean(getPortalAdapter(definition.id)) && definition.capabilities.includes("test_connection"),
    feedOnly: definition.capabilities.includes("feed_pull") && !definition.capabilities.includes("publish_listing"),
    feedUrl: feedBase ? `${feedBase}.json` : null,
    feedUrlCsv: feedBase ? `${feedBase}.csv` : null,
    feedKeyHint: feedBase ? "La final adaugă ?api_key= urmat de cheia iMove salvată mai sus." : null,
    instructions: definition.id === "homepitch" || definition.id === "imove" ? (definition.notes ?? null) : null,
    connection: {
      activated: row?.activated === true,
      status: derivePortalConnectionStatus({
        definition,
        activated: row?.activated === true,
        externalAccountId: row?.external_account_id ?? null,
        hasPortalCredential: Boolean(row?.portal_credentials_encrypted),
        hasOAuthTokens: Boolean(row?.portal_credentials_encrypted),
        serverKeyMissing: homedirectKeyMissing(definition.id) || (definition.id === "ofera" && !oferaConfigured(process.env)) || (definition.id === "zup" && !zupConfigured(process.env)),
        lastError: row?.last_sync_error ?? null,
        lastSyncStatus: row?.last_sync_status ?? null,
      }),
      hasPortalCredential: Boolean(row?.portal_credentials_encrypted),
      hasWebhookSecret: typeof settings["webhook_secret_encrypted"] === "string",
      keyMode: settings["key_mode"] === "live" || settings["key_mode"] === "test" ? (settings["key_mode"] as "live" | "test") : null,
      externalAccountId: row?.external_account_id ?? null,
      endpointUrl:
        typeof settings["endpoint_url"] === "string"
          ? String(settings["endpoint_url"])
          : definition.id === "imopedia" && typeof settings["agency_id"] === "number"
            ? String(settings["agency_id"])
            : null,
      lastSyncAt: row?.last_sync_at ?? null,
      lastSyncError: row?.last_sync_error ?? null,
    },
    keys: (keys ?? []).map((k) => ({
      id: k.id,
      label: k.label,
      keyPrefix: k.key_prefix,
      lastUsedAt: k.last_used_at,
      requestCount: Number(k.request_count ?? 0),
    })),
  };
}

const saveInput = z.object({
  portalId: z.string().min(1).max(40),
  organizationId: z.string().uuid().optional(),
  externalAccountId: z.string().trim().max(200).optional(),
  credential: z.string().trim().min(1).max(500).optional(),
  endpointUrl: z.string().trim().max(300).optional(),
  webhookSecret: z.string().trim().min(8).max(500).optional(),
});

export async function saveAgencyPortal(context: Ctx, input: z.infer<typeof saveInput>) {
  const organizationId = await requireAgencyPortalAdmin(context, input.organizationId);
  const definition = requireSetupPortal(input.portalId);
  if (agencyEditableFields(definition.id).length === 0) throw new Error("Acest portal nu are date de acces de completat.");
  const { organizationId: _ignored, ...values } = input;
  void _ignored;
  const formatError = validatePortalConfigValues(definition.id, values);
  if (formatError) throw new Error(formatError);
  const { savePortalConnectionCore } = await import("@/lib/portals.functions");
  await savePortalConnectionCore({ organizationId, actorId: context.userId, data: values });
  return { ok: true as const };
}

export async function testAgencyPortal(context: Ctx, input: { portalId: string; organizationId?: string }) {
  const organizationId = await requireAgencyPortalAdmin(context, input.organizationId);
  const definition = requireSetupPortal(input.portalId);
  const { portalRateLimited } = await import("@/lib/portals/rate-limit.server");
  const admin = await loadAdmin();
  const since = new Date(Date.now() - AGENCY_TEST_INTERVAL_MS).toISOString();
  const { count } = await admin
    .from("portal_operation_logs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("portal", definition.id)
    .eq("operation", "test_connection")
    .gte("created_at", since);
  if ((count ?? 0) > 0 || portalRateLimited("agency_test", `${organizationId}|${definition.id}`)) {
    return { ok: false as const, code: "RATE_LIMIT", message: PORTAL_ERROR_MESSAGE.RATE_LIMIT };
  }
  const { testPortalConnectionCore } = await import("@/lib/portals.functions");
  const result = await testPortalConnectionCore({ organizationId, actorId: context.userId, portalId: definition.id });
  return result.ok
    ? { ok: true as const, live: result.live, detail: result.detail, feed: result.feed ?? null }
    : { ok: false as const, code: result.code, message: result.message };
}

export async function setAgencyPortalActivation(
  context: Ctx,
  input: { portalId: string; activated: boolean; organizationId?: string },
) {
  const organizationId = await requireAgencyPortalAdmin(context, input.organizationId);
  const definition = requireSetupPortal(input.portalId);
  const { applyPortalActivationForOrg } = await import("@/lib/portals.functions");
  return applyPortalActivationForOrg({
    organizationId,
    portalId: definition.id,
    activated: input.activated,
    actorId: context.userId,
    source: "agency",
  });
}

export async function issueAgencyPortalKey(context: Ctx, input: { portalId: string; label?: string; organizationId?: string }) {
  const organizationId = await requireAgencyPortalAdmin(context, input.organizationId);
  const definition = requireSetupPortal(input.portalId);
  const { issuePortalApiKeyCore } = await import("@/lib/portals.functions");
  return issuePortalApiKeyCore({
    organizationId,
    actorId: context.userId,
    portalId: definition.id,
    label: input.label?.trim() || "Cheie portal",
  });
}

export async function revokeAgencyPortalKey(context: Ctx, input: { keyId: string; organizationId?: string }) {
  const organizationId = await requireAgencyPortalAdmin(context, input.organizationId);
  const { revokePortalApiKeyCore } = await import("@/lib/portals.functions");
  return revokePortalApiKeyCore({ organizationId, actorId: context.userId, keyId: input.keyId });
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AgencyPortalAccessError) {
      const { setResponseStatus } = await import("@tanstack/react-start/server");
      setResponseStatus(403);
    }
    throw error;
  }
}

const portalInput = z.object({ portalId: z.string().min(1).max(40), organizationId: z.string().uuid().optional() });

export const getAgencyPortalSetup = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => portalInput.parse(input))
  .handler(async ({ data, context }) =>
    guard(async () => {
      const organizationId = await requireAgencyPortalAdmin(context as unknown as Ctx, data.organizationId);
      return loadAgencyPortalSetup(organizationId, data.portalId);
    }),
  );

export const saveAgencyPortalConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => guard(() => saveAgencyPortal(context as unknown as Ctx, data)));

export const testAgencyPortalConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => portalInput.parse(input))
  .handler(async ({ data, context }) => guard(() => testAgencyPortal(context as unknown as Ctx, data)));

export const setAgencyPortalActive = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => portalInput.extend({ activated: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => guard(() => setAgencyPortalActivation(context as unknown as Ctx, data)));

export const issueAgencyPortalApiKey = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => portalInput.extend({ label: z.string().trim().max(80).optional() }).parse(input))
  .handler(async ({ data, context }) => guard(() => issueAgencyPortalKey(context as unknown as Ctx, data)));

export const revokeAgencyPortalApiKey = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ keyId: z.string().uuid(), organizationId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => guard(() => revokeAgencyPortalKey(context as unknown as Ctx, data)));
