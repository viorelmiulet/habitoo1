/**
 * Indexul Properstar și feedurile semnate ale agențiilor (server-only).
 *
 *   GET /api/public/feed/properstar/index/{PROPERSTAR_INDEX_KEY}.xml
 *   GET /api/public/feed/properstar/agency/{OfficeId}.xml?sig={HMAC}
 *
 * Fiecare citire se jurnalizează în `site_feed_access_logs` și intră în aceeași
 * limită de cereri ca feedurile existente. Răspunsurile 401 nu au conținut.
 */
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import { feedRequestRateLimited, logFeedAccess } from "@/lib/site-feed/auth.server";
import { buildProperstarFeed, PROPERSTAR_FEED_HEADERS, type ProperstarFeedBuild } from "./feed.server";
import { properstarEntityId } from "./mapper";
import {
  buildDeletedFeedXml,
  buildProperstarIndexXml,
  indexPresence,
  isProperstarActive,
  nextIndexState,
  properstarAgencyFeedUrl,
  verifyIndexKey,
  verifyOfficeSignature,
  type IndexPresence,
  type ProperstarIndexEntry,
  type ProperstarIndexState,
} from "./index-feed";

export const PROPERSTAR_INDEX_LOG_PREFIX = "properstar_index";

export type IndexedAgency = {
  organizationId: string;
  officeId: string;
  officeName: string;
  presence: Exclude<IndexPresence, "gone">;
};

export type IndexDeps = {
  indexKey: () => string | undefined;
  listAgencies: (now: Date) => Promise<IndexedAgency[]>;
  buildFeed: (organizationId: string, requestUrl: URL, now: Date) => Promise<ProperstarFeedBuild>;
  log: typeof logFeedAccess;
  rateLimited: (request: Request) => boolean;
};

/** Agențiile prezente în index (active sau în cele 7 zile de grație). */
export async function listIndexedAgencies(now: Date): Promise<IndexedAgency[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: orgs }, { data: connections }, { data: states }] = await Promise.all([
    supabaseAdmin.from("organizations").select("id, name, status, archived_at"),
    supabaseAdmin
      .from("portal_connections")
      .select("organization_id, activated, updated_at")
      .eq("portal", "properstar"),
    supabaseAdmin
      .from("properstar_index_state")
      .select("organization_id, active, last_active_at, inactive_since"),
  ]);
  const connByOrg = new Map((connections ?? []).map((c) => [c.organization_id, c]));
  const stateByOrg = new Map((states ?? []).map((s) => [s.organization_id, s]));

  const result: IndexedAgency[] = [];
  const changes: (ProperstarIndexState & { organization_id: string; updated_at: string })[] = [];
  for (const org of orgs ?? []) {
    const connection = connByOrg.get(org.id) ?? null;
    const previous = stateByOrg.get(org.id) ?? null;
    const active = isProperstarActive(org, connection);
    const hints = [org.archived_at, connection && !connection.activated ? connection.updated_at : null];
    const next = nextIndexState(previous, active, now, hints);
    if (next && (!previous || previous.active !== next.active || next.active)) {
      // Starea activă își reîmprospătează `last_active_at`; tranziția se salvează o dată.
      if (!previous || previous.active !== next.active || previous.inactive_since !== next.inactive_since || next.active) {
        changes.push({ organization_id: org.id, ...next, updated_at: now.toISOString() });
      }
    }
    const presence = indexPresence(next, now);
    if (presence === "gone") continue;
    result.push({
      organizationId: org.id,
      officeId: properstarEntityId("hb", org.id),
      officeName: org.name ?? "",
      presence,
    });
  }
  if (changes.length) {
    const { error } = await supabaseAdmin
      .from("properstar_index_state")
      .upsert(changes, { onConflict: "organization_id" });
    if (error) console.error("[properstar-index] state upsert failed", error.message);
  }
  return result;
}

export const defaultIndexDeps: IndexDeps = {
  indexKey: () => process.env["PROPERSTAR_INDEX_KEY"],
  listAgencies: listIndexedAgencies,
  buildFeed: (organizationId, requestUrl, now) =>
    buildProperstarFeed({ organizationId, requestUrl, now, useCache: true }),
  log: logFeedAccess,
  rateLimited: (request) => feedRequestRateLimited(PROPERSTAR_INDEX_LOG_PREFIX, request),
};

