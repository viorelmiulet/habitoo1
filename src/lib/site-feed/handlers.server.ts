/**
 * Logica feedului de proprietăți, într-un singur loc.
 * Este folosită de ambele prefixe de rute:
 *  - /api/public/sites/v1/*   (feed site/portal, token de site)
 *  - /api/public/portal/v1/*  (cheie emisă de Habitoo pentru un portal)
 * Nu există o a doua implementare paralelă pentru proprietăți.
 */
import {
  errorResponse,
  jsonResponse,
  FEED_API_VERSION,
  type FeedAuthOk,
} from "@/lib/site-feed/auth.server";
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import {
  buildPaginatedFeed,
  isPropertyFeedEligible,
  mapAgent,
  mapPropertyToFeed,
  parsePagination,
  FEED_PUBLIC_STATUSES,
  type ProfileRow,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FeedHandlerResult = { response: Response; items?: number };

function missingScope(scope: string): FeedHandlerResult {
  return { response: errorResponse(403, `Missing scope: ${scope}`), items: 0 };
}

function hasScope(auth: FeedAuthOk, scope: string): boolean {
  return auth.scopes.length === 0 ? false : auth.scopes.includes(scope);
}

/** Gard reutilizabil pentru rutele care scriu date. `null` = permis. */
export function requireFeedScope(auth: FeedAuthOk, scope: string): FeedHandlerResult | null {
  return hasScope(auth, scope) ? null : missingScope(scope);
}

/** Portalurile pe care oferta este publicată activ (model generic + legacy). */
async function portalKeysFor(
  organizationId: string,
  propertyIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!propertyIds.length) return result;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [publications, listings] = await Promise.all([
    supabaseAdmin
      .from("portal_publications")
      .select("property_id, portal_key")
      .eq("organization_id", organizationId)
      .eq("enabled", true)
      .in("property_id", propertyIds),
    supabaseAdmin
      .from("portal_listings")
      .select("property_id, portal")
      .eq("organization_id", organizationId)
      .in("status", ["published", "updated"])
      .in("property_id", propertyIds),
  ]);
  const push = (propertyId: string, portal: string) => {
    const list = result.get(propertyId) ?? [];
    if (!list.includes(portal)) list.push(portal);
    result.set(propertyId, list);
  };
  for (const row of publications.data ?? []) push(row.property_id, row.portal_key);
  for (const row of listings.data ?? []) push(row.property_id, row.portal);
  return result;
}

