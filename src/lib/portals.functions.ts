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
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  PORTALS,
  configurablePortals,
  isPortalCovered,
  portalDisplayName,
  derivePortalConnectionStatus,
  getPortalDefinition,
  portalPublicFeedUrl,
  type PortalConnectionStatus,
  type PortalDefinition,
} from "@/lib/portals/registry";
import { PORTAL_ERROR_MESSAGE } from "@/lib/portals/errors";
import {
  displayListingPublicUrl,
  portalSaysOffline,
  resolveListingPublicUrl,
  shouldSaveBackfilledUrl,
} from "@/lib/portals/link";
import {
  IMOBILIARE_NO_SUBSCRIPTION_MESSAGE,
  subscriptionInactive,
  type ImobiliareAccountState,
} from "@/lib/portals/imobiliare/account";
import type { ImoveListing } from "@/lib/portals/imove/mapper";
import {
  isLegacyLaCheieTestEnvironmentError,
  normalizeLaCheiePortalSettings,
} from "@/lib/portals/lacheie/config";

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
    /** Superadmin a activat explicit portalul pentru această agenție. */
    activated: boolean;
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
  /** Variantă CSV a feedului (aceeași selecție, altă serializare). */
  feedUrlCsv: string | null;
  /** Portalul primește ofertele doar prin feed, fără operații de scriere. */
  feedOnly: boolean;
  /** Diagnoză reală a feedului pe care îl citește portalul. */
  feed: {
    ok: boolean;
    apiVersion: string | null;
    properties: number | null;
    agents: number | null;
    /** Oferte selectate pentru portal (doar la portalurile de tip feed). */
    selected: number | null;
    /** Oferte selectate dar excluse din feed pentru date incomplete. */
    excluded: number | null;
  };
  /**
   * Portalurile cu OAuth (Storia): starea autorizării contului agenției.
   * `null` la portalurile care nu folosesc OAuth. Niciun token, doar metadate.
   */
  oauth: {
    appConfigured: boolean;
    connected: boolean;
    expiresAt: string | null;
    expired: boolean;
    canRefresh: boolean;
    connectedAt: string | null;
    refreshedAt: string | null;
  } | null;
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

export type PropertyPortalJournalItem = PortalLogItem & {
  requestId: string | null;
};

export type AuthContext = {
  supabase: {
    rpc: (
      fn: "is_superadmin" | "is_org_admin",
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
    from: (table: "profiles") => {
      select: (cols: string) => {
        eq: (
          col: string,
          value: string,
        ) => {
          maybeSingle: () => PromiseLike<{ data: { organization_id: string | null } | null }>;
        };
      };
    };
  };
  userId: string;
};

/**
 * Conexiunile de portaluri (credențiale, chei, test, disconnect) rămân EXCLUSIV
 * ale platformei (Superadmin). Agențiile nu le văd și nu le pot modifica.
 */
async function requireSuperadmin(context: AuthContext): Promise<void> {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: integrările de portaluri se gestionează doar de Superadmin.");
  }
}