const EMPTY_401 = () => new Response(null, { status: 401 });

function feedXml(build: ProperstarFeedBuild, presence: IndexedAgency["presence"]): string {
  return presence === "grace" ? buildDeletedFeedXml(build.adverts) : build.xml;
}

export async function handleProperstarIndex(
  request: Request,
  rawKey: string,
  deps: IndexDeps = defaultIndexDeps,
  now: Date = new Date(),
): Promise<Response> {
  const endpoint = "portal.properstar.index";
  const base = { tokenPrefix: PROPERSTAR_INDEX_LOG_PREFIX, endpoint, method: request.method };
  if (deps.rateLimited(request)) {
    await deps.log({ ...base, organizationId: null, status: 429, detail: "rate_limited" });
    return new Response(null, { status: 429 });
  }
  const key = rawKey.replace(/\.xml$/i, "");
  if (!verifyIndexKey(key, deps.indexKey())) {
    await deps.log({ ...base, organizationId: null, status: 401, detail: "unauthorized" });
    return EMPTY_401();
  }
  try {
    const url = new URL(request.url);
    const { baseUrl } = feedUrlsForRequest(url);
    const agencies = await deps.listAgencies(now);
    const entries: ProperstarIndexEntry[] = [];
    for (const agency of agencies) {
      const build = await deps.buildFeed(agency.organizationId, url, now);
      if (!build.adverts.length) continue;
      entries.push({
        officeId: agency.officeId,
        officeName: agency.officeName,
        url: properstarAgencyFeedUrl(baseUrl, agency.officeId, deps.indexKey()!),
        lastUpdate: build.lastModified,
      });
    }
    await deps.log({ ...base, organizationId: null, status: 200, items: entries.length });
    return new Response(buildProperstarIndexXml(entries), {
      status: 200,
      headers: { ...PROPERSTAR_FEED_HEADERS },
    });
  } catch (error) {
    console.error("[properstar-index] failed", error);
    await deps.log({ ...base, organizationId: null, status: 500, detail: "internal_error" });
    return new Response(null, { status: 500 });
  }
}

export async function handleProperstarSignedFeed(
  request: Request,
  rawOfficeId: string,
  deps: IndexDeps = defaultIndexDeps,
  now: Date = new Date(),
): Promise<Response> {
  const endpoint = "portal.properstar.agency_feed";
  const base = { tokenPrefix: PROPERSTAR_INDEX_LOG_PREFIX, endpoint, method: request.method };
  if (deps.rateLimited(request)) {
    await deps.log({ ...base, organizationId: null, status: 429, detail: "rate_limited" });
    return new Response(null, { status: 429 });
  }
  const url = new URL(request.url);
  const officeId = rawOfficeId.replace(/\.xml$/i, "");
  if (!verifyOfficeSignature(officeId, url.searchParams.get("sig"), deps.indexKey())) {
    await deps.log({ ...base, organizationId: null, status: 401, detail: "unauthorized" });
    return EMPTY_401();
  }
  try {
    const agency = (await deps.listAgencies(now)).find((a) => a.officeId === officeId);
    if (!agency) {
      await deps.log({ ...base, organizationId: null, status: 404, detail: "not_indexed" });
      return new Response(null, { status: 404 });
    }
    const build = await deps.buildFeed(agency.organizationId, url, now);
    await deps.log({
      ...base,
      organizationId: agency.organizationId,
      status: 200,
      items: build.adverts.length,
      detail: agency.presence === "grace" ? "deactivated_grace" : null,
    });
    return new Response(feedXml(build, agency.presence), {
      status: 200,
      headers: { ...PROPERSTAR_FEED_HEADERS },
    });
  } catch (error) {
    console.error("[properstar-index] agency feed failed", error);
    await deps.log({ ...base, organizationId: null, status: 500, detail: "internal_error" });
    return new Response(null, { status: 500 });
  }
}
