import { agencyLogoFeedUrl, httpsUrlOrNull } from "@/lib/site-feed/mapper";
import { CRM_URL } from "@/lib/host";
import { incompleteFeedResponse, readCompleteRows } from "@/lib/site-feed/complete-read.server";
/**
 * Indexul ClickImob (server-only):
 *   GET /api/public/feed/clickimob/index/{CLICKIMOB_INDEX_KEY}.json
 *
 * Paralel cu conexiunea ClickImob existentă (cheie Habitoo per agenție), pe
 * care nu o atinge. Agențiile cu conexiune pe agenție sunt excluse, ca să nu
 * existe anunțuri duble. Starea de index e în `portal_index_state` (portal =
 * clickimob); Properstar își păstrează tabelul lui.
 */
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import { feedRequestRateLimited, logFeedAccess } from "@/lib/site-feed/auth.server";
import { properstarEntityId } from "@/lib/portals/properstar/mapper";
import {
  indexPresence,
  isProperstarActive,
  nextIndexState,
  type ProperstarIndexState,
} from "@/lib/portals/properstar/index-feed";
import {
  CLICKIMOB_INDEX_HEADERS,
  INDEX_PORTALS,
  type IndexPortal,
  clickimobAgencyContact,
  clickimobFeedToken,
  indexFeedPath,
  indexXmlUrl,
  verifyClickimobIndexKey,
  type ClickimobIndex,
  type ClickimobIndexAgency,
  type ClickimobOrgRow,
} from "./index-feed";

export const CLICKIMOB_PORTAL = "clickimob";
export const CLICKIMOB_INDEX_LOG_PREFIX = "clickimob_index";

export type ClickimobIndexedAgency = Omit<ClickimobIndexAgency, "feed">;

export type ClickimobIndexDeps = {
  indexKey: () => string | undefined;
  authorize?: (portal: IndexPortal, key: string) => Promise<string | null>;
  listAgencies: (now: Date) => Promise<ClickimobIndexedAgency[]>;
  log: typeof logFeedAccess;
  rateLimited: (request: Request) => boolean;
};

export type ClickimobSourceData = {
  orgs: (ClickimobOrgRow & { id: string; status: string | null; archived_at: string | null })[];
  connections: {
    organization_id: string;
    activated: boolean | null;
    updated_at: string | null;
  }[];
  selectedOrgs: string[];
  states: (ProperstarIndexState & { organization_id: string })[];
};

export type ClickimobStateChange = ProperstarIndexState & { organization_id: string };

/** Logică pură de selecție; întoarce și schimbările de stare de salvat. */
export function selectClickimobAgencies(
  src: ClickimobSourceData,
  now: Date,
): { agencies: ClickimobIndexedAgency[]; changes: ClickimobStateChange[] } {
  const connByOrg = new Map(src.connections.map((c) => [c.organization_id, c]));
  const stateByOrg = new Map(src.states.map((s) => [s.organization_id, s]));
  const selected = new Set(src.selectedOrgs);

  const agencies: ClickimobIndexedAgency[] = [];
  const changes: ClickimobStateChange[] = [];
  for (const org of src.orgs) {
    const connection = connByOrg.get(org.id) ?? null;
    const previous = stateByOrg.get(org.id) ?? null;
    const active = isProperstarActive(org, connection);
    const hints = [org.archived_at, connection && !connection.activated ? connection.updated_at : null];
    const next = nextIndexState(previous, active, now, hints);
    const changed =
      next &&
      (next.active ||
        !previous ||
        previous.active !== next.active ||
        previous.inactive_since !== next.inactive_since);
    if (next && changed) changes.push({ organization_id: org.id, ...next });
    const presence = indexPresence(next, now);
    if (presence === "gone" || !selected.has(org.id)) continue;
    agencies.push({
      id: properstarEntityId("hb", org.id),
      ...clickimobAgencyContact(org),
      status: presence,
      inactive_since: presence === "grace" ? (next?.inactive_since ?? null) : null,
      updated_at: new Date(org.updated_at).toISOString(),
    });
  }
  return { agencies, changes };
}

export async function listClickimobIndexedAgencies(now: Date): Promise<ClickimobIndexedAgency[]> {
  return listPortalIndexedAgencies(now, "clickimob");
}