/** Verifică rolul de Superadmin și validează agenția-țintă primită explicit. */
async function requireSuperadminOrg(context: AuthContext, organizationId: string): Promise<string> {
  await requireSuperadmin(context);
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
 * Publicarea ofertelor pe portaluri (bifarea per proprietate) este fluxul
 * zilnic al agenției. Superadminul poate lucra pe orice agenție (panou de
 * suport); administratorul de agenție și AGENTUL lucrează doar pe agenția din
 * SESIUNE, niciodată pe una primită din input. Agentul este limitat la
 * ofertele unde este agentul responsabil (`agentOnly`).
 */
export async function resolvePublishingOrg(
  context: AuthContext,
  requestedOrganizationId?: string,
): Promise<{ organizationId: string; superadmin: boolean; agentOnly: boolean }> {
  const { data: isSuper } = await context.supabase.rpc("is_superadmin");
  if (isSuper === true) {
    const admin = await loadAdmin();
    if (!requestedOrganizationId) throw new Error("Alege agenția.");
    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("id", requestedOrganizationId)
      .maybeSingle();
    if (!org) throw new Error("Agenția nu a fost găsită.");
    return { organizationId: org.id, superadmin: true, agentOnly: false };
  }

  const { data: isOrgAdmin } = await context.supabase.rpc("is_org_admin");
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error("Contul nu este asociat unei agenții.");
  return {
    organizationId: profile.organization_id,
    superadmin: false,
    agentOnly: isOrgAdmin !== true,
  };
}

export const PORTAL_AGENT_NOT_RESPONSIBLE =
  "Acces refuzat: poți publica pe portaluri doar ofertele unde ești agentul responsabil.";

/**
 * Un agent poate opera pe portaluri numai ofertele lui. Administratorul
 * agenției și Superadminul trec neatinși.
 */
export async function assertPortalPropertyAccess(input: {
  organizationId: string;
  propertyId: string;
  agentOnly: boolean;
  userId: string;
}): Promise<void> {
  if (!input.agentOnly) return;
  const admin = await loadAdmin();
  const { data: property } = await admin
    .from("properties")
    .select("id, assigned_to")
    .eq("id", input.propertyId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!property) throw new Error("Proprietatea nu a fost găsită.");
  if ((property as { assigned_to: string | null }).assigned_to !== input.userId) {
    throw new Error(PORTAL_AGENT_NOT_RESPONSIBLE);
  }
}

/** Portalurile activate explicit de Superadmin pentru agenție. */
async function activatedPortalIds(organizationId: string): Promise<Set<string>> {
  const admin = await loadAdmin();
  const { data } = await admin
    .from("portal_connections")
    .select("portal, activated")
    .eq("organization_id", organizationId);
  return new Set((data ?? []).filter((row) => row.activated === true).map((row) => row.portal));
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function logOperation(input: {
  organizationId: string;
  portal: string;
  operation: string;
  success: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  propertyId?: string | null;
  actorId?: string | null;
  /** Statusul HTTP real al portalului, când operațiunea a ajuns la el. */
  httpStatus?: number | null;
  /** Corpul brut al răspunsului portalului (sanitizat de secrete). */
  portalResponse?: unknown;
  /** Referința anunțului la portal, când există. */
  externalId?: string | null;
}) {
  const admin = await loadAdmin();
  const { portalResponseLog } = await import("@/lib/portals/errors");
  const response = portalResponseLog({
    status: input.httpStatus ?? null,
    body: input.portalResponse ?? null,
  });
  await admin.from("portal_operation_logs").insert({
    organization_id: input.organizationId,
    ...(input.httpStatus === null || input.httpStatus === undefined
      ? {}
      : { http_status: input.httpStatus }),
    ...(response ? { portal_response: response as never } : {}),
    ...(input.externalId ? { external_id: input.externalId } : {}),
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

export type PortalListingDiagnosticsView = {
  feedVisible: boolean;
  externalId: string | null;
  offerUrl: string | null;
  agentName: string | null;
  images: { total: number; resolvable: number; broken: number; primary: boolean };
  notes: string[];
  /** Portalul a spus efectiv în ce stare este anunțul. */
  stateKnown: boolean;
  portalState: string | null;
  urlConfirmed: boolean;
  /** Anunțul e online, dar pagina publică nu funcționează (cont fără abonament). */
  offerUrlSuppressed: boolean;
  /** Abonamentul contului portalului, când portalul o spune. */
  subscriptionActive: boolean | null;
};

/**
 * Diagnoza costă un request către portal la fiecare încărcare de pagină. O
 * păstrăm scurt în memoria procesului: destul ca reîncărcările rapide să nu
 * mai lovească portalul, prea puțin ca să ascundă o schimbare reală.
 */
export const PORTAL_DIAGNOSTICS_TTL_MS = 60_000;
const diagnosticsCache = new Map<
  string,
  { at: number; value: PortalListingDiagnosticsView | null }
>();

export function clearPortalDiagnosticsCache() {
  diagnosticsCache.clear();
}

export async function cachedListingDiagnostics(input: {
  organizationId: string;
  portal: { id: string };
  propertyId: string;
  externalId: string | null;
  run: () => Promise<PortalListingDiagnosticsView | null>;
  now?: number;
}): Promise<PortalListingDiagnosticsView | null> {
  const now = input.now ?? Date.now();
  const key = [
    input.organizationId,
    input.portal.id,
    input.propertyId,
    input.externalId ?? "",
  ].join("|");
  const hit = diagnosticsCache.get(key);
  if (hit && now - hit.at < PORTAL_DIAGNOSTICS_TTL_MS) return hit.value;
  const value = await input.run();
  diagnosticsCache.set(key, { at: now, value });
  return value;
}

/**
 * Persistă ce a aflat diagnoza: linkul confirmat de portal se salvează, iar
 * cel salvat se șterge DOAR când portalul raportează explicit o stare
 * non-`online`.
 */
export async function syncListingPublicUrl(input: {
  organizationId: string;
  portalId: string;
  propertyId: string;
  stored: string | null;
  resolved: string | null;
  portalSaysOffline: boolean;
  admin?: { from: (table: "portal_listings") => never };
}): Promise<"saved" | "cleared" | "unchanged"> {
  const next = input.resolved;
  if (next === input.stored) return "unchanged";
  if (next === null && !input.portalSaysOffline) return "unchanged";
  const db = (input.admin ?? (await loadAdmin())) as Awaited<ReturnType<typeof loadAdmin>>;
  await db
    .from("portal_listings")
    .update({ public_url: next } as never)
    .eq("organization_id", input.organizationId)
    .eq("portal", input.portalId)
    .eq("property_id", input.propertyId);
  return next === null ? "cleared" : "saved";
}

/** URL-ul feedului pe care îl citește portalul (specific unde portalul cere altul). */
async function feedUrlForOrg(portalId?: string): Promise<string> {
  const { CRM_URL } = await import("@/lib/host");
  if (portalId === "imove") return `${CRM_URL}/api/public/portal/v1/imove/feed`;
  return `${CRM_URL}/api/public/portal/v1/properties`;
}

/** Context complet pentru adaptor, cu credențialul decriptat. */
export async function buildContext(organizationId: string, definition: PortalDefinition) {
  const admin = await loadAdmin();
  const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
  const { data: row } = await admin
    .from("portal_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portal", definition.id)
    .maybeSingle();

  const storedSettings = (row?.settings ?? {}) as Record<string, unknown>;
  const settings =
    definition.id === "lacheie" ? normalizeLaCheiePortalSettings(storedSettings) : storedSettings;
  return {
    row,
    ctx: {
      organizationId,
      definition,
      direction: (row?.direction ?? definition.directions[0] ?? "habitoo_to_portal") as never,
      authenticationMode: (row?.authentication_mode ??
        definition.authentication[0] ??
        "none") as never,
      externalAccountId: row?.external_account_id ?? null,
      portalCredential: row ? decryptPortalCredential(row.portal_credentials_encrypted) : null,
      settings,
      allowLiveRequests: settings["allow_live"] === true,
    },
  };
}

export const getPortalHub = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PortalHubItem[]> => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const admin = await loadAdmin();
    const genericFeedUrl = await feedUrlForOrg();
    const imoveFeedUrl = await feedUrlForOrg("imove");
    // iMove citește feedul printr-un sync generic de URL, fără headere: cheia
    // salvată pentru portal se adaugă direct în URL-ul afișat/copiat.
    const imoveFeedKey = await (async () => {
      const { data: row } = await admin
        .from("portal_connections")
        .select("portal_credentials_encrypted")
        .eq("organization_id", organizationId)
        .eq("portal", "imove")
        .maybeSingle();
      if (!row?.portal_credentials_encrypted) return null;
      try {
        const { decryptPortalCredential } = await import("@/lib/portals/crypto.server");
        return decryptPortalCredential(row.portal_credentials_encrypted);
      } catch {
        return null;
      }
    })();
    const withImoveKey = (url: string) =>
      imoveFeedKey ? `${url}?api_key=${encodeURIComponent(imoveFeedKey)}` : url;
    // Feedul iMove are schemă proprie, deci și numărătoare proprie de oferte.
    const { buildImoveFeed } = await import("@/lib/portals/imove/feed.server");
    const imoveFeed = await buildImoveFeed({
      organizationId,
      requestUrl: imoveFeedUrl,
      perPage: 500,
    });

    const { inspectFeedAgents, inspectFeedProperties } =
      await import("@/lib/portals/feed-inspect.server");
    const [connections, keys, listings, eligible, feedProperties, feedAgents] = await Promise.all([
      admin.from("portal_connections").select("*").eq("organization_id", organizationId),
      admin
        .from("portal_api_keys")
        .select(
          "id, portal, label, key_prefix, scopes, status, last_used_at, request_count, created_at",
        )
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

    // Storia: starea autorizării OAuth a agenției (metadate, fără tokenuri).
    const { readStoriaOAuthMeta, storiaAppConfigured, loadStoriaTokens } =
      await import("@/lib/portals/storia/oauth.server");
    const storiaTokens = await loadStoriaTokens(organizationId);
    const storiaAppReady = storiaAppConfigured();

    return configurablePortals().map((portal) => {
      const row = (connections.data ?? []).find((c) => c.portal === portal.id) ?? null;
      const storedSettings = (row?.settings ?? {}) as Record<string, unknown>;
      const settings =
        portal.id === "lacheie" ? normalizeLaCheiePortalSettings(storedSettings) : storedSettings;
      const storedLastError = row?.last_sync_error ?? null;
      const lastError =
        portal.id === "lacheie" && isLegacyLaCheieTestEnvironmentError(storedLastError)
          ? null
          : storedLastError;
      const portalKeys = (keys.data ?? []).filter((k) => k.portal === portal.id);
      const portalListings = (listings.data ?? []).filter((l) => l.portal === portal.id);
      const oauthMeta = portal.authentication.includes("oauth")
        ? readStoriaOAuthMeta(settings)
        : null;
      const oauthExpiresAt = oauthMeta?.expires_at ?? storiaTokens?.expires_at ?? null;

      return {
        portal,
        connection: {
          exists: Boolean(row),
          status: derivePortalConnectionStatus({
            definition: portal,
            externalAccountId: row?.external_account_id ?? null,
            hasPortalCredential: Boolean(row?.portal_credentials_encrypted),
            hasHabitooKey: portalKeys.some((k) => k.status === "active"),
            lastError,
            testedOk: row?.status === "connected",
            hasOAuthTokens: Boolean(row?.portal_credentials_encrypted),
          }),

          direction: row?.direction ?? portal.directions[0] ?? "habitoo_to_portal",
          authenticationMode: row?.authentication_mode ?? portal.authentication[0] ?? "none",
          externalAccountId: row?.external_account_id ?? null,
          hasPortalCredential: Boolean(row?.portal_credentials_encrypted),
          endpointUrl:
            typeof settings["endpoint_url"] === "string" ? String(settings["endpoint_url"]) : null,
          allowLiveRequests: settings["allow_live"] === true,
          activated: row?.activated === true,
          lastSyncAt: row?.last_sync_at ?? null,
          lastSyncStatus: row?.last_sync_status ?? null,
          lastSyncError: lastError,
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
          published: portalListings.filter(
            (l) => l.status === "published" || l.status === "updated",
          ).length,
          failed: portalListings.filter((l) => l.status === "error").length,
          pending: portalListings.filter((l) => l.status === "pending").length,
        },
        eligibleProperties: eligible.count ?? 0,
        feedUrl: portal.id === "imove" ? withImoveKey(`${imoveFeedUrl}.json`) : genericFeedUrl,
        feedUrlCsv: portal.id === "imove" ? withImoveKey(`${imoveFeedUrl}.csv`) : null,
        // Portal care primește datele DOAR prin feed (fără operații de scriere).
        feedOnly:
          portal.capabilities.includes("feed_pull") &&
          !portal.capabilities.includes("publish_listing"),
        feed:
          portal.id === "imove"
            ? {
                ok: true,
                apiVersion: "habitoo-imove-feed/1.0",
                properties: imoveFeed.listings.length,
                agents: null,
                selected: imoveFeed.selected,
                excluded: imoveFeed.excluded.length,
              }
            : {
                ok: feedProperties.status === 200 && feedAgents.status === 200,
                apiVersion: feedProperties.apiVersion,
                properties: feedProperties.total,
                agents: feedAgents.total,
                selected: null,
                excluded: null,
              },
        oauth: portal.authentication.includes("oauth")
          ? {
              appConfigured: storiaAppReady,
              connected: Boolean(row?.portal_credentials_encrypted),
              expiresAt: oauthExpiresAt,
              expired: oauthExpiresAt ? new Date(oauthExpiresAt).getTime() <= Date.now() : false,
              canRefresh: oauthMeta?.has_refresh_token ?? Boolean(storiaTokens?.refresh_token),
              connectedAt: oauthMeta?.connected_at ?? null,
              refreshedAt: oauthMeta?.refreshed_at ?? null,
            }
          : null,
      };
    });
  });

const saveSchema = z.object({
  organizationId: z.string().uuid(),
  portalId: z.string().min(1).max(40),
  externalAccountId: z.string().trim().max(200).optional(),
  credential: z.string().trim().min(1).max(500).optional(),
  endpointUrl: z.string().trim().max(300).optional(),
});

/**
 * Superadmin decide explicit dacă portalul este ACTIVAT pentru agenție.
 * Un singur comutator: activarea pornește și trimiterile reale către portal
 * (`settings.allow_live`), iar dezactivarea le oprește. Nu există stare în care
 * portalul este activat dar nu trimite.
 */
export async function applyPortalActivationForOrg(input: {
  organizationId: string;
  portalId: string;
  activated: boolean;
  actorId: string;
}) {
  const { organizationId, activated, actorId } = input;
  const definition = getPortalDefinition(input.portalId);
  if (!definition) throw new Error("Portal necunoscut.");

  const admin = await loadAdmin();
  const { data: existing } = await admin
    .from("portal_connections")
    .select("settings")
    .eq("organization_id", organizationId)
    .eq("portal", definition.id)
    .maybeSingle();
  const settings = {
    ...((existing?.settings ?? {}) as Record<string, unknown>),
    allow_live: activated,
  };
  const { error } = await admin.from("portal_connections").upsert(
    {
      organization_id: organizationId,
      portal: definition.id,
      activated,
      settings: settings as never,
      updated_by: actorId,
      created_by: actorId,
    } as never,
    { onConflict: "organization_id,portal" },
  );
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    actor_id: actorId,
    action: activated ? "portal.activated_for_org" : "portal.deactivated_for_org",
    entity: "portal_connections",
    new_values: { portal: definition.id, activated, allow_live: activated },
    created_by: actorId,
  } as never);

  // Activarea directă rezolvă automat o cerere în așteptare a agenției,
  // ca să nu rămână orfană în lista Superadminului.
  if (activated) {
    const { data: pending } = await admin
      .from("portal_activation_requests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("portal", definition.id)
      .eq("status", "pending")
      .maybeSingle();
    if (pending) {
      await admin
        .from("portal_activation_requests")
        .update({
          status: "approved",
          resolved_by: actorId,
          resolved_at: new Date().toISOString(),
        } as never)
        .eq("id", pending.id);
      await admin.from("audit_logs").insert({
        organization_id: organizationId,
        actor_id: actorId,
        action: "portal.activation_request_approved",
        entity: "portal_activation_requests",
        entity_id: pending.id,
        old_values: { status: "pending" },
        new_values: { status: "approved", portal: definition.id, via: "portal_activation" },
        created_by: actorId,
      } as never);
    }
  }

  await logOperation({
    organizationId,
    portal: definition.id,
    operation: activated ? "activate_org" : "deactivate_org",
    success: true,
    actorId,
  });

  return { ok: true as const, activated };
}

export const setPortalActivation = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        portalId: z.string().min(1).max(40),
        activated: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    return applyPortalActivationForOrg({
      organizationId,
      portalId: data.portalId,
      activated: data.activated,
      actorId: context.userId,
    });
  });

export const savePortalConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");
    if (definition.status !== "available")
      throw new Error("Integrarea cu acest portal nu este încă disponibilă.");

    const admin = await loadAdmin();
    const { encryptPortalCredential } = await import("@/lib/portals/crypto.server");
    const { row } = await buildContext(organizationId, definition);
    const settings = { ...((row?.settings ?? {}) as Record<string, unknown>) };
    if (data.endpointUrl !== undefined) {
      if (data.endpointUrl) settings["endpoint_url"] = data.endpointUrl;
      else delete settings["endpoint_url"];
    }
    // Trimiterile reale nu au comutator separat: urmează mereu activarea.
    settings["allow_live"] = row?.activated === true;

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
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid(), portalId: z.string().min(1).max(40) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
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
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
      })
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
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid(), portalId: z.string().min(1).max(40) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    const { portalRateLimited } = await import("@/lib/portals/rate-limit.server");
    if (portalRateLimited("test", `${organizationId}|${data.portalId}`)) {
      return { ok: false as const, code: "RATE_LIMIT", message: PORTAL_ERROR_MESSAGE.RATE_LIMIT };
    }

    const { getPortalAdapter } = await import("@/lib/portals/adapters/index.server");
    const adapter = getPortalAdapter(definition.id);
    if (!adapter) {
      return {
        ok: false as const,
        code: "NOT_SUPPORTED",
        message: PORTAL_ERROR_MESSAGE.NOT_SUPPORTED,
      };
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
      ...(result.ok ? {} : { httpStatus: result.httpStatus ?? null }),
      ...(result.ok ? {} : { portalResponse: result.portalResponse ?? null }),
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
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        portalId: z.string().min(1).max(40),
        label: z.string().trim().min(2).max(80),
        scopes: z
          .array(z.enum(["feed:read", "agents:read", "leads:write"]))
          .min(1)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");
    // Habitoo emite chei DOAR pentru portalurile care declară acest model.
    // Ex. iMove emite propria cheie API, pe care utilizatorul o salvează la noi.
    if (!definition.authentication.includes("habitoo_api_key")) {
      throw new Error(
        `${definition.display_name} folosește o cheie API emisă de portal. Salvează cheia primită de la ei în configurarea integrării.`,
      );
    }

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

    // Singura dată când cheia în clar părăsește serverul. Pentru portalurile
    // de tip „pull” trimitem și linkul complet de feed, construit server-side
    // din definiția portalului; el nu mai poate fi reconstituit ulterior,
    // fiindcă în DB rămân doar hash-ul și prefixul.
    return {
      ok: true as const,
      key: generated.key,
      prefix: generated.prefix,
      feedUrl: portalPublicFeedUrl(definition.id, generated.key),
    };
  });

