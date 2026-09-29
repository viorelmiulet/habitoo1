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
  CLICKIMOB_INDEX_VERSION,
  clickimobAgencyContact,
  clickimobFeedToken,
  verifyClickimobIndexKey,
  type ClickimobIndex,
  type ClickimobIndexAgency,
  type ClickimobOrgRow,
} from "./index-feed";

export const CLICKIMOB_PORTAL = "clickimob";
export const CLICKIMOB_INDEX_LOG_PREFIX = "clickimob_index";
const ENDPOINT = "portal.clickimob.index";

export type ClickimobIndexedAgency = Omit<ClickimobIndexAgency, "feed">;

export type ClickimobIndexDeps = {
  indexKey: () => string | undefined;
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [orgs, connections, pubs, states] = await Promise.all([
    supabaseAdmin
      .from("organizations")
      .select(
        "id, status, archived_at, name, legal_name, cui, email, phone, city, logo_url, material_address, material_email, material_phone, material_website, updated_at",
      ),
    supabaseAdmin
      .from("portal_connections")
      .select("organization_id, activated, updated_at")
      .eq("portal", CLICKIMOB_PORTAL),
    supabaseAdmin
      .from("portal_publications")
      .select("organization_id")
      .eq("portal_key", CLICKIMOB_PORTAL)
      .eq("enabled", true),
    supabaseAdmin
      .from("portal_index_state")
      .select("organization_id, active, last_active_at, inactive_since")
      .eq("portal", CLICKIMOB_PORTAL),
  ]);
  const firstError = [orgs, connections, pubs, states].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const { agencies, changes } = selectClickimobAgencies(
    {
      orgs: orgs.data ?? [],
      connections: connections.data ?? [],
      selectedOrgs: (pubs.data ?? []).map((p) => p.organization_id),
      states: states.data ?? [],
    },
    now,
  );
  if (changes.length) {
    const { error } = await supabaseAdmin.from("portal_index_state").upsert(
      changes.map((c) => ({ ...c, portal: CLICKIMOB_PORTAL, updated_at: now.toISOString() })),
      { onConflict: "portal,organization_id" },
    );
    if (error) console.error("[clickimob-index] state upsert failed", error.message);
  }
  return agencies;
}

export const defaultClickimobIndexDeps: ClickimobIndexDeps = {
  indexKey: () => process.env["CLICKIMOB_INDEX_KEY"],
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
  const base = { tokenPrefix: CLICKIMOB_INDEX_LOG_PREFIX, endpoint: ENDPOINT, method: request.method };
  if (deps.rateLimited(request)) {
    await deps.log({ ...base, organizationId: null, status: 429, detail: "rate_limited" });
    return new Response(null, { status: 429 });
  }
  const key = rawKey.replace(/\.json$/i, "");
  const secret = deps.indexKey();
  if (!secret || !verifyClickimobIndexKey(key, secret)) {
    await deps.log({ ...base, organizationId: null, status: 401, detail: "unauthorized" });
    return new Response(null, { status: 401 });
  }
  try {
    const { baseUrl } = feedUrlsForRequest(new URL(request.url));
    const agencies = await deps.listAgencies(now);
    const body: ClickimobIndex = {
      version: CLICKIMOB_INDEX_VERSION,
      generated_at: now.toISOString(),
      agencies: agencies.map((a) => ({
        ...a,
        feed: { base_url: `${baseUrl}/api/public/sites/v1`, token: clickimobFeedToken(a.id, secret) },
      })),
    };
    await deps.log({ ...base, organizationId: null, status: 200, items: body.agencies.length });
    return new Response(JSON.stringify(body), { status: 200, headers: { ...CLICKIMOB_INDEX_HEADERS } });
  } catch (error) {
    console.error("[clickimob-index] failed", error);
    await deps.log({ ...base, organizationId: null, status: 500, detail: "internal_error" });
    return new Response(null, { status: 500 });
  }
}
