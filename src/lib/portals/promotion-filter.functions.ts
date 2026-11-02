/**
 * Filtrul „Promovare” din lista de proprietăți — partea de server.
 *
 * Doar citire: nu pornește, nu oprește și nu modifică nicio promovare.
 * Agenția este cea din sesiune (resolvePublishingOrg); agentul vede doar
 * anunțurile lui pentru că interogarea principală a listei rulează sub RLS,
 * iar aici întoarcem doar id-uri din agenția lui.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parsePortalFilter, matchesPortalFilter } from "@/lib/portals/portal-state";
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  activatedPortalIds,
  computeOrgPortalStates,
  resolvePublishingOrg,
  type AuthContext,
} from "@/lib/portals.functions";
import {
  buildPromotionInfos,
  PUBLISHED_LISTING_STATUSES,
  parsePromotionSelection,
  promotionFilterGroups,
  promotionSelectionIsEmpty,
  matchingPropertyIds,
  promotionBadgesFor,
  storiaAutoRenewValues,
  unifiedPortalValues,
  type PromotionFilterGroup,
  type PromotionRows,
  type PropertyPromotionBadge,
} from "@/lib/portals/promotion-filter";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error("Nu am putut citi starea promovărilor.");
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function fetchPromotionRows(organizationId: string): Promise<PromotionRows> {
  const admin = await loadAdmin();
  const [listings, states, publications] = await Promise.all([
    fetchAllRows((a, b) =>
      admin
        .from("portal_listings")
        .select("property_id, portal, status")
        .eq("organization_id", organizationId)
        .in("status", [...PUBLISHED_LISTING_STATUSES])
        .order("id")
        .range(a, b),
    ),
    fetchAllRows((a, b) =>
      admin
        .from("imobiliare_promotion_states")
        .select("property_id, promotion_id, value_boolean, value_numeric")
        .eq("organization_id", organizationId)
        .order("id")
        .range(a, b),
    ),
    fetchAllRows((a, b) =>
      admin
        .from("portal_publications")
        .select("property_id, portal_key, enabled, promoted")
        .eq("organization_id", organizationId)
        .eq("enabled", true)
        .eq("promoted", true)
        .order("id")
        .range(a, b),
    ),
  ]);
  return { listings, states, publications };
}

async function fetchStoriaAutoRenewValues(organizationId: string) {
  const admin = await loadAdmin();
  const [org, properties, publications, listings] = await Promise.all([
    admin.from("organizations").select("storia_auto_republish").eq("id", organizationId).maybeSingle(),
    fetchAllRows((a, b) =>
      admin
        .from("properties")
        .select("id, storia_auto_renew")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("id")
        .range(a, b),
    ),
    fetchAllRows((a, b) =>
      admin
        .from("portal_publications")
        .select("property_id")
        .eq("organization_id", organizationId)
        .eq("portal_key", "storia")
        .eq("enabled", true)
        .order("id")
        .range(a, b),
    ),
    fetchAllRows((a, b) =>
      admin
        .from("portal_listings")
        .select("property_id, status, external_id")
        .eq("organization_id", organizationId)
        .eq("portal", "storia")
        .in("status", ["published", "updated", "pending"])
        .order("id")
        .range(a, b),
    ),
  ]);
  if (org.error) throw new Error("Nu am putut citi setarea agenției.");
  return storiaAutoRenewValues({
    properties: properties as { id: string; storia_auto_renew: boolean | null }[],
    selectedPropertyIds: (publications as { property_id: string }[]).map((r) => r.property_id),
    listings: listings as { property_id: string; status: string; external_id: string | null }[],
    agencyDefault: org.data?.storia_auto_republish === true,
  });
}

/** Opțiunile filtrului, doar pentru portalurile conectate ale agenției. */
export const getPromotionFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ groups: PromotionFilterGroup[] }> => {
    const { organizationId } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const connected = await activatedPortalIds(organizationId);
    return { groups: promotionFilterGroups(connected) };
  });