export const revokePortalApiKey = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid(), keyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
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
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
      })
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
  organizationId: z.string().uuid(),
  portalId: z.string().min(1).max(40),
  propertyId: z.string().uuid(),
  action: z.enum(["publish", "update", "withdraw"]),
});

export type ListingActionResult =
  | {
      ok: true;
      live: boolean;
      detail: string | null;
      status: string;
      externalId: string | null;
      feedVisible: boolean | null;
      processed: number | null;
      message: string | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
      /** Retry-After propagat mai departe (retrimiterea portofoliului îl folosește). */
      retryAfterMs?: number | null;
      /** Statusul HTTP real întors de portal, când există (404 = ofertă necunoscută). */
      httpStatus?: number | null;
    };

/**
 * Salvează motivul EXACT al unui eșec (eroarea portalului, limita de locuri,
 * conflictul de versiune, validarea locală) pe rândurile citite de matricea
 * din interfață. Fără aceasta, blocările dinaintea apelului către portal erau
 * vizibile doar în notificarea temporară, iar după reîmprospătare agentul
 * vedea doar o stare generică, fără motiv.
 */
export async function persistListingFailure(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  input: {
    organizationId: string;
    portalKey: string;
    propertyId: string;
    actorId: string | null;
    message: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from("portal_publications")
    .update({
      status: "error",
      last_error: input.message,
      last_synced_at: now,
      updated_by: input.actorId,
    } as never)
    .eq("organization_id", input.organizationId)
    .eq("property_id", input.propertyId)
    .eq("portal_key", input.portalKey);
  await admin
    .from("portal_listings")
    .update({
      status: "error",
      last_error: input.message,
      last_sync_at: now,
      updated_by: input.actorId,
    } as never)
    .eq("organization_id", input.organizationId)
    .eq("portal", input.portalKey)
    .eq("property_id", input.propertyId);
}

/**
 * Nucleul unei operațiuni pe o ofertă. Refolosit de acțiunea individuală și de
 * publicarea per proprietate pe portalurile selectate. Nu conține verificări de
 * permisiuni: apelantul trebuie să valideze deja agenția și rolul.
 */
export async function executeListingAction(input: {
  organizationId: string;
  /** `null` pentru acțiuni automate (fără actor uman), ex. republicarea la expirare. */
  actorId: string | null;
  portalId: string;
  propertyId: string;
  action: "publish" | "update" | "withdraw";
  /** Eticheta din jurnal; implicit acțiunea. Automatizările folosesc alt nume. */
  operationLabel?: string;
  /**
   * Automatizările (republicare la expirare, retrimiterea portofoliului La Cheie)
   * NU consumă locuri noi: oferta era deja selectată, deci locul e deja ocupat.
   */
  skipSlotCheck?: boolean;
  /**
   * Motivul salvat la o retragere reușită. Implicit „user” (cerută de un om).
   * Retragerile provocate de reducerea locurilor folosesc „slot_limit” și nu se
   * retrimit niciodată automat.
   */
  withdrawReason?: string;
}): Promise<ListingActionResult> {
  const { organizationId, actorId, portalId, propertyId, action } = input;
  const definition = getPortalDefinition(portalId);
  if (!definition) throw new Error("Portal necunoscut.");
  if (definition.status !== "available") {
    return {
      ok: false as const,
      code: "NOT_SUPPORTED",
      message: PORTAL_ERROR_MESSAGE.NOT_SUPPORTED,
    };
  }

  const admin = await loadAdmin();
  const { data: property } = await admin
    .from("properties")
    .select("id, publish_status, status, deleted_at")
    .eq("id", propertyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!property) throw new Error("Proprietatea nu a fost găsită.");

  const { isPropertyFeedEligible } = await import("@/lib/site-feed/mapper");
  if (action !== "withdraw" && !isPropertyFeedEligible(property as never)) {
    const message = "Oferta nu este publicabilă: verifică statusul și publicarea pe site.";
    await persistListingFailure(admin, {
      organizationId,
      portalKey: definition.id,
      propertyId,
      actorId,
      message: `${definition.display_name}: ${message}`,
    });
    return {
      ok: false as const,
      code: "VALIDATION_ERROR",
      message,
    };
  }

  /**
   * Validare pre-publicare: câmpurile obligatorii declarate de portal sunt
   * verificate pe datele reale ÎNAINTE de orice apel către portal. Fără ele,
   * portalul ar răspunde oricum cu eroare de validare, iar agentul nu ar ști
   * ce lipsește.
   */
  if (action !== "withdraw") {
    const { portalRequirementReport } = await import("@/lib/portals/requirements.server");
    const { requirementBlockMessage } = await import("@/lib/portals/requirements");
    const report = await portalRequirementReport(admin, organizationId, propertyId, definition.id);
    if (report && !report.ok) {
      const message = requirementBlockMessage(definition.display_name, report);
      await logOperation({
        organizationId,
        portal: definition.id,
        operation: input.operationLabel ?? action,
        success: false,
        errorCode: "VALIDATION_ERROR",
        errorMessage: message,
        propertyId,
        actorId,
      });
      await persistListingFailure(admin, {
        organizationId,
        portalKey: definition.id,
        propertyId,
        actorId,
        message,
      });
      return { ok: false as const, code: "VALIDATION_ERROR", message };
    }
  }

  /**
   * Locuri de publicare: doar trecerea „neselectat → selectat” consumă un loc.
   * Locul este al AGENTULUI RESPONSABIL, nu al celui care apasă butonul, deci
   * verificarea se aplică și pentru administratorul agenției sau superadmin.
   */
  if (action === "publish" && !input.skipSlotCheck) {
    const { ensurePortalSlotAvailable } = await import("@/lib/portals/slots.server");
    const guard = await ensurePortalSlotAvailable(admin, {
      organizationId,
      portalKey: definition.id,
      portalName: definition.display_name,
      propertyId,
      actorId,
    });
    if (!guard.ok) {
      await logOperation({
        organizationId,
        portal: definition.id,
        operation: input.operationLabel ?? action,
        success: false,
        errorCode: "SLOT_LIMIT",
        errorMessage: guard.message,
        propertyId,
        actorId,
      });
      await persistListingFailure(admin, {
        organizationId,
        portalKey: definition.id,
        propertyId,
        actorId,
        message: guard.message,
      });
      return { ok: false as const, code: "VALIDATION_ERROR", message: guard.message };
    }
  }

  const { portalRateLimited } = await import("@/lib/portals/rate-limit.server");
  if (portalRateLimited(action, `${organizationId}|${portalId}`)) {
    // Limita noastră locală se resetează la un minut: retrimiterea amână atât.
    const message = `${definition.display_name}: ${PORTAL_ERROR_MESSAGE.RATE_LIMIT}`;
    await persistListingFailure(admin, {
      organizationId,
      portalKey: definition.id,
      propertyId,
      actorId,
      message,
    });
    return {
      ok: false as const,
      code: "RATE_LIMIT",
      message,
      retryAfterMs: 60_000,
    };
  }

  const { getPortalAdapter } = await import("@/lib/portals/adapters/index.server");
  const adapter = getPortalAdapter(definition.id);
  /**
   * Portalurile care primesc datele DOAR prin feed (ex. Properstar) nu au
   * operații de scriere: retragerea reală înseamnă scoaterea ofertei din feed.
   * O marcăm aici, ca retragerea automată la reducerea locurilor să se încheie
   * definitiv, în loc să eșueze la infinit cu „operație nesuportată”.
   */
  const feedOnlyPortal =
    definition.capabilities.includes("feed_pull") &&
    !definition.capabilities.includes("publish_listing");
  if (!adapter && feedOnlyPortal && action === "withdraw") {
    const nowIso = new Date().toISOString();
    await admin
      .from("portal_publications")
      .update({
        enabled: false,
        status: "disabled",
        withdrawn_at: nowIso,
        withdraw_reason: input.withdrawReason ?? "user",
        last_synced_at: nowIso,
        last_error: null,
        updated_by: actorId,
      } as never)
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .eq("portal_key", definition.id);
    await logOperation({
      organizationId,
      portal: definition.id,
      operation: input.operationLabel ?? action,
      success: true,
      propertyId,
      actorId,
    });
    return { ok: true as const, code: null, message: null, data: { externalId: null } } as never;
  }
  if (!adapter) {
    return {
      ok: false as const,
      code: "NOT_SUPPORTED",
      message: PORTAL_ERROR_MESSAGE.NOT_SUPPORTED,
    };
  }

  const { data: listing } = await admin
    .from("portal_listings")
    .select("id, external_id")
    .eq("organization_id", organizationId)
    .eq("portal", definition.id)
    .eq("property_id", propertyId)
    .maybeSingle();

  /**
   * O excepție aruncată aici (token expirat, portal nereachable, validare care
   * aruncă în loc să returneze) NU trebuie să iasă din funcție: altfel oprea
   * întreaga buclă de publicare și celelalte portaluri nu mai erau procesate.
   * O normalizăm în același rezultat de eșec, ca să se scrie și starea în
   * `portal_listings` / `portal_publications`.
   */
  const { toPortalError } = await import("@/lib/portals/errors");
  let result: Awaited<ReturnType<typeof adapter.publishListing>>;
  try {
    const { ctx } = await buildContext(organizationId, definition);
    const ref = { propertyId, externalId: listing?.external_id ?? null };
    result =
      action === "publish"
        ? await adapter.publishListing(ctx, ref)
        : action === "update"
          ? await adapter.updateListing(ctx, ref)
          : await adapter.withdrawListing(ctx, ref);
  } catch (error) {
    const portalError = toPortalError(error);
    result = {
      ok: false as const,
      code: portalError.code,
      message: `${definition.display_name}: ${portalError.message}`,
      detail: portalError.detail,
    };
  }

  const now = new Date().toISOString();
  // Portalurile asincrone (Storia) raportează starea reală a anunțului: un
  // anunț acceptat, dar aflat în validare, nu trebuie marcat „publicat”.
  const fallbackStatus =
    action === "withdraw" ? "withdrawn" : action === "update" ? "updated" : "published";
  /**
   * `portal_listings.status` are un vocabular fix în baza de date: o valoare
   * proprie portalului (ex. „online”) ar respinge salvarea și starea reală a
   * anunțului s-ar pierde în silence.
   */
  const ALLOWED_STATUS = ["pending", "published", "updated", "withdrawn", "error"];
  const reported = result.ok ? (result.data.portalStatus ?? null) : null;
  const status = !result.ok
    ? "error"
    : reported && ALLOWED_STATUS.includes(reported)
      ? reported
      : fallbackStatus;
  /**
   * Explicația arătată agentului. O operațiune poate reuși tehnic, dar
   * portalul să raporteze o stare problematică (ex. anunț respins la
   * moderare): fără mesajul portalului, interfața ar arăta un badge „Eroare”
   * fără nicio explicație.
   */
  const errorMessage = !result.ok
    ? result.message
    : status === "error"
      ? (result.data.message ?? "Portalul a raportat o problemă la acest anunț.")
      : null;
  /**
   * Motivul retragerii: o retragere cerută de un om rămâne „user” și nu se
   * retrimite automat niciodată; o publicare/actualizare reușită îl șterge.
   * Automatizările pot cere alt motiv (ex. reducerea locurilor de publicare).
   */
  const withdrawReasonPatch = !result.ok
    ? {}
    : action === "withdraw"
      ? { withdraw_reason: input.withdrawReason ?? "user" }
      : { withdraw_reason: null };

  const patch: Record<string, unknown> = {
    organization_id: organizationId,
    portal: definition.id,
    property_id: propertyId,
    status,
    last_sync_at: now,
    last_error: errorMessage,
    ...(result.ok && result.data.externalId ? { external_id: result.data.externalId } : {}),
    // Linkul public al anunțului, când portalul îl întoarce (generic, nu doar Storia).
    ...(result.ok && result.data.publicUrl ? { public_url: result.data.publicUrl } : {}),

    ...(result.ok && action === "publish" ? { published_at: now } : {}),
    ...withdrawReasonPatch,
    updated_by: actorId,
  };
  if (listing)
    await admin
      .from("portal_listings")
      .update(patch as never)
      .eq("id", listing.id);
  else await admin.from("portal_listings").insert({ ...patch, created_by: actorId } as never);

  // Starea selecției per proprietate reflectă rezultatul ultimei operațiuni,
  // fără să dubleze informația din `portal_listings`.
  // Starea selecției per proprietate reflectă rezultatul ultimei operațiuni,
  // fără să dubleze informația din `portal_listings`. La o retragere reușită
  // intenția trebuie să dispară, altfel checkbox-ul rămâne bifat pentru o
  // ofertă retrasă și republicarea nu mai are ce tranziție să declanșeze.
  await admin
    .from("portal_publications")
    .update({
      ...(result.ok && action === "withdraw"
        ? { enabled: false, withdrawn_at: now }
        : action === "publish" || action === "update"
          ? { withdrawn_at: null }
          : {}),

      status: status === "error" ? "error" : action === "withdraw" ? "disabled" : "synced",
      last_synced_at: now,
      last_error: errorMessage,
      external_ref: result.ok && result.data.externalId ? result.data.externalId : null,
      ...withdrawReasonPatch,
      updated_by: actorId,
    } as never)
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .eq("portal_key", definition.id);

  await logOperation({
    organizationId,
    portal: definition.id,
    operation: input.operationLabel ?? action,
    success: result.ok,
    errorCode: result.ok ? null : result.code,
    errorMessage: result.ok ? null : result.message,
    // Și la succes: statusul HTTP și corpul răspunsului (sanitizate), ca
    // jurnalul să dovedească ce a confirmat portalul, nu doar ce a refuzat.
    httpStatus: result.ok ? (result.data.httpStatus ?? null) : (result.httpStatus ?? null),
    portalResponse: result.ok
      ? (result.data.portalResponse ?? null)
      : (result.portalResponse ?? null),
    ...(result.ok && result.data.externalId ? { externalId: result.data.externalId } : {}),
    propertyId,
    actorId,
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
    : {
        ok: false as const,
        code: result.code,
        message: result.message,
        retryAfterMs: result.retryAfterMs ?? null,
        httpStatus: result.httpStatus ?? null,
      };
}

/**
 * Retragerea reală a unei oferte de pe un portal, folosită de TOATE căile de
 * deselectare (lista de proprietăți, formularul proprietății, arhivarea).
 *
 * Regula: dacă portalul suportă trimiteri (push) ȘI există o listare cu
 * `external_id`, se apelează efectiv portalul, indiferent de statusul local
 * („pending", „error" etc. nu mai sunt motive să sărim apelul). O retragere
 * sărită NU este raportată niciodată ca succes de retragere.
 */
export async function performPortalWithdraw(input: {
  organizationId: string;
  actorId: string | null;
  portalId: string;
  propertyId: string;
  /** Listarea deja citită, dacă apelantul o are (evită un query în plus). */
  externalId?: string | null;
}): Promise<{
  ok: boolean;
  /** Portalul a fost apelat efectiv. */
  attempted: boolean;
  /** Portalul nu cunoștea oferta (404): nu era nimic de retras. */
  alreadyWithdrawn: boolean;
  message: string;
}> {
  const definition = getPortalDefinition(input.portalId);
  if (!definition) throw new Error("Portal necunoscut.");
  const name = definition.display_name;
  const pushSupported = definition.capabilities.includes("publish_listing");

  if (!pushSupported) {
    return {
      ok: true,
      attempted: false,
      alreadyWithdrawn: false,
      message: `${name}: oferta nu mai apare în feed și portalul o arhivează.`,
    };
  }

  let externalId = input.externalId ?? null;
  if (input.externalId === undefined) {
    const admin = await loadAdmin();
    const { data: listing } = await admin
      .from("portal_listings")
      .select("external_id")
      .eq("organization_id", input.organizationId)
      .eq("portal", definition.id)
      .eq("property_id", input.propertyId)
      .maybeSingle();
    externalId = listing?.external_id ?? null;
  }

  if (!externalId) {
    return {
      ok: true,
      attempted: false,
      alreadyWithdrawn: true,
      message: `${name}: oferta nu a fost niciodată trimisă, deci nu era nimic de retras.`,
    };
  }

  const res = await executeListingAction({
    organizationId: input.organizationId,
    actorId: input.actorId,
    portalId: definition.id,
    propertyId: input.propertyId,
    action: "withdraw",
  });

  if (res.ok) {
    return {
      ok: true,
      attempted: true,
      alreadyWithdrawn: false,
      message: `${name}: oferta a fost retrasă.`,
    };
  }

  // 404 = portalul nu cunoaște oferta: o considerăm deja retrasă.
  if (res.httpStatus === 404 || res.code === "NOT_FOUND") {
    return {
      ok: true,
      attempted: true,
      alreadyWithdrawn: true,
      message: `${name}: oferta nu mai există la portal, deci era deja retrasă.`,
    };
  }

  return {
    ok: false,
    attempted: true,
    alreadyWithdrawn: false,
    message: res.message.startsWith(name) ? res.message : `${name}: ${res.message}`,
  };
}

export const runPortalListingAction = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => listingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { organizationId, superadmin, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    if (!superadmin && !(await activatedPortalIds(organizationId)).has(data.portalId)) {
      throw new Error("Acest portal nu este activat pentru agenția ta.");
    }
    return await executeListingAction({
      organizationId,
      actorId: context.userId,
      portalId: data.portalId,
      propertyId: data.propertyId,
      action: data.action,
    });
  });

export const getPropertyPortalStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { organizationId, superadmin, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const visiblePortals = superadmin ? null : await activatedPortalIds(organizationId);
    const admin = await loadAdmin();
    const [{ data: listings }, { data: connections }] = await Promise.all([
      admin
        .from("portal_listings")
        .select("portal, status, external_id, public_url, published_at, last_sync_at, last_error")
        .eq("organization_id", organizationId)

        .eq("property_id", data.propertyId),
      admin
        .from("portal_connections")
        .select("portal, status")
        .eq("organization_id", organizationId),
    ]);

    const { getPortalAdapter } = await import("@/lib/portals/adapters/index.server");
    const available = PORTALS.filter(
      (p) =>
        p.status === "available" &&
        !isPortalCovered(p.id) &&
        (visiblePortals === null || visiblePortals.has(p.id)),
    );

    return await Promise.all(
      available.map(async (portal) => {
        const listing = (listings ?? []).find((l) => l.portal === portal.id) ?? null;
        const connection = (connections ?? []).find((c) => c.portal === portal.id) ?? null;
        const adapter = getPortalAdapter(portal.id);

        // Statusul REAL: pe lângă ce am salvat noi, ce vede efectiv portalul.
        let diagnostics: PortalListingDiagnosticsView | null = null;
        if (adapter?.diagnoseListing) {
          diagnostics = await cachedListingDiagnostics({
            organizationId,
            portal,
            propertyId: data.propertyId,
            externalId: listing?.external_id ?? null,
            run: async () => {
              const { ctx } = await buildContext(organizationId, portal);
              const result = await adapter.diagnoseListing!(ctx, {
                propertyId: data.propertyId,
                externalId: listing?.external_id ?? null,
              });
              if (!result.ok) return null;
              return {
                feedVisible: result.data.feedVisible,
                externalId: result.data.externalId,
                offerUrl: result.data.offerUrl,
                agentName: result.data.agentName,
                images: result.data.images,
                notes: result.data.notes,
                stateKnown: result.data.stateKnown ?? false,
                portalState: result.data.portalState ?? null,
                urlConfirmed: result.data.urlConfirmed ?? result.data.offerUrl !== null,
                offerUrlSuppressed: result.data.offerUrlSuppressed === true,
                subscriptionActive: result.data.subscriptionActive ?? null,
              };
            },
          });
        }

        /**
         * Linkul salvat NU se pierde din cauza unei verificări care n-a reușit.
         * Îl considerăm dispărut doar când portalul spune explicit că anunțul
         * este în altă stare decât `online`.
         */
        const offline = portalSaysOffline(diagnostics);
        const storedUrl = resolveListingPublicUrl(diagnostics, listing?.public_url ?? null);
        // Ce se AFIȘEAZĂ poate fi mai puțin decât ce se PĂSTREAZĂ: un cont fără
        // abonament ascunde linkul, dar nu îl șterge din bază.
        const publicUrl = displayListingPublicUrl(diagnostics, listing?.public_url ?? null);
        if (listing) {
          await syncListingPublicUrl({
            organizationId,
            portalId: portal.id,
            propertyId: data.propertyId,
            stored: listing.public_url ?? null,
            resolved: storedUrl,
            portalSaysOffline: offline,
          });
        }

        return {
          portalId: portal.id,
          portalName: portalDisplayName(portal.id),
          connected: connection?.status === "connected" || connection?.status === "ready",
          status: listing?.status ?? "not_published",
          externalId: listing?.external_id ?? diagnostics?.externalId ?? null,
          publicUrl,

          publishedAt: listing?.published_at ?? null,
          lastSyncAt: listing?.last_sync_at ?? null,
          lastError: listing?.last_error ?? null,
          diagnostics,
        };
      }),
    );
  });

/**
 * Validare pre-publicare pentru toate portalurile vizibile agenției: lista
 * câmpurilor obligatorii, ce lipsește acum și ce câmpuri suplimentare se
 * trimit dacă există date. Aceleași reguli blochează publicarea.
 */
export const getPropertyPortalRequirements = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { organizationId, superadmin, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const visiblePortals = superadmin ? null : await activatedPortalIds(organizationId);
    const admin = await loadAdmin();
    const { loadRequirementSubject } = await import("@/lib/portals/requirements.server");
    const { validatePortalRequirements } = await import("@/lib/portals/requirements");
    const subject = await loadRequirementSubject(admin, organizationId, data.propertyId);
    if (!subject) throw new Error("Proprietatea nu a fost găsită.");

    return PORTALS.filter(
      (p) =>
        p.status === "available" &&
        !isPortalCovered(p.id) &&
        (visiblePortals === null || visiblePortals.has(p.id)),
    ).map((portal) => ({
      portalName: portalDisplayName(portal.id),
      ...validatePortalRequirements(portal.id, subject),
    }));
  });

