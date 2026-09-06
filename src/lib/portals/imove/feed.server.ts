/**
 * Construcția feedului iMove.ro (server-only).
 *
 * Feedul expune EXCLUSIV:
 *  - ofertele agenției determinate din credențial (niciodată din query);
 *  - ofertele publicabile (publicate pe site, nearhivate, status public);
 *  - ofertele selectate explicit pentru iMove în lista de proprietăți
 *    (`portal_publications.enabled = true`, `portal_key = 'imove'`).
 *
 * O ofertă care nu mai apare în feed este arhivată automat de iMove, conform
 * documentației oficiale. Nu există o operație separată de retragere.
 */
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import { FEED_PUBLIC_STATUSES, type PropertyImageRow, type PropertyRow } from "@/lib/site-feed/mapper";
import { mapPropertyToImove, type ImoveListing } from "./mapper";

export const IMOVE_PORTAL_ID = "imove";
export const IMOVE_FEED_PATH = "/api/public/portal/v1/imove/feed";
export const IMOVE_FEED_VERSION = "habitoo-imove-feed/1.0";
export const IMOVE_DEFAULT_PER_PAGE = 200;
export const IMOVE_MAX_PER_PAGE = 500;

export type ImoveExcluded = {
  propertyId: string;
  reference: string | null;
  title: string | null;
  reasons: string[];
};

export type ImoveFeedBuild = {
  listings: ImoveListing[];
  total: number;
  page: number;
  perPage: number;
  selected: number;
  excluded: ImoveExcluded[];
  warnings: { externalId: string; messages: string[] }[];
};

export function parseImovePagination(url: URL): { page: number; perPage: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const raw = Number(url.searchParams.get("per_page") ?? IMOVE_DEFAULT_PER_PAGE) || IMOVE_DEFAULT_PER_PAGE;
  const perPage = Math.min(IMOVE_MAX_PER_PAGE, Math.max(1, raw));
  return { page, perPage };
}

/** Ofertele selectate pentru iMove, indiferent de eligibilitate. */
export async function imoveSelectedPropertyIds(organizationId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("portal_publications")
    .select("property_id")
    .eq("organization_id", organizationId)
    .eq("portal_key", IMOVE_PORTAL_ID)
    .eq("enabled", true);
  return [...new Set((data ?? []).map((row) => row.property_id))];
}

export async function buildImoveFeed(input: {
  organizationId: string;
  requestUrl: URL | string;
  page?: number;
  perPage?: number;
}): Promise<ImoveFeedBuild> {
  const url = typeof input.requestUrl === "string" ? new URL(input.requestUrl) : input.requestUrl;
  const page = input.page ?? 1;
  const perPage = input.perPage ?? IMOVE_DEFAULT_PER_PAGE;
  const { baseUrl, publicSiteUrl } = feedUrlsForRequest(url);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const selectedIds = await imoveSelectedPropertyIds(input.organizationId);
  if (selectedIds.length === 0) {
    return { listings: [], total: 0, page, perPage, selected: 0, excluded: [], warnings: [] };
  }

  const from = (page - 1) * perPage;
  const { data, count } = await supabaseAdmin
    .from("properties")
    .select("*", { count: "exact" })
    .eq("organization_id", input.organizationId)
    .in("id", selectedIds)
    .eq("publish_status", "published")
    .is("deleted_at", null)
    .in("status", [...FEED_PUBLIC_STATUSES])
    .order("updated_at", { ascending: false })
    .range(from, from + perPage - 1);

  const rows = (data ?? []) as PropertyRow[];
  const ids = rows.map((r) => r.id);
  const agentIds = [...new Set(rows.map((r) => r.assigned_to).filter((v): v is string => Boolean(v)))];

  const [images, agents] = await Promise.all([
    ids.length
      ? supabaseAdmin
          .from("property_images")
          .select("*")
          .eq("organization_id", input.organizationId)
          .in("property_id", ids)
          .eq("include_in_publish", true)
          .eq("is_confidential", false)
      : Promise.resolve({ data: [] as PropertyImageRow[] }),
    agentIds.length
      ? supabaseAdmin.from("profiles").select("id, full_name, email, phone").in("id", agentIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string | null; phone: string | null }[] }),
  ]);

  const imagesByProperty = new Map<string, PropertyImageRow[]>();
  for (const img of (images.data ?? []) as PropertyImageRow[]) {
    const list = imagesByProperty.get(img.property_id) ?? [];
    list.push(img);
    imagesByProperty.set(img.property_id, list);
  }
  const agentById = new Map((agents.data ?? []).map((a) => [a.id, a]));

  const listings: ImoveListing[] = [];
  const excluded: ImoveExcluded[] = [];
  const warnings: { externalId: string; messages: string[] }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const result = mapPropertyToImove(row, {
      baseUrl,
      publicSiteUrl,
      images: imagesByProperty.get(row.id) ?? [],
      agent: row.assigned_to ? (agentById.get(row.assigned_to) ?? null) : null,
    });
    if (!result.ok) {
      excluded.push({
        propertyId: row.id,
        reference: row.reference ?? null,
        title: row.title ?? null,
        reasons: result.reasons,
      });
      continue;
    }
    if (seen.has(result.listing.externalId)) {
      excluded.push({
        propertyId: row.id,
        reference: row.reference ?? null,
        title: row.title ?? null,
        reasons: [`Identificatorul „${result.listing.externalId}” este duplicat în feed.`],
      });
      continue;
    }
    seen.add(result.listing.externalId);
    listings.push(result.listing);
    if (result.warnings.length) {
      warnings.push({ externalId: result.listing.externalId, messages: result.warnings });
    }
  }

  return {
    listings,
    total: count ?? listings.length,
    page,
    perPage,
    selected: selectedIds.length,
    excluded,
    warnings,
  };
}