export async function listPortalIndexedAgencies(now: Date, portal: IndexPortal): Promise<ClickimobIndexedAgency[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [orgs, connections, pubs, states] = await Promise.all([
    readCompleteRows((from, to) => supabaseAdmin
      .from("organizations")
      .select(
        "id, status, archived_at, name, legal_name, cui, email, phone, city, logo_url, logo_path, material_address, material_email, material_phone, material_website, updated_at",
      ).order("id").range(from, to)),
    readCompleteRows((from, to) => supabaseAdmin
      .from("portal_connections")
      .select("organization_id, activated, updated_at")
      .eq("portal", portal).order("organization_id").range(from, to)),
    readCompleteRows((from, to) => supabaseAdmin
      .from("portal_publications")
      .select("organization_id")
      .eq("portal_key", portal)
      .eq("enabled", true).order("organization_id").order("property_id").range(from, to)),
    readCompleteRows((from, to) => supabaseAdmin
      .from("portal_index_state")
      .select("organization_id, active, last_active_at, inactive_since")
      .eq("portal", portal).order("organization_id").range(from, to)),
  ]);
  const orgRows = orgs;
  const orgIds = new Set(orgRows.map(o => o.id));
  if (connections.some(c => c.activated && !orgIds.has(c.organization_id)) || pubs.some(p => !orgIds.has(p.organization_id))) {
    throw new Error("Indexed agency could not be read");
  }
  const { agencies, changes } = selectClickimobAgencies(
    {
      orgs: orgRows.map((o) => ({ ...o, logo_url: indexLogoUrl(o) })),
      connections,
      selectedOrgs: pubs.map(p => p.organization_id),
      states,
    },
    now,
  );
  if (changes.length) {
    const { error } = await supabaseAdmin.from("portal_index_state").upsert(
      changes.map((c) => ({ ...c, portal, updated_at: now.toISOString() })),
      { onConflict: "portal,organization_id" },
    );
    if (error) throw new Error("Index state could not be persisted");
  }
  return agencies;
}

export const defaultClickimobIndexDeps: ClickimobIndexDeps = {
  indexKey: () => process.env["CLICKIMOB_INDEX_KEY"],
  authorize: async (portal, key) => (await import("@/lib/site-feed/index-keys.server")).authorizeIndexKey(portal, key),
  listAgencies: listClickimobIndexedAgencies,
  log: logFeedAccess,
  rateLimited: (request) => feedRequestRateLimited(CLICKIMOB_INDEX_LOG_PREFIX, request),
};

export async function handleClickimobIndex(
  request: Request,
  rawKey: string,
  deps: ClickimobIndexDeps = defaultClickimobIndexDeps,
  now: Date = new Date(),
): Promise<Response> {
  return handlePortalIndex(request, rawKey, "clickimob", deps, now);
}

export async function handlePortalIndex(
  request: Request,
  rawKey: string,
  portal: IndexPortal,
  deps: ClickimobIndexDeps = {
    indexKey: () => { const cfg = INDEX_PORTALS[portal as keyof typeof INDEX_PORTALS]; return cfg ? process.env[cfg.secret] : undefined; },
    authorize: async (portal, key) => (await import("@/lib/site-feed/index-keys.server")).authorizeIndexKey(portal, key),
    listAgencies: (now) => listPortalIndexedAgencies(now, portal),
    log: logFeedAccess,
    rateLimited: (request) => feedRequestRateLimited(`${portal}_index`, request),
  },
  now: Date = new Date(),
): Promise<Response> {
  const base = { tokenPrefix: `${portal}_index`, endpoint: `portal.${portal}.index`, method: request.method };
  if (deps.rateLimited(request)) {
    await deps.log({ ...base, organizationId: null, status: 429, detail: "rate_limited" });
    return new Response(null, { status: 429 });
  }
  const key = rawKey.replace(/\.json$/i, "");
  try {
  const { resolveIndexPortal } = await import("@/lib/dynamic-feed-portals.server");
  const config = await resolveIndexPortal(portal);
  if (!config?.active) return new Response(null, { status: 401 });
  const secret = deps.authorize ? await deps.authorize(portal, key) : (verifyClickimobIndexKey(key, deps.indexKey()) ? deps.indexKey() : null);
  if (!secret) {
    await deps.log({ ...base, organizationId: null, status: 401, detail: "unauthorized" });
    return new Response(null, { status: 401 });
  }
    const { baseUrl } = feedUrlsForRequest(new URL(request.url));
    const agencies = await deps.listAgencies(now);
    const body: ClickimobIndex = {
      version: config.version,
      generated_at: now.toISOString(),
      agencies: agencies.map((a) => {
        const token = clickimobFeedToken(a.id, secret, portal, config.prefix);
        const xml = "xmlPath" in config ? `${baseUrl}${config.xmlPath}?token=${encodeURIComponent(token)}` : indexXmlUrl(portal, baseUrl, token);
        return { ...a, feed: { base_url: `${baseUrl}${indexFeedPath(portal)}`, token }, ...(xml ? { kyero_xml_url: xml } : {}) };
      }),
    };
    await deps.log({ ...base, organizationId: null, status: 200, items: body.agencies.length });
    return new Response(JSON.stringify(body), { status: 200, headers: { ...CLICKIMOB_INDEX_HEADERS } });
  } catch (error) {
    console.error(`[${portal}-index] incomplete_inventory`);
    await deps.log({ ...base, organizationId: null, status: 503, detail: "incomplete_inventory" });
    return incompleteFeedResponse();
  }
}

/** Link permanent spre logo (redirect public), nu URL semnat temporar. */
export function indexLogoUrl(o: { id: string; logo_path?: string | null; logo_url?: string | null }): string | null {
  return agencyLogoFeedUrl(o.id, Boolean(o.logo_path?.trim()) || Boolean(httpsUrlOrNull(o.logo_url ?? null)), CRM_URL);
}
