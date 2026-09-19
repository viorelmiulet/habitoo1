/**
 * Construcția feedului XML Properstar (server-only).
 *
 * Feedul expune EXCLUSIV:
 *  - ofertele agenției determinate din cheia din URL (niciodată din query);
 *  - ofertele selectate explicit pentru Properstar
 *    (`portal_publications.portal_key = 'properstar'`);
 *  - ofertele retrase sau vândute/închiriate în ultimele 7 zile, marcate
 *    `Status=Deleted`, ca Properstar să le scoată la ei; apoi dispar.
 *
 * Nicio ofertă nu este trimisă cu noduri obligatorii goale: cele incomplete
 * sunt excluse și raportate în UI („De completat pentru Properstar").
 */
import { portalPublicFeedUrl } from "@/lib/portals/registry";
import { feedUrlsForRequest } from "@/lib/site-feed/config";

import {
  FEED_PUBLIC_STATUSES,
  type PropertyImageRow,
  type PropertyRow,
} from "@/lib/site-feed/mapper";
import {
  buildProperstarXml,
  mapPropertyToProperstar,
  properstarStatusFor,
  PROPERSTAR_DELETED_DAYS,
  PROPERSTAR_MAX_ADVERTS,
  type ProperstarAdvert,
  type ProperstarAgent,
  type ProperstarOffice,
} from "./mapper";

export const PROPERSTAR_PORTAL_ID = "properstar";
export const PROPERSTAR_FEED_PATH_PREFIX = "/api/public/feed/properstar";
/** Cache scurt per agenție: Properstar citește periodic același conținut. */
export const PROPERSTAR_CACHE_MS = 5 * 60 * 1000;

export type ProperstarExcluded = {
  propertyId: string;
  reference: string | null;
  title: string | null;
  missing: string[];
};

export type ProperstarFeedBuild = {
  xml: string;
  adverts: ProperstarAdvert[];
  /** Câte oferte sunt selectate pentru Properstar. */
  selected: number;
  active: number;
  deleted: number;
  excluded: ProperstarExcluded[];
  capped: boolean;
};

export function properstarFeedPath(agencyKey: string): string {
  // Sursa unică a căii este definiția portalului din registry.
  return new URL(portalPublicFeedUrl(PROPERSTAR_PORTAL_ID, agencyKey)!).pathname;
}


function splitName(fullName: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") };
}

const cache = new Map<string, { expiresAt: number; build: ProperstarFeedBuild }>();

export function clearProperstarCache(organizationId?: string): void {
  if (organizationId) cache.delete(organizationId);
  else cache.clear();
}

