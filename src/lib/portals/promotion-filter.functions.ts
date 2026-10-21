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
  parsePromotionSelection,
  promotionFilterGroups,
  promotionSelectionIsEmpty,
  propertyHasAnyPromotion,
  propertyMatchesPromotion,
  promotionBadgesFor,
  type PromotionFilterGroup,
  type PromotionRows,
  type PropertyPromotionBadge,
} from "@/lib/portals/promotion-filter";

const PUBLISHED_LISTING_STATUSES = ["published", "updated"] as const;

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

type PromotionRows = {
  listings: { property_id: string; portal: string; status: string }[];
  states: {
    property_id: string;
    promotion_id: string;
    value_boolean: boolean | null;
    value_numeric: number | null;
  }[];
  publications: { property_id: string; portal_key: string; enabled: boolean; promoted: boolean | null }[];
};

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

/** Construiește informația de promovare per proprietate (doar anunțuri publicate). */
export function buildPromotionInfos(rows: PromotionRows): Map<string, PropertyPromotionInfo> {
  const infos = new Map<string, PropertyPromotionInfo>();
  const ensure = (propertyId: string): PropertyPromotionInfo => {
    let info = infos.get(propertyId);
    if (!info) {
      info = { imobiliarePublished: false, imobiliareActiveServices: [], flagPromotions: [] };
      infos.set(propertyId, info);
    }
    return info;
  };
  const publishedPortals = new Map<string, Set<string>>();
  for (const listing of rows.listings) {
    let set = publishedPortals.get(listing.property_id);
    if (!set) {
      set = new Set();
      publishedPortals.set(listing.property_id, set);
    }
    set.add(listing.portal);
  }
  for (const state of rows.states) {
    if (!promotionStateActive(state.value_boolean, state.value_numeric)) continue;
    if (!publishedPortals.get(state.property_id)?.has("imobiliare_ro")) continue;
    const info = ensure(state.property_id);
    info.imobiliarePublished = true;
    if (!info.imobiliareActiveServices.includes(state.promotion_id)) {
      info.imobiliareActiveServices.push(state.promotion_id);
    }
  }
  for (const publication of rows.publications) {
    const published = publishedPortals.get(publication.property_id)?.has(publication.portal_key) === true;
    const info = ensure(publication.property_id);
    const existing = info.flagPromotions.find((f) => f.portalId === publication.portal_key);
    if (existing) {
      existing.published = existing.published || published;
      existing.promoted = true;
    } else {
      info.flagPromotions.push({ portalId: publication.portal_key, published, promoted: true });
    }
  }
  // Anunțurile publicate pe Imobiliare.ro fără promovări active trebuie să
  // existe în mapă (pentru „Fără promovare” și pentru etichete goale).
  for (const [propertyId, portals] of publishedPortals) {
    const info = ensure(propertyId);
    if (portals.has("imobiliare_ro")) info.imobiliarePublished = true;
  }
  return infos;
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
  .array(z.string().regex(/^(any|none|imobiliare_ro:[a-z0-9_]+|[a-z0-9_]+:promoted)$/))
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
    for (const [propertyId, info] of infos) {
      if (propertyMatchesPromotion(info, selection)) matched.push(propertyId);
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
        propertyIds: z.array(z.string().uuid()).max(100),
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