/** Ultimele operații de portal pentru o proprietate accesibilă utilizatorului curent. */
export const getPropertyPortalJournal = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PropertyPortalJournalItem[]> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const admin = await loadAdmin();
    const { data: rows } = await admin
      .from("portal_operation_logs")
      .select(
        "id, portal, operation, success, error_code, error_message, property_id, created_at, portal_response",
      )
      .eq("organization_id", organizationId)
      .eq("property_id", data.propertyId)
      .order("created_at", { ascending: false })
      .limit(8);

    return (rows ?? []).map((row) => {
      const response =
        row.portal_response && typeof row.portal_response === "object" && !Array.isArray(row.portal_response)
          ? (row.portal_response as Record<string, unknown>)
          : null;
      const rawRequestId = response?.request_id ?? response?.requestId;
      return {
        id: row.id,
        portal: row.portal,
        operation: row.operation,
        success: row.success,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        propertyId: row.property_id,
        createdAt: row.created_at,
        requestId: typeof rawRequestId === "string" ? rawRequestId : null,
      };
    });
  });

export const getPortalLogs = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<PortalLogItem[]> => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const admin = await loadAdmin();
    const { data: rows } = await admin
      .from("portal_operation_logs")
      .select("id, portal, operation, success, error_code, error_message, property_id, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    return (rows ?? []).map((row) => ({
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

/* ------------------------------------------------------------------------- */
/* Selecția de portaluri per proprietate (lista de proprietăți)              */
/* ------------------------------------------------------------------------- */

type PortalSelectionState =
  | "coming_soon"
  | "not_configured"
  | "not_selected"
  | "selected"
  | "syncing"
  | "published"
  | "in_feed"
  | "error"
  | "expired"
  | "withdrawn";

export type PropertyPortalCell = {
  portalId: string;
  portalName: string;
  logo: string;
  availability: "available" | "coming_soon" | "disabled";
  /** Utilizatorul a cerut publicarea pe acest portal (portal_publications.enabled). */
  selected: boolean;
  /** Conexiunea agenției există și poate publica. */
  configured: boolean;
  /** Starea reală a ofertei pe portal (portal_listings.status). */
  listingStatus: string;
  state: PortalSelectionState;
  /** Portalul acceptă trimiteri directe (publicare/retragere) din Habitoo. */
  pushSupported: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  externalId: string | null;
  /** Linkul public al anunțului pe portal, dacă portalul îl întoarce. */
  publicUrl: string | null;
  /**
   * Anunțul este trimis la portal, dar pagina publică nu funcționează din
   * motive de cont (ex. Imobiliare.ro fără abonament activ). Se afișează
   * avertismentul, nu linkul.
   */
  publicWarning: string | null;
};

export type PropertyPortalMatrix = {
  canManage: boolean;
  properties: Record<string, PropertyPortalCell[]>;
};

function deriveState(input: {
  availability: "available" | "coming_soon" | "disabled";
  configured: boolean;
  selected: boolean;
  listingStatus: string;
  publicationStatus: string | null;
  /** Portalul acceptă trimiteri directe; altfel oferta circulă doar prin feed. */
  pushSupported: boolean;
  /** Doar pentru portalurile de tip feed: oferta este publicabilă în feed. */
  feedEligible: boolean;
}): PortalSelectionState {
  if (input.availability !== "available") return "coming_soon";
  if (!input.pushSupported) {
    // Portal de tip feed: nu există „trimitere”. Starea reală este prezența în feed.
    if (!input.configured) return "not_configured";
    if (!input.selected) return "not_selected";
    return input.feedEligible ? "in_feed" : "error";
  }
  if (input.listingStatus === "error" || input.publicationStatus === "error") return "error";
  if (input.listingStatus === "published" || input.listingStatus === "updated") return "published";
  if (input.listingStatus === "pending") return "syncing";
  if (input.listingStatus === "expired") return "expired";
  if (input.listingStatus === "withdrawn") return "withdrawn";
  if (!input.configured) return "not_configured";
  return input.selected ? "selected" : "not_selected";
}

/**
 * Starea contului Imobiliare.ro pentru agenție (abonament). Memorată 10 minute
 * în adaptor; orice eroare înseamnă „nu știm”, niciodată „inactiv”.
 */
export async function imobiliareAccountForOrg(
  organizationId: string,
): Promise<ImobiliareAccountState | null> {
  const portal = PORTALS.find((p) => p.id === "imobiliare_ro");
  if (!portal) return null;
  try {
    const { ctx } = await buildContext(organizationId, portal);
    const { readImobiliareAccountState } = await import("@/lib/portals/adapters/imobiliare.server");
    return await readImobiliareAccountState(ctx);
  } catch {
    return null;
  }
}

/** Starea abonamentului Imobiliare.ro, pentru panoul de portaluri. */
export const getImobiliareAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const account = await imobiliareAccountForOrg(organizationId);
    return {
      isSubscriptionActive: account?.isSubscriptionActive ?? null,
      subscriptionStatus: account?.subscriptionStatus ?? null,
      subscriptionType: account?.subscriptionType ?? null,
      listingOnlineCount: account?.listingOnlineCount ?? null,
    };
  });