export async function buildProperstarFeed(input: {
  organizationId: string;
  requestUrl: URL | string;
  now?: Date;
  useCache?: boolean;
}): Promise<ProperstarFeedBuild> {
  const now = input.now ?? new Date();
  if (input.useCache) {
    const hit = cache.get(input.organizationId);
    if (hit && hit.expiresAt > now.getTime()) return hit.build;
  }

  const url = typeof input.requestUrl === "string" ? new URL(input.requestUrl) : input.requestUrl;
  const { baseUrl, publicSiteUrl } = feedUrlsForRequest(url);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: publications } = await supabaseAdmin
    .from("portal_publications")
    .select("property_id, enabled, withdrawn_at, updated_at")
    .eq("organization_id", input.organizationId)
    .eq("portal_key", PROPERSTAR_PORTAL_ID);

  const rowsByProperty = new Map<
    string,
    { enabled: boolean; withdrawnAt: string | null; updatedAt: string | null }
  >();
  for (const pub of publications ?? []) {
    rowsByProperty.set(pub.property_id, {
      enabled: pub.enabled === true,
      withdrawnAt: pub.withdrawn_at ?? null,
      updatedAt: pub.updated_at ?? null,
    });
  }

  const cutoff = now.getTime() - PROPERSTAR_DELETED_DAYS * 24 * 60 * 60 * 1000;
  const candidateIds = [...rowsByProperty.entries()]
    .filter(([, row]) => {
      if (row.enabled) return true;
      const ref = row.withdrawnAt ? new Date(row.withdrawnAt).getTime() : NaN;
      return Number.isFinite(ref) && ref >= cutoff;
    })
    .map(([id]) => id);

  const selected = [...rowsByProperty.values()].filter((r) => r.enabled).length;

  const empty: ProperstarFeedBuild = {
    xml: buildProperstarXml([]),
    adverts: [],
    selected,
    active: 0,
    deleted: 0,
    excluded: [],
    capped: false,
  };
  if (!candidateIds.length) {
    cache.set(input.organizationId, { expiresAt: now.getTime() + PROPERSTAR_CACHE_MS, build: empty });
    return empty;
  }

  const [{ data: propertyRows }, { data: organization }] = await Promise.all([
    supabaseAdmin
      .from("properties")
      .select("*")
      .eq("organization_id", input.organizationId)
      .in("id", candidateIds)
      .eq("publish_status", "published")
      .is("deleted_at", null)
      .neq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(PROPERSTAR_MAX_ADVERTS + 1),
    supabaseAdmin
      .from("organizations")
      .select(
        "id, name, email, phone, city, postal_code, logo_url, material_address, material_email, material_phone, material_website",
      )
      .eq("id", input.organizationId)
      .maybeSingle(),
  ]);

  const allRows = (propertyRows ?? []) as PropertyRow[];
  const capped = allRows.length > PROPERSTAR_MAX_ADVERTS;
  const rows = allRows.slice(0, PROPERSTAR_MAX_ADVERTS);

  const office: ProperstarOffice = {
    officeId: organization?.id ?? input.organizationId,
    officeName: organization?.name ?? null,
    email: organization?.material_email ?? organization?.email ?? null,
    phone: organization?.material_phone ?? organization?.phone ?? null,
    website: organization?.material_website ?? null,
    address: organization?.material_address ?? null,
    postalCode: organization?.postal_code ?? null,
    city: organization?.city ?? null,
    logo: organization?.logo_url ?? null,
  };

  const ids = rows.map((r) => r.id);
  const agentIds = [
    ...new Set(rows.map((r) => r.assigned_to).filter((v): v is string => Boolean(v))),
  ];
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
      ? supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, phone, avatar_url")
          .in("id", agentIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            full_name: string;
            email: string | null;
            phone: string | null;
            avatar_url: string | null;
          }[],
        }),
  ]);

  const imagesByProperty = new Map<string, PropertyImageRow[]>();
  for (const img of (images.data ?? []) as PropertyImageRow[]) {
    const list = imagesByProperty.get(img.property_id) ?? [];
    list.push(img);
    imagesByProperty.set(img.property_id, list);
  }
  const agentById = new Map((agents.data ?? []).map((a) => [a.id, a]));

  const adverts: ProperstarAdvert[] = [];
  const excluded: ProperstarExcluded[] = [];
  const seen = new Set<string>();
  let active = 0;
  let deleted = 0;

  for (const row of rows) {
    const publication = rowsByProperty.get(row.id);
    if (!publication) continue;
    const publishable = FEED_PUBLIC_STATUSES.includes(row.status as never);
    const withdrawn = !publication.enabled || !publishable;
    // Pentru vândut/închiriat nu există istoric de status în date: folosim
    // momentul ultimei modificări a ofertei ca dată de referință.
    const referenceDate = !publication.enabled
      ? (publication.withdrawnAt ?? publication.updatedAt)
      : row.updated_at;
    const status = properstarStatusFor({ withdrawn, referenceDate, now });
    if (status === "omit") continue;

    const agentRow = row.assigned_to ? agentById.get(row.assigned_to) : null;
    const names = splitName(agentRow?.full_name);
    const agent: ProperstarAgent | null = agentRow
      ? {
          agentId: agentRow.id,
          firstName: names.firstName,
          lastName: names.lastName,
          email: agentRow.email ?? null,
          mobilePhone: agentRow.phone ?? null,
          landPhone: office.phone,
          photo: agentRow.avatar_url ?? null,
        }
      : null;

    const result = mapPropertyToProperstar(row, {
      baseUrl,
      publicSiteUrl,
      images: imagesByProperty.get(row.id) ?? [],
      office,
      agent,
      status,
    });
    if (!result.ok) {
      // Raportăm doar ofertele active: cele retrase oricum ies din feed.
      if (status === "Active") {
        excluded.push({
          propertyId: row.id,
          reference: row.reference ?? null,
          title: row.title ?? null,
          missing: result.missing,
        });
      }
      continue;
    }
    if (seen.has(result.advert.advertId)) {
      if (status === "Active") {
        excluded.push({
          propertyId: row.id,
          reference: row.reference ?? null,
          title: row.title ?? null,
          missing: [`Identificatorul „${result.advert.advertId}” este duplicat în feed`],
        });
      }
      continue;
    }
    seen.add(result.advert.advertId);
    adverts.push(result.advert);
    if (status === "Active") active += 1;
    else deleted += 1;
  }

  const build: ProperstarFeedBuild = {
    xml: buildProperstarXml(adverts),
    adverts,
    selected,
    active,
    deleted,
    excluded,
    capped,
  };
  cache.set(input.organizationId, { expiresAt: now.getTime() + PROPERSTAR_CACHE_MS, build });
  return build;
}
