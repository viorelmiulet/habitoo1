/**
 * Promovări de portal — citirea configurării agenției și verificarea consumului.
 *
 * Consumul NU este ținut în baza locală: el se citește de la portal (anunțurile
 * care ocupă fiecare loc) și se atribuie agentului responsabil al proprietății,
 * exact ca la locurile de publicare. Recitirea stării nu consumă nimic.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { IMOBILIARE_PORTAL_KEY } from "@/lib/portals/imobiliare/config";
import type { ImobiliarePromotionDefinition } from "@/lib/portals/imobiliare/promotions";
import type { ImobiliareSession } from "@/lib/portals/imobiliare/auth.server";
import {
  checkPromotionAllocation,
  emptyPromotionUsage,
  promotionAllocationFor,
  type PromotionCheck,
  type PromotionUsage,
} from "./allocation";

type Admin = SupabaseClient<any, any, any>;

export const PROMOTION_SETTINGS_TABLE = "promotion_service_settings";
export const PROMOTION_ALLOCATIONS_TABLE = "promotion_allocations";

/** Câte anunțuri citim individual pentru serviciile numerice (Energy). */
export const PROMOTION_USAGE_LISTING_CAP = 25;

export type PromotionServiceSetting = { enabled: boolean; agencyCap: number | null };

export async function loadPromotionSettings(
  admin: Admin,
  input: { organizationId: string; portalKey?: string },
): Promise<Map<string, PromotionServiceSetting>> {
  const { data } = await admin
    .from(PROMOTION_SETTINGS_TABLE)
    .select("service_key, enabled, agency_cap")
    .eq("organization_id", input.organizationId)
    .eq("portal_key", input.portalKey ?? IMOBILIARE_PORTAL_KEY);
  const rows = (data ?? []) as {
    service_key: string;
    enabled: boolean | null;
    agency_cap: number | null;
  }[];
  return new Map(
    rows.map((row) => [
      row.service_key,
      { enabled: row.enabled === true, agencyCap: row.agency_cap ?? null },
    ]),
  );
}

export async function loadPromotionAllocations(
  admin: Admin,
  input: { organizationId: string; portalKey?: string },
): Promise<Map<string, Map<string, number | null>>> {
  const { data } = await admin
    .from(PROMOTION_ALLOCATIONS_TABLE)
    .select("service_key, user_id, amount")
    .eq("organization_id", input.organizationId)
    .eq("portal_key", input.portalKey ?? IMOBILIARE_PORTAL_KEY);
  const rows = (data ?? []) as { service_key: string; user_id: string; amount: number | null }[];
  const byService = new Map<string, Map<string, number | null>>();
  for (const row of rows) {
    const map = byService.get(row.service_key) ?? new Map<string, number | null>();
    map.set(row.user_id, row.amount ?? null);
    byService.set(row.service_key, map);
  }
  return byService;
}

/** Referința anunțului de la Imobiliare.ro → agentul responsabil al ofertei. */
export async function loadImobiliareReferenceOwners(
  admin: Admin,
  organizationId: string,
): Promise<Map<string, string | null>> {
  const { parseImobiliareReferences } = await import("@/lib/portals/imobiliare/references");
  const [{ data: listings }, { data: properties }] = await Promise.all([
    admin
      .from("portal_listings")
      .select("property_id, external_id")
      .eq("organization_id", organizationId)
      .eq("portal", IMOBILIARE_PORTAL_KEY),
    admin.from("properties").select("id, assigned_to").eq("organization_id", organizationId),
  ]);
  const owners = new Map<string, string | null>(
    ((properties ?? []) as { id: string; assigned_to: string | null }[]).map((row) => [
      row.id,
      row.assigned_to ?? null,
    ]),
  );
  const map = new Map<string, string | null>();
  for (const row of (listings ?? []) as { property_id: string; external_id: string | null }[]) {
    for (const reference of parseImobiliareReferences(row.external_id)) {
      map.set(reference, owners.get(row.property_id) ?? null);
    }
  }
  return map;
}

/**
 * Consumul real per serviciu: ce anunțuri ocupă locurile, cui aparțin ofertele.
 * Erorile sunt izolate pe serviciu; un serviciu necitit este marcat `partial`,
 * niciodată prezentat ca „zero consum”.
 */