const promotionValuesSchema = z
  .array(z.string().regex(/^(any|none|imobiliare_ro:[a-z0-9_]+|[a-z0-9_]+:(promoted|published|unpublished|error)|storia:auto_renew_(on|off))$/))
  .max(100);

/**
 * Id-urile proprietăților care se potrivesc cu selecția filtrului.
 * Filtrarea propriu-zisă se aplică apoi în interogarea listei (sub RLS).
 */
export const getPropertyIdsByPromotion = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        values: promotionValuesSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<string[]> => {
    const { organizationId } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const connected = await activatedPortalIds(organizationId);
    const valid = new Set(["any", "none", ...promotionFilterGroups(connected).flatMap((g) => g.options.map((o) => o.value)), ...["any", ...connected].filter((id) => id !== "facebook_catalog").flatMap((id) => ["published", "unpublished", "error"].map((state) => `${id}:${state}`))]);
    const values = unifiedPortalValues(data.values.join(",")).filter((v) => valid.has(v));
    const stateFilters = values.map(parsePortalFilter).filter((v) => v !== null);
    const errorPortals = stateFilters.filter((f) => f.state === "error").flatMap((f) => f.portal === "any" ? [...connected].filter((p) => p !== "facebook_catalog") : [f.portal]);
    const selection = parsePromotionSelection([...values.filter((v) => !parsePortalFilter(v)), ...errorPortals.map((p) => `${p}:error`)].join(","));
    if (promotionSelectionIsEmpty(selection) && stateFilters.length === 0) return [];
    const admin = await loadAdmin();
    const hasPromotions = selection.any || selection.none || selection.imobiliareServices.length > 0 || selection.flagPortals.length > 0;
    const [rows, autoRenew, errors, all, states] = await Promise.all([
      hasPromotions ? fetchPromotionRows(organizationId) : Promise.resolve({ listings: [], states: [], publications: [] }),
      selection.storiaAutoRenew.length ? fetchStoriaAutoRenewValues(organizationId) : Promise.resolve(new Map<string, boolean>()),
      selection.errorPortals.length ? fetchAllRows((a, b) =>
        admin.from("portal_publications")
          .select("property_id, portal_key, enabled, status")
          .eq("organization_id", organizationId)
          .eq("enabled", true)
          .eq("status", "error")
          .in("portal_key", selection.errorPortals)
          .order("id").range(a, b),
      ) : Promise.resolve([]),
      selection.none ? fetchAllRows((a, b) =>
        admin
          .from("properties")
          .select("id")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("id")
          .range(a, b),
      ) : Promise.resolve([]),
      stateFilters.some((f) => f.state !== "error") ? computeOrgPortalStates(organizationId) : Promise.resolve(new Map()),
    ]);
    const stateIds = stateFilters.length ? [...states].filter(([, cells]) => stateFilters.some((f) => f.state !== "error" && matchesPortalFilter(cells, f))).map(([id]) => id) : undefined;
    return matchingPropertyIds(selection, buildPromotionInfos(rows), autoRenew, errors, all.map((row) => row.id), stateIds);
  });

/** Etichetele „Promovat” pentru rândurile din pagina curentă a listei. */
export const getPropertyPromotionBadges = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        propertyIds: z.array(z.string().uuid()).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Record<string, PropertyPromotionBadge[]>> => {
    const { organizationId } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    if (data.propertyIds.length === 0) return {};
    const rows = await fetchPromotionRows(organizationId);
    const infos = buildPromotionInfos(rows);
    const result: Record<string, PropertyPromotionBadge[]> = {};
    for (const propertyId of data.propertyIds) {
      const info = infos.get(propertyId);
      if (!info) continue;
      const badges = promotionBadgesFor(info);
      if (badges.length > 0) result[propertyId] = badges;
    }
    return result;
  });