export const getPropertiesPortalMatrix = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        propertyIds: z.array(z.string().uuid()).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PropertyPortalMatrix> => {
    const ctxAuth = context as unknown as AuthContext;
    const { organizationId, superadmin } = await resolvePublishingOrg(ctxAuth, data.organizationId);
    const canManage = true;
    // Agenția vede DOAR portalurile activate pentru ea de Superadmin.
    const visiblePortals = superadmin ? null : await activatedPortalIds(organizationId);
    if (data.propertyIds.length === 0) return { canManage, properties: {} };

    const admin = await loadAdmin();
    const [
      { data: publications },
      { data: listings },
      { data: connections },
      { data: propertyRows },
      { data: activeKeys },
    ] = await Promise.all([
      admin
        .from("portal_publications")
        .select(
          "property_id, portal_key, enabled, status, last_synced_at, last_error, external_ref",
        )
        .eq("organization_id", organizationId)
        .in("property_id", data.propertyIds),
      admin
        .from("portal_listings")
        .select("property_id, portal, status, last_sync_at, last_error, external_id, public_url")
        .eq("organization_id", organizationId)
        .in("property_id", data.propertyIds),
      admin
        .from("portal_connections")
        .select("portal, status")
        .eq("organization_id", organizationId),
      admin
        .from("properties")
        .select("id, publish_status, status, deleted_at")
        .eq("organization_id", organizationId)
        .in("id", data.propertyIds),
      admin
        .from("portal_api_keys")
        .select("portal")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
    ]);
    // Portalurile de tip feed nu au conexiune cu credențiale: sunt „configurate”
    // când există o cheie Habitoo activă cu care pot citi feedul.
    const keyedPortals = new Set((activeKeys ?? []).map((k) => k.portal));

    const imobiliareVisible = visiblePortals === null || visiblePortals.has("imobiliare_ro");
    const imobiliareConnected = (connections ?? []).some(
      (c) => c.portal === "imobiliare_ro" && (c.status === "connected" || c.status === "ready"),
    );
    const imobiliareAccount =
      imobiliareVisible && imobiliareConnected
        ? await imobiliareAccountForOrg(organizationId)
        : null;
    const imobiliareNoSubscription = subscriptionInactive(imobiliareAccount);

    const { isPropertyFeedEligible } = await import("@/lib/site-feed/mapper");
    const eligibleById = new Map(
      (propertyRows ?? []).map((row) => [row.id, isPropertyFeedEligible(row as never)]),
    );

    const properties: Record<string, PropertyPortalCell[]> = {};
    for (const propertyId of data.propertyIds) {
      const feedEligible = eligibleById.get(propertyId) === true;
      properties[propertyId] = PORTALS.filter(
        (portal) =>
          !isPortalCovered(portal.id) && (visiblePortals === null || visiblePortals.has(portal.id)),
      ).map((portal) => {
        const pub = (publications ?? []).find(
          (p) => p.property_id === propertyId && p.portal_key === portal.id,
        );
        const listing = (listings ?? []).find(
          (l) => l.property_id === propertyId && l.portal === portal.id,
        );
        const connection = (connections ?? []).find((c) => c.portal === portal.id);
        const pushSupported = portal.capabilities.includes("publish_listing");
        const connectionReady =
          connection?.status === "connected" || connection?.status === "ready";
        const configured =
          portal.status === "available" &&
          (pushSupported ? connectionReady : keyedPortals.has(portal.id) || connectionReady);

        const listingStatus = listing?.status ?? "not_published";
        const state = deriveState({
          availability: portal.status,
          configured,
          selected: pub?.enabled === true,
          listingStatus,
          publicationStatus: pub?.status ?? null,
          pushSupported,
          feedEligible,
        });
        return {
          portalId: portal.id,
          portalName: portalDisplayName(portal.id),
          logo: portal.logo,
          availability: portal.status,
          selected: pub?.enabled === true,
          configured,
          listingStatus,
          state,
          pushSupported,
          lastSyncAt: listing?.last_sync_at ?? pub?.last_synced_at ?? null,
          lastError:
            !pushSupported && state === "error"
              ? "Oferta este selectată, dar nu intră în feed: verifică statusul și publicarea pe site."
              : (listing?.last_error ?? pub?.last_error ?? null),
          externalId: listing?.external_id ?? pub?.external_ref ?? null,
          publicUrl: listing?.public_url ?? null,
          publicWarning:
            portal.id === "imobiliare_ro" && imobiliareNoSubscription && listing?.public_url
              ? IMOBILIARE_NO_SUBSCRIPTION_MESSAGE
              : null,
        };
      });
    }
    return { canManage, properties };
  });