export async function handlePropertiesList(
  request: Request,
  auth: FeedAuthOk,
): Promise<FeedHandlerResult> {
  if (!hasScope(auth, "feed:read")) return missingScope("feed:read");
  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const from = (page - 1) * perPage;
  const baseQuery = () =>
    supabaseAdmin
      .from("properties")
      .select("*", { count: "exact" })
      .eq("organization_id", auth.organizationId)
      .eq("publish_status", "published")
      .is("deleted_at", null)
      .in("status", [...FEED_PUBLIC_STATUSES]);

  let { data, count, error } = await baseQuery()
    .order("updated_at", { ascending: false })
    .range(from, from + perPage - 1);
  if (error?.code === "PGRST103") {
    // Pagină peste last_page: 200 cu data=[] și metadata consistentă.
    const head = await baseQuery().range(0, 0);
    data = [];
    count = head.count ?? 0;
    error = null;
  }
  if (error) throw error;

  const rows = (data ?? []) as PropertyRow[];
  const ids = rows.map((r) => r.id);
  const agentIds = [...new Set(rows.map((r) => r.assigned_to).filter((v): v is string => Boolean(v)))];

  const [images, agents, portalsByProperty] = await Promise.all([
    ids.length
      ? supabaseAdmin
          .from("property_images")
          .select("*")
          .eq("organization_id", auth.organizationId)
          .in("property_id", ids)
          .eq("include_in_publish", true)
          .eq("is_confidential", false)
      : Promise.resolve({ data: [] as PropertyImageRow[], error: null }),
    agentIds.length
      ? supabaseAdmin.from("profiles").select("id, full_name").in("id", agentIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
    portalKeysFor(auth.organizationId, ids),
  ]);

  const imagesByProperty = new Map<string, PropertyImageRow[]>();
  for (const img of (images.data ?? []) as PropertyImageRow[]) {
    const list = imagesByProperty.get(img.property_id) ?? [];
    list.push(img);
    imagesByProperty.set(img.property_id, list);
  }
  const agentById = new Map((agents.data ?? []).map((a) => [a.id, a]));

  const { baseUrl, publicSiteUrl } = feedUrlsForRequest(url);
  const feed = buildPaginatedFeed({
    data: rows.map((row) =>
      mapPropertyToFeed(row, {
        baseUrl,
        publicSiteUrl,
        images: imagesByProperty.get(row.id) ?? [],
        agent: row.assigned_to ? (agentById.get(row.assigned_to) ?? null) : null,
        portalKeys: portalsByProperty.get(row.id) ?? [],
      }),
    ),
    total: count ?? 0,
    page,
    perPage,
    requestUrl: url,
  });

  return {
    response: jsonResponse({ ...feed, api_version: FEED_API_VERSION }, 200, 60),
    items: feed.data.length,
  };
}

export async function handlePropertyDetail(
  request: Request,
  auth: FeedAuthOk,
  rawId: string,
): Promise<FeedHandlerResult> {
  if (!hasScope(auth, "feed:read")) return missingScope("feed:read");
  const id = rawId.trim();
  if (!id || id.length > 64) {
    return { response: errorResponse(400, "Invalid property id."), items: 0 };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const query = supabaseAdmin
    .from("properties")
    .select("*")
    .eq("organization_id", auth.organizationId)
    .limit(1);
  const { data, error } = UUID_RE.test(id) ? await query.eq("id", id) : await query.eq("reference", id);
  if (error) throw error;

  const row = (data ?? [])[0] as PropertyRow | undefined;
  if (!row || !isPropertyFeedEligible(row)) {
    return { response: errorResponse(404, "Property not found."), items: 0 };
  }

  const [images, agent, portalsByProperty] = await Promise.all([
    supabaseAdmin
      .from("property_images")
      .select("*")
      .eq("organization_id", auth.organizationId)
      .eq("property_id", row.id)
      .eq("include_in_publish", true)
      .eq("is_confidential", false),
    row.assigned_to
      ? supabaseAdmin.from("profiles").select("id, full_name").eq("id", row.assigned_to).maybeSingle()
      : Promise.resolve({ data: null }),
    portalKeysFor(auth.organizationId, [row.id]),
  ]);

  const { baseUrl, publicSiteUrl } = feedUrlsForRequest(new URL(request.url));
  const mapped = mapPropertyToFeed(row, {
    baseUrl,
    publicSiteUrl,
    images: (images.data ?? []) as PropertyImageRow[],
    agent: agent.data ?? null,
    portalKeys: portalsByProperty.get(row.id) ?? [],
  });

  return {
    response: jsonResponse({ data: mapped, api_version: FEED_API_VERSION }, 200, 60),
    items: 1,
  };
}

export async function handleAgentsList(
  request: Request,
  auth: FeedAuthOk,
): Promise<FeedHandlerResult> {
  if (!hasScope(auth, "agents:read") && !hasScope(auth, "feed:read")) {
    return missingScope("agents:read");
  }
  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const from = (page - 1) * perPage;
  const baseQuery = () =>
    supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact" })
      .eq("organization_id", auth.organizationId)
      .eq("is_active", true);

  let { data, count, error } = await baseQuery()
    .order("full_name", { ascending: true })
    .range(from, from + perPage - 1);
  if (error?.code === "PGRST103") {
    const head = await baseQuery().range(0, 0);
    data = [];
    count = head.count ?? 0;
    error = null;
  }
  if (error) throw error;

  const feed = buildPaginatedFeed({
    data: ((data ?? []) as ProfileRow[]).map((p) => mapAgent(p)),
    total: count ?? 0,
    page,
    perPage,
    requestUrl: url,
  });

  return {
    response: jsonResponse({ ...feed, api_version: FEED_API_VERSION }, 200, 60),
    items: feed.data.length,
  };
}
