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
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  activatedPortalIds,
  resolvePublishingOrg,
  type AuthContext,
} from "@/lib/portals.functions";
import {
  buildPromotionInfos,
  PUBLISHED_LISTING_STATUSES,
  parsePromotionSelection,
  promotionFilterGroups,
  promotionSelectionIsEmpty,
  propertyHasAnyPromotion,
  propertyMatchesPromotion,
  promotionBadgesFor,
  storiaAutoRenewValues,
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
  .array(z.string().regex(/^(any|none|imobiliare_ro:[a-z0-9_]+|[a-z0-9_]+:promoted|storia:auto_renew_(on|off))$/))
  .max(40);

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
    const selection = parsePromotionSelection(data.values.join(","));
    if (promotionSelectionIsEmpty(selection)) return [];
    const rows = await fetchPromotionRows(organizationId);
    const infos = buildPromotionInfos(rows);
    const matched: string[] = [];
    if (selection.storiaAutoRenew.length > 0) {
      // SAU cu celelalte selecții; nu e promovare.
      const values = await fetchStoriaAutoRenewValues(organizationId);
      for (const [propertyId, value] of values) {
        if (selection.storiaAutoRenew.includes(value)) matched.push(propertyId);
      }
    }
    for (const [propertyId, info] of infos) {
      if (
        (selection.any || selection.imobiliareServices.length > 0 || selection.flagPortals.length > 0) &&
        propertyMatchesPromotion(info, selection) &&
        !matched.includes(propertyId)
      ) {
        matched.push(propertyId);
      }
    }
    if (selection.none) {
      // „Fără promovare”: toate proprietățile agenției, mai puțin cele promovate.
      const admin = await loadAdmin();
      const all = await fetchAllRows((a, b) =>
        admin
          .from("properties")
          .select("id")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("id")
          .range(a, b),
      );
      const promoted = new Set(
        [...infos.entries()].filter(([, info]) => propertyHasAnyPromotion(info)).map(([id]) => id),
      );
      return all.map((row) => row.id).filter((id) => !promoted.has(id));
    }
    return matched;
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