/** Activează/dezactivează publicarea unei proprietăți pe un portal. */
export const setPropertyPortalSelection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        propertyId: z.string().uuid(),
        portalId: z.string().min(1).max(40),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { organizationId, superadmin, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");
    if (!superadmin && !(await activatedPortalIds(organizationId)).has(definition.id)) {
      throw new Error("Acest portal nu este activat pentru agenția ta.");
    }
    if (definition.status !== "available") {
      return {
        ok: false as const,
        code: "NOT_SUPPORTED",
        message: `Integrarea ${definition.display_name} nu este încă disponibilă.`,
      };
    }

    const admin = await loadAdmin();
    const { data: property } = await admin
      .from("properties")
      .select("id")
      .eq("id", data.propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!property) throw new Error("Proprietatea nu a fost găsită.");

    const { data: listing } = await admin
      .from("portal_listings")
      .select("status, external_id")
      .eq("organization_id", organizationId)
      .eq("portal", definition.id)
      .eq("property_id", data.propertyId)
      .maybeSingle();

    // Selectarea consumă un loc de publicare al agentului responsabil.
    if (data.enabled) {
      const { ensurePortalSlotAvailable } = await import("@/lib/portals/slots.server");
      const guard = await ensurePortalSlotAvailable(admin, {
        organizationId,
        portalKey: definition.id,
        portalName: definition.display_name,
        propertyId: data.propertyId,
        actorId: context.userId,
      });
      if (!guard.ok) {
        return { ok: false as const, code: "SLOT_LIMIT", message: guard.message };
      }
    }

    const { error } = await admin.from("portal_publications").upsert(
      {
        organization_id: organizationId,
        property_id: data.propertyId,
        portal_key: definition.id,
        enabled: data.enabled,
        status: data.enabled ? "pending" : "disabled",
        // Momentul retragerii: portalurile de tip feed (ex. Properstar) trebuie
        // să anunțe oferta retrasă câteva zile înainte să dispară din feed.
        withdrawn_at: data.enabled ? null : new Date().toISOString(),
        updated_by: context.userId,
        created_by: context.userId,
      } as never,
      { onConflict: "organization_id,property_id,portal_key" },
    );

    if (error) throw new Error(error.message);

    // Feedul Properstar se citește dintr-un cache per agenție: îl golim imediat,
    // altfel portalul ar mai vedea câteva minute selecția veche.
    if (definition.id === "properstar") {
      const { clearProperstarCache } = await import("@/lib/portals/properstar/cache");
      clearProperstarCache(organizationId);
    }

    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      action: data.enabled ? "portal.selection_enabled" : "portal.selection_disabled",
      entity: "portal_publications",
      entity_id: data.propertyId,
      new_values: { portal_key: definition.id, enabled: data.enabled },
      created_by: context.userId,
    } as never);

    await logOperation({
      organizationId,
      portal: definition.id,
      operation: data.enabled ? "select" : "deselect",
      success: true,
      propertyId: data.propertyId,
      actorId: context.userId,
    });

    /**
     * Deselectarea RETRAGE efectiv oferta de pe portal. Înainte, serverul doar
     * schimba bifa și întorcea `needsWithdraw`, iar anunțul rămânea live.
     */
    if (!data.enabled) {
      const withdrawal = await performPortalWithdraw({
        organizationId,
        actorId: context.userId,
        portalId: definition.id,
        propertyId: data.propertyId,
        externalId: listing?.external_id ?? null,
      });
      return {
        ok: withdrawal.ok,
        enabled: false as const,
        withdrawn: withdrawal.ok,
        attempted: withdrawal.attempted,
        alreadyWithdrawn: withdrawal.alreadyWithdrawn,
        message: withdrawal.message,
      };
    }

    return {
      ok: true as const,
      enabled: true as const,
      withdrawn: false,
      attempted: false,
      alreadyWithdrawn: false,
      message: null,
    };
  });

/**
 * Publică sau actualizează o proprietate DOAR pe portalurile selectate pentru ea.
 * `mode: "update"` atinge exclusiv portalurile unde oferta este deja publicată.
 */
export const publishPropertyToSelectedPortals = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        propertyId: z.string().uuid(),
        mode: z.enum(["publish", "update"]).default("publish"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { organizationId, superadmin, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const allowedPortals = superadmin ? null : await activatedPortalIds(organizationId);
    const admin = await loadAdmin();

    const [{ data: publications }, { data: listings }] = await Promise.all([
      admin
        .from("portal_publications")
        .select("portal_key")
        .eq("organization_id", organizationId)
        .eq("property_id", data.propertyId)
        .eq("enabled", true),
      admin
        .from("portal_listings")
        .select("portal, status")
        .eq("organization_id", organizationId)
        .eq("property_id", data.propertyId),
    ]);

    const selected = (publications ?? [])
      .map((p) => p.portal_key)
      .filter((key) => {
        if (allowedPortals !== null && !allowedPortals.has(key)) return false;
        const definition = getPortalDefinition(key);
        // Portalurile de tip feed (ex. iMove) nu primesc trimiteri: selecția
        // este suficientă, oferta apare la următoarea citire a feedului.
        return (
          definition?.status === "available" && definition.capabilities.includes("publish_listing")
        );
      });

    if (selected.length === 0) {
      const feedOnly = (publications ?? []).some((p) => {
        const definition = getPortalDefinition(p.portal_key);
        return (
          definition?.status === "available" &&
          !definition.capabilities.includes("publish_listing") &&
          definition.capabilities.includes("feed_pull")
        );
      });
      return {
        ok: false as const,
        code: feedOnly ? "FEED_ONLY" : "NO_SELECTION",
        message: feedOnly
          ? "Portalurile selectate preiau ofertele automat din feed. Nu este nevoie de nicio trimitere."
          : "Nu ai selectat niciun portal disponibil pentru această proprietate.",
        results: [] as {
          portalId: string;
          portalName: string;
          ok: boolean;
          message: string | null;
        }[],
      };
    }

    const results: { portalId: string; portalName: string; ok: boolean; message: string | null }[] =
      [];
    for (const portalId of selected) {
      const published = (listings ?? []).some(
        (l) => l.portal === portalId && (l.status === "published" || l.status === "updated"),
      );
      if (data.mode === "update" && !published) continue;
      const action = published ? "update" : "publish";
      const result = await executeListingAction({
        organizationId,
        actorId: context.userId,
        portalId,
        propertyId: data.propertyId,
        action,
      });
      results.push({
        portalId,
        portalName: portalDisplayName(portalId),
        ok: result.ok,
        message: result.ok ? (result.message ?? result.detail) : result.message,
      });
    }

    if (results.length === 0) {
      return {
        ok: false as const,
        code: "NOTHING_TO_UPDATE",
        message: "Oferta nu este publicată pe niciun portal selectat.",
        results,
      };
    }

    return { ok: results.every((r) => r.ok), code: null, message: null, results };
  });

/* ------------------------------------------------------------------------- */
/* Portaluri de tip feed: previzualizarea exactă a ce vede portalul          */
/* ------------------------------------------------------------------------- */

export type PortalFeedPreview = {
  ok: boolean;
  portalId: string;
  portalName: string;
  feedUrl: string;
  /** Câte oferte sunt selectate pentru portal. */
  selected: number;
  /** Câte oferte intră efectiv în feed. */
  valid: number;
  /** Primele oferte, exact în forma trimisă portalului. */
  sample: ImoveListing[];
  /** Oferte selectate dar excluse, cu motivul exact. */
  excluded: {
    propertyId: string;
    reference: string | null;
    title: string | null;
    reasons: string[];
  }[];
  warnings: { externalId: string; messages: string[] }[];
  /** Portalul are o cheie activă cu care poate citi feedul. */
  hasActiveKey: boolean;
};

/**
 * Previzualizare read-only a feedului unui portal de tip feed (dry-run):
 * nu trimite nimic, nu modifică nimic, doar arată ce ar citi portalul acum.
 */