export async function loadImobiliarePromotionUsage(input: {
  admin: Admin;
  session: ImobiliareSession;
  organizationId: string;
  definitions: ImobiliarePromotionDefinition[];
}): Promise<Map<string, PromotionUsage>> {
  const { fetchImobiliareSlotListings, fetchImobiliareListingPromotions } = await import(
    "@/lib/portals/imobiliare/promotions.server"
  );
  const owners = await loadImobiliareReferenceOwners(input.admin, input.organizationId);
  const usage = new Map<string, PromotionUsage>();

  for (const definition of input.definitions) {
    if (!definition.slotType) {
      usage.set(definition.id, emptyPromotionUsage(null));
      continue;
    }
    const listings = await fetchImobiliareSlotListings({
      session: input.session,
      organizationId: input.organizationId,
      slotType: definition.slotType,
    });
    if (!listings.ok) {
      usage.set(definition.id, emptyPromotionUsage(listings.message));
      continue;
    }

    const references = listings.listings
      .map((listing) => listing.reference)
      .filter((reference): reference is string => typeof reference === "string" && reference !== "");

    const byUser = new Map<string, number>();
    let total = 0;
    let partial = false;

    if (definition.kind === "numeric") {
      const scanned = references.slice(0, PROMOTION_USAGE_LISTING_CAP);
      partial = references.length > scanned.length;
      for (const reference of scanned) {
        const state = await fetchImobiliareListingPromotions({
          session: input.session,
          organizationId: input.organizationId,
          reference,
        });
        if (state.error) {
          partial = true;
          continue;
        }
        const value = state.states.get(definition.id);
        const amount = typeof value === "number" ? Math.max(Math.trunc(value), 0) : 0;
        if (amount === 0) continue;
        total += amount;
        const owner = owners.get(reference) ?? null;
        if (owner) byUser.set(owner, (byUser.get(owner) ?? 0) + amount);
      }
    } else {
      for (const reference of references) {
        total += 1;
        const owner = owners.get(reference) ?? null;
        if (owner) byUser.set(owner, (byUser.get(owner) ?? 0) + 1);
      }
    }

    usage.set(definition.id, { byUser, total, partial, error: null });
  }

  return usage;
}

/**
 * Poarta server-side aplicată în locul UNIC care comandă o promovare.
 * Valabilă pentru toți, inclusiv `agency_admin` și Superadmin.
 */
export async function ensureImobiliarePromotionAllowed(input: {
  admin: Admin;
  session: ImobiliareSession;
  organizationId: string;
  propertyId: string;
  definition: ImobiliarePromotionDefinition;
  current: boolean | number | null;
  next: boolean | number;
}): Promise<PromotionCheck> {
  const { promotionConsumption } = await import("./allocation");
  // Dezactivarea, scăderea și recitirea nu consumă nimic: nu citim nimic în plus.
  if (promotionConsumption(input.definition.kind, input.current, input.next) <= 0) {
    return { ok: true, consumes: 0 };
  }

  const [settings, allocations, property] = await Promise.all([
    loadPromotionSettings(input.admin, { organizationId: input.organizationId }),
    loadPromotionAllocations(input.admin, { organizationId: input.organizationId }),
    input.admin
      .from("properties")
      .select("assigned_to")
      .eq("id", input.propertyId)
      .eq("organization_id", input.organizationId)
      .maybeSingle(),
  ]);

  const setting = settings.get(input.definition.id) ?? { enabled: false, agencyCap: null };
  const serviceAllocations = allocations.get(input.definition.id) ?? new Map<string, number | null>();
  const userId =
    ((property as { data: { assigned_to: string | null } | null }).data?.assigned_to ?? null) || null;
  const allocation = userId ? promotionAllocationFor(serviceAllocations, userId) : null;

  // Consumul se citește numai dacă există un plafon de verificat.
  const usage =
    setting.enabled && (allocation !== null || setting.agencyCap !== null)
      ? ((await loadImobiliarePromotionUsage({
          admin: input.admin,
          session: input.session,
          organizationId: input.organizationId,
          definitions: [input.definition],
        }).then((map) => map.get(input.definition.id))) ?? emptyPromotionUsage(null))
      : emptyPromotionUsage(null);

  return checkPromotionAllocation({
    label: input.definition.label,
    kind: input.definition.kind,
    enabled: setting.enabled,
    agencyCap: setting.agencyCap,
    allocation,
    usage,
    userId,
    current: input.current,
    next: input.next,
  });
}