/** Corpul JSON servit către iMove: obiect cu `listings`, conform documentației. */
export function imoveFeedBody(build: ImoveFeedBuild) {
  return {
    api_version: IMOVE_FEED_VERSION,
    generated_at: new Date().toISOString(),
    total: build.total,
    page: build.page,
    per_page: build.perPage,
    listings: build.listings,
  };
}

/** Feedul conține oferta? Folosit pentru statusul real per proprietate. */
export async function imoveFeedContains(input: {
  organizationId: string;
  propertyId: string;
  requestUrl: URL | string;
}): Promise<{ visible: boolean; listing: ImoveListing | null; reasons: string[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: publication } = await supabaseAdmin
    .from("portal_publications")
    .select("enabled")
    .eq("organization_id", input.organizationId)
    .eq("portal_key", IMOVE_PORTAL_ID)
    .eq("property_id", input.propertyId)
    .maybeSingle();
  if (publication?.enabled !== true) {
    return { visible: false, listing: null, reasons: ["Oferta nu este selectată pentru iMove."] };
  }

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("id", input.propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!property) return { visible: false, listing: null, reasons: ["Oferta nu mai există."] };
  const row = property as PropertyRow;
  if (row.publish_status !== "published" || !FEED_PUBLIC_STATUSES.includes(row.status as never)) {
    return {
      visible: false,
      listing: null,
      reasons: ["Oferta nu este publicabilă: verifică statusul și publicarea pe site."],
    };
  }

  const [{ data: images }, { data: agent }] = await Promise.all([
    supabaseAdmin
      .from("property_images")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("property_id", input.propertyId)
      .eq("include_in_publish", true)
      .eq("is_confidential", false),
    row.assigned_to
      ? supabaseAdmin.from("profiles").select("id, full_name, email, phone").eq("id", row.assigned_to).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const url = typeof input.requestUrl === "string" ? new URL(input.requestUrl) : input.requestUrl;
  const { baseUrl, publicSiteUrl } = feedUrlsForRequest(url);
  const result = mapPropertyToImove(row, {
    baseUrl,
    publicSiteUrl,
    images: (images ?? []) as PropertyImageRow[],
    agent: agent ?? null,
  });
  if (!result.ok) return { visible: false, listing: null, reasons: result.reasons };
  return { visible: true, listing: result.listing, reasons: result.warnings };
}