export const previewPortalFeed = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        portalId: z.string().min(1).max(40),
        limit: z.number().int().min(1).max(10).default(3),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PortalFeedPreview> => {
    const organizationId = await requireSuperadminOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");
    if (definition.id !== "imove") {
      throw new Error(
        "Previzualizarea de feed este disponibilă doar pentru portalurile de tip feed.",
      );
    }

    const feedUrl = await feedUrlForOrg(definition.id);
    const { buildImoveFeed } = await import("@/lib/portals/imove/feed.server");
    const build = await buildImoveFeed({ organizationId, requestUrl: feedUrl, perPage: 500 });

    const admin = await loadAdmin();
    // Pentru iMove cheia este emisă de portal și salvată criptat de utilizator.
    const { data: connRow } = await admin
      .from("portal_connections")
      .select("portal_credentials_encrypted")
      .eq("organization_id", organizationId)
      .eq("portal", definition.id)
      .maybeSingle();
    const hasCredential = Boolean(connRow?.portal_credentials_encrypted);

    await logOperation({
      organizationId,
      portal: definition.id,
      operation: "feed_preview",
      success: true,
      actorId: context.userId,
    });

    return {
      ok: true,
      portalId: definition.id,
      portalName: portalDisplayName(definition.id),
      feedUrl,
      selected: build.selected,
      valid: build.listings.length,
      sample: build.listings.slice(0, data.limit),
      excluded: build.excluded,
      warnings: build.warnings,
      hasActiveKey: hasCredential,
    };
  });

/* ------------------------------------------------------------------------- */
/* Sursa de adevăr: checkbox-urile din pagina de editare a proprietății      */
/* ------------------------------------------------------------------------- */

export type PortalSelectionOutcome = {
  portalId: string;
  portalName: string;
  /** Ce s-a executat efectiv pentru portal. */
  action: "none" | "selected" | "published" | "updated" | "withdrawn" | "blocked";
  ok: boolean;
  message: string | null;
};

const applySelectionSchema = z.object({
  organizationId: z.string().uuid().optional(),
  propertyId: z.string().uuid(),
  selections: z
    .array(z.object({ portalId: z.string().min(1).max(40), enabled: z.boolean() }))
    .max(40),
  /** Sincronizează portalurile rămase bifate (după salvarea datelor proprietății). */
  syncExisting: z.boolean().default(false),
});

/**
 * Aplică intenția utilizatorului (checkbox-uri) asupra portalurilor unei proprietăți.
 *
 * Diferența față de starea salvată decide acțiunea reală:
 *  - false → true  = publicare (portal push) / intrare în feed (portal feed);
 *  - true  → true  = actualizare doar dacă s-a cerut sincronizarea;
 *  - true  → false = retragere (portal push) / ieșire din feed (portal feed);
 *  - false → false = nimic.
 *
 * Eșecul unui portal nu anulează operațiunile reușite pe celelalte.
 */
export const applyPropertyPortalSelection = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) => applySelectionSchema.parse(input))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; results: PortalSelectionOutcome[] }> => {
      const { organizationId, superadmin, agentOnly } = await resolvePublishingOrg(
        context as unknown as AuthContext,
        data.organizationId,
      );
      await assertPortalPropertyAccess({
        organizationId,
        propertyId: data.propertyId,
        agentOnly,
        userId: context.userId,
      });
      return await applyPortalSelectionForOrg({
        organizationId,
        superadmin,
        actorId: context.userId,
        data,
      });
    },
  );

/**
 * Nucleul publicării pe portalurile selectate, fără verificări de permisiuni
 * (apelantul le-a făcut deja). Separat de server function ca să fie testabil.
 */
export async function applyPortalSelectionForOrg(input: {
  organizationId: string;
  superadmin: boolean;
  actorId: string;
  data: z.infer<typeof applySelectionSchema>;
}): Promise<{ ok: boolean; results: PortalSelectionOutcome[] }> {
  {
    const { organizationId, superadmin, actorId, data } = input;
    const allowedPortals = superadmin ? null : await activatedPortalIds(organizationId);
    const admin = await loadAdmin();

    const { data: property } = await admin
      .from("properties")
      .select("id")
      .eq("id", data.propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!property) throw new Error("Proprietatea nu a fost găsită.");

    const [
      { data: publications },
      { data: listings },
      { data: connections },
      { data: activeKeys },
    ] = await Promise.all([
      admin
        .from("portal_publications")
        .select("portal_key, enabled")
        .eq("organization_id", organizationId)
        .eq("property_id", data.propertyId),
      admin
        .from("portal_listings")
        .select("portal, status, external_id")

        .eq("organization_id", organizationId)
        .eq("property_id", data.propertyId),
      admin
        .from("portal_connections")
        .select("portal, status")
        .eq("organization_id", organizationId),
      admin
        .from("portal_api_keys")
        .select("portal")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
    ]);
    const keyedPortals = new Set((activeKeys ?? []).map((k) => k.portal));

    const results: PortalSelectionOutcome[] = [];

    for (const wanted of data.selections) {
      const definition = getPortalDefinition(wanted.portalId);
      if (!definition) continue;
      /**
       * Fiecare portal se procesează INDEPENDENT. Fără acest try/catch, o
       * excepție dintr-un adaptor (validare Storia, token expirat, portal
       * nereachable) ieșea din buclă și oprea publicarea pe toate celelalte
       * portaluri, iar utilizatorul vedea un singur mesaj generic de eroare.
       */
      try {
        // Portalurile neactivate pentru agenție sunt respinse, nu ignorate silențios.
        if (allowedPortals !== null && !allowedPortals.has(definition.id)) {
          if (wanted.enabled) {
            const message = `${definition.display_name} nu este activat pentru agenția ta.`;
            await persistListingFailure(admin, {
              organizationId,
              portalKey: definition.id,
              propertyId: data.propertyId,
              actorId,
              message,
            });
            results.push({
              portalId: definition.id,
              portalName: portalDisplayName(definition.id),
              action: "blocked",
              ok: false,
              message,
            });
          }
          continue;
        }
        const name = definition.display_name;
        const previous =
          (publications ?? []).find((p) => p.portal_key === definition.id)?.enabled === true;

        if (definition.status !== "available") {
          if (wanted.enabled) {
            results.push({
              portalId: definition.id,
              portalName: name,
              action: "blocked",
              ok: false,
              message: `Integrarea ${name} nu este încă disponibilă.`,
            });
          }
          continue;
        }

        const pushSupported = definition.capabilities.includes("publish_listing");
        const connStatus = (connections ?? []).find((c) => c.portal === definition.id)?.status;
        const connectionReady = connStatus === "connected" || connStatus === "ready";
        // Portalurile de tip feed sunt „configurate” fie prin cheia Habitoo activă,
        // fie prin cheia API a portalului salvată pe conexiune (ex. iMove).
        const configured = pushSupported
          ? connectionReady
          : keyedPortals.has(definition.id) || connectionReady;

        const published = (listings ?? []).some(
          (l) => l.portal === definition.id && (l.status === "published" || l.status === "updated"),
        );

        // A. false → false: nimic.
        if (!wanted.enabled && !previous) continue;

        // Locuri de publicare: doar trecerea neselectat → selectat consumă un loc.
        if (wanted.enabled && !previous) {
          const { ensurePortalSlotAvailable } = await import("@/lib/portals/slots.server");
          const guard = await ensurePortalSlotAvailable(admin, {
            organizationId,
            portalKey: definition.id,
            portalName: name,
            propertyId: data.propertyId,
            actorId,
          });
          if (!guard.ok) {
            await persistListingFailure(admin, {
              organizationId,
              portalKey: definition.id,
              propertyId: data.propertyId,
              actorId,
              message: guard.message,
            });
            results.push({
              portalId: definition.id,
              portalName: name,
              action: "blocked",
              ok: false,
              message: guard.message,
            });
            continue;
          }
        }

        // Intenția se salvează întotdeauna când se schimbă.
        if (wanted.enabled !== previous) {
          const { error } = await admin.from("portal_publications").upsert(
            {
              organization_id: organizationId,
              property_id: data.propertyId,
              portal_key: definition.id,
              enabled: wanted.enabled,
              status: wanted.enabled ? "pending" : "disabled",
              withdrawn_at: wanted.enabled ? null : new Date().toISOString(),
              updated_by: actorId,
              created_by: actorId,
            } as never,

            { onConflict: "organization_id,property_id,portal_key" },
          );
          if (error) throw new Error(error.message);

          // Feedul Properstar se citește dintr-un cache per agenție: îl golim imediat,
          // altfel portalul ar mai vedea câteva minute selecția veche.
          if (definition.id === "properstar") {
            const { clearProperstarCache } = await import("@/lib/portals/properstar/cache");
            clearProperstarCache(organizationId);
          }

          await admin.from("audit_logs").insert({
            organization_id: organizationId,
            actor_id: actorId,
            action: wanted.enabled ? "portal.selection_enabled" : "portal.selection_disabled",
            entity: "portal_publications",
            entity_id: data.propertyId,
            old_values: { portal: definition.id, selected: previous },
            new_values: { portal: definition.id, selected: wanted.enabled },
            created_by: actorId,
          } as never);
          await logOperation({
            organizationId,
            portal: definition.id,
            operation: wanted.enabled ? "select" : "deselect",
            success: true,
            propertyId: data.propertyId,
            actorId,
          });
        }

        /**
         * D. true → false: retragere reală. Se apelează portalul de fiecare dată
         * când portalul suportă push ȘI există o listare cu `external_id`,
         * indiferent de statusul local („pending", „error" nu mai sar apelul).
         */
        if (!wanted.enabled) {
          const listingRow = (listings ?? []).find((l) => l.portal === definition.id);
          const withdrawal = await performPortalWithdraw({
            organizationId,
            actorId,
            portalId: definition.id,
            propertyId: data.propertyId,
            externalId:
              (listingRow as { external_id?: string | null } | undefined)?.external_id ?? null,
          });
          results.push({
            portalId: definition.id,
            portalName: name,
            action: withdrawal.ok ? "withdrawn" : "blocked",
            ok: withdrawal.ok,
            message: withdrawal.message,
          });
          continue;
        }

        // Portal neconfigurat: intenția rămâne salvată, statusul rămâne nepublicat.
        if (!configured) {
          const message = superadmin
            ? `${name} nu este configurat. Configurează portalul din Superadmin → Portaluri.`
            : `${name} nu este încă pregătit de administratorul platformei.`;
          await persistListingFailure(admin, {
            organizationId,
            portalKey: definition.id,
            propertyId: data.propertyId,
            actorId,
            message,
          });
          results.push({
            portalId: definition.id,
            portalName: name,
            action: "blocked",
            ok: false,
            message,
          });
          continue;
        }

        // Portalurile de tip feed nu primesc trimiteri: selecția este suficientă.
        if (!pushSupported) {
          results.push({
            portalId: definition.id,
            portalName: name,
            action: previous ? "none" : "selected",
            ok: true,
            message: previous ? null : `${name}: oferta intră în feed.`,
          });
          continue;
        }

        // B. true → true: actualizare doar când s-a cerut sincronizarea, ÎNSĂ
        // doar dacă oferta este efectiv publicată pe portal. Dacă listarea este
        // retrasă sau nu a plecat niciodată cu succes, bifa rămasă activă trebuie
        // să declanșeze o publicare, nu „nicio schimbare".
        if (previous && published && !data.syncExisting) {
          results.push({
            portalId: definition.id,
            portalName: name,
            action: "none",
            ok: true,
            message: null,
          });
          continue;
        }

        const action = published ? "update" : "publish";
        const res = await executeListingAction({
          organizationId,
          actorId,
          portalId: definition.id,
          propertyId: data.propertyId,
          action,
        });
        results.push({
          portalId: definition.id,
          portalName: name,
          action: res.ok ? (action === "update" ? "updated" : "published") : "blocked",
          ok: res.ok,
          message: res.ok
            ? `${name}: ${action === "update" ? "actualizat" : "publicat"}.`
            : res.message.startsWith(name)
              ? res.message
              : `${name}: ${res.message}`,
        });
      } catch (error) {
        // Izolare per portal: un portal cu probleme nu oprește procesarea celorlalte.
        const { toPortalError } = await import("@/lib/portals/errors");
        const portalError = toPortalError(error);
        const reason = error instanceof Error ? error.message : portalError.message;
        results.push({
          portalId: definition.id,
          portalName: portalDisplayName(definition.id),
          action: "blocked",
          ok: false,
          message: `${definition.display_name}: ${reason}`,
        });
        await logOperation({
          organizationId,
          portal: definition.id,
          operation: "apply_selection",
          success: false,
          errorCode: portalError.code,
          errorMessage: reason,
          propertyId: data.propertyId,
          actorId,
        }).catch(() => undefined);
      }
    }

    return { ok: results.every((r) => r.ok), results };
  }
}

/** Agențiile disponibile în panoul Superadmin → Portaluri. */
export const listPortalOrganizations = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<{ id: string; name: string }[]> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { data } = await admin.from("organizations").select("id, name").order("name");
    return (data ?? []).map((o) => ({ id: o.id, name: o.name }));
  });

/** Ofertele unei agenții, pentru selecția de portaluri din Superadmin. */
export const listOrgPropertiesForPortals = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(50).default(25),
      })
      .parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ id: string; title: string; city: string | null }[]> => {
      const organizationId = await requireSuperadminOrg(
        context as unknown as AuthContext,
        data.organizationId,
      );
      const admin = await loadAdmin();
      let query = admin
        .from("properties")
        .select("id, title, city")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(data.limit);
      const search = data.search?.replace(/[%,()]/g, " ").trim();
      if (search) query = query.ilike("title", `%${search}%`);
      const { data: rows } = await query;
      return (rows ?? []).map((r) => ({ id: r.id, title: r.title, city: r.city ?? null }));
    },
  );

/* ------------------------------------------------------------------------- */
/* Backfill linkuri publice Storia                                           */
/* ------------------------------------------------------------------------- */

/**
 * Citește `/meta` pentru anunțurile Storia existente și salvează linkul public
 * (`state.url`) plus slugul extras din el (`ADSLUG:<slug>`), care este puntea
 * sigură dintre notificările de mesaje și oferta din CRM.
 *
 * Necesar o singură dată pentru anunțurile publicate înainte de introducerea
 * coloanei `public_url`; ulterior linkul se salvează automat la publicare și
 * din notificările de ciclu de viață. Superadmin-only.
 */
export const backfillStoriaPublicUrls = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { parseAdvertRefs, readAdvertMeta, storiaAdSlugFromUrl, withStoriaAdSlug } =
      await import("@/lib/portals/storia/adverts.server");

    let query = admin
      .from("portal_listings")
      .select("id, organization_id, property_id, external_id, public_url")
      .eq("portal", "storia");
    if (data.organizationId) query = query.eq("organization_id", data.organizationId);
    const { data: rows } = await query;

    const results: {
      propertyId: string;
      url: string | null;
      adSlug: string | null;
      externalId: string | null;
    }[] = [];

    for (const row of rows ?? []) {
      const refs = parseAdvertRefs(row.external_id);
      let url: string | null = null;
      for (const uuid of [refs.sale, refs.rent].filter(Boolean) as string[]) {
        const meta = await readAdvertMeta(row.organization_id, uuid).catch(() => null);
        if (meta?.url) {
          url = meta.url;
          break;
        }
      }
      const adSlug = storiaAdSlugFromUrl(url);
      const externalId = adSlug ? withStoriaAdSlug(row.external_id, adSlug) : row.external_id;
      if (url) {
        await admin
          .from("portal_listings")
          .update({ public_url: url, external_id: externalId } as never)
          .eq("id", row.id);
      }
      results.push({ propertyId: row.property_id, url, adSlug, externalId });
    }

    return { checked: (rows ?? []).length, results };
  });

/* ------------------------------------------------------------------------- */
/* Backfill linkuri publice Imobiliare.ro                                    */
/* ------------------------------------------------------------------------- */

export type ImobiliareBackfillRow = {
  propertyId: string;
  externalId: string | null;
  reference: string | null;
  state: string | null;
  url: string | null;
  /** Ce s-a întâmplat cu rândul: salvat, neschimbat sau motivul refuzului. */
  outcome: "saved" | "unchanged" | "draft" | "no_reference" | "error";
  message: string | null;
};

/**
 * Citește la portal fiecare anunț Imobiliare.ro cu referință salvată și scrie
 * `public_url` DOAR când portalul raportează `state = "online"`. Un anunț în
 * ciornă nu produce nicio scriere: nu ștergem și nu inventăm linkuri.
 *
 * `data.id` (id-ul numeric al anunțului la portal) NU are coloană în
 * `portal_listings`; nu adăugăm una, doar îl raportăm ca lipsă.
 * Superadmin-only.
 */
export const backfillImobiliarePublicUrls = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { parseImobiliareReferences } = await import("@/lib/portals/imobiliare/references");
    const { readImobiliareListingState } = await import("@/lib/portals/adapters/imobiliare.server");
    const definition = getPortalDefinition("imobiliare_ro");
    if (!definition) throw new Error("Portal necunoscut.");

    let query = admin
      .from("portal_listings")
      .select("id, organization_id, property_id, external_id, public_url")
      .eq("portal", "imobiliare_ro")
      .not("external_id", "is", null);
    if (data.organizationId) query = query.eq("organization_id", data.organizationId);
    const { data: rows } = await query;

    const contexts = new Map<string, Awaited<ReturnType<typeof buildContext>>["ctx"]>();
    const results: ImobiliareBackfillRow[] = [];

    for (const row of rows ?? []) {
      const reference = parseImobiliareReferences(row.external_id)[0] ?? null;
      if (!reference) {
        results.push({
          propertyId: row.property_id,
          externalId: row.external_id,
          reference: null,
          state: null,
          url: null,
          outcome: "no_reference",
          message: "Rândul nu are o referință utilizabilă la portal.",
        });
        continue;
      }
      let ctx = contexts.get(row.organization_id);
      if (!ctx) {
        ctx = (await buildContext(row.organization_id, definition)).ctx;
        contexts.set(row.organization_id, ctx);
      }
      const state = await readImobiliareListingState(ctx, reference);
      if (!state.ok) {
        results.push({
          propertyId: row.property_id,
          externalId: row.external_id,
          reference,
          state: null,
          url: null,
          outcome: "error",
          message: state.message,
        });
        continue;
      }
      if (state.state !== "online" || !state.url) {
        // Ciornă sau lipsă adresă: nu scriem nimic, nici ștergere.
        results.push({
          propertyId: row.property_id,
          externalId: row.external_id,
          reference,
          state: state.state,
          url: state.url,
          outcome: "draft",
          message: `Portalul raportează starea „${state.state ?? "necunoscută"}”: nu s-a scris nimic.`,
        });
        continue;
      }
      if (!shouldSaveBackfilledUrl(state.state, state.url, row.public_url ?? null)) {
        results.push({
          propertyId: row.property_id,
          externalId: row.external_id,
          reference,
          state: state.state,
          url: state.url,
          outcome: "unchanged",
          message: null,
        });
        continue;
      }
      await admin
        .from("portal_listings")
        .update({ public_url: state.url } as never)
        .eq("id", row.id);
      results.push({
        propertyId: row.property_id,
        externalId: row.external_id,
        reference,
        state: state.state,
        url: state.url,
        outcome: "saved",
        message: null,
      });
    }

    return {
      checked: (rows ?? []).length,
      saved: results.filter((r) => r.outcome === "saved").length,
      /** Nu există coloană pentru id-ul numeric al anunțului la portal. */
      numericPortalIdColumn: null as null,
      results,
    };
  });

/**
 * AUTO-PRELUNGIRE STORIA — suprascriere per proprietate.
 *
 * `properties.storia_auto_renew`:
 *   null  = moștenește setarea agenției (`organizations.storia_auto_republish`);
 *   true  = auto-prelungire activată explicit pentru acest anunț;
 *   false = auto-prelungire dezactivată explicit pentru acest anunț.
 *
 * Setarea globală de agenție rămâne implicitul pentru proprietățile fără
 * suprascriere; cele două coexistă.
 */
export type StoriaAutoRenewRow = {
  /** null = moștenește; altfel suprascrierea explicită. */
  override: boolean | null;
  /** Setarea agenției, folosită când nu există suprascriere. */
  agencyDefault: boolean;
  /** Valoarea efectivă rezultată. */
  effective: boolean;
};

export const getPropertyStoriaAutoRenew = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<StoriaAutoRenewRow> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const admin = await loadAdmin();
    const [{ data: property }, { data: org }] = await Promise.all([
      admin
        .from("properties")
        .select("id, storia_auto_renew")
        .eq("id", data.propertyId)
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin
        .from("organizations")
        .select("storia_auto_republish")
        .eq("id", organizationId)
        .maybeSingle(),
    ]);
    if (!property) throw new Error("Proprietatea nu a fost găsită.");
    const agencyDefault = org?.storia_auto_republish === true;
    const override = (property as { storia_auto_renew: boolean | null }).storia_auto_renew ?? null;
    return { override, agencyDefault, effective: override ?? agencyDefault };
  });

export const setPropertyStoriaAutoRenew = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        propertyId: z.string().uuid(),
        /** null = revine la setarea agenției. */
        override: z.boolean().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { organizationId, agentOnly } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    await assertPortalPropertyAccess({
      organizationId,
      propertyId: data.propertyId,
      agentOnly,
      userId: context.userId,
    });
    const admin = await loadAdmin();
    const { error } = await admin
      .from("properties")
      .update({ storia_auto_renew: data.override } as never)
      .eq("id", data.propertyId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
