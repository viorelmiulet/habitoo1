/**
 * Promovări de portal — citirea configurării agenției și a consumului real.
 *
 * Reguli de citire:
 *  - consumul AGENȚIEI vine din contorul serviciului publicat de portal
 *    (`GET /promotions/slots/{slot}` → `used`), deci nu depinde de câte anunțuri
 *    reușim să citim individual;
 *  - consumul PER UTILIZATOR se calculează doar pentru utilizatorii ceruți, din
 *    anunțurile lor; dacă un utilizator are prea multe anunțuri pentru un
 *    serviciu numeric, el este raportat ca „necalculabil”, fără să blocheze pe
 *    ceilalți;
 *  - rezultatul este memorat pe organizație + serviciu pentru un interval scurt,
 *    ca mai multe activări succesive să nu recitească portalul; memoria se
 *    invalidează după fiecare scriere reușită.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { IMOBILIARE_PORTAL_KEY } from "@/lib/portals/imobiliare/config";
import type { ImobiliarePromotionDefinition } from "@/lib/portals/imobiliare/promotions";
import type { ImobiliareSession } from "@/lib/portals/imobiliare/auth.server";
import {
  checkPromotionAllocation,
  emptyPromotionUsage,
  promotionAllocationFor,
  promotionConsumption,
  type PromotionCheck,
  type PromotionHolding,
  type PromotionUsage,
} from "./allocation";

type Admin = SupabaseClient<any, any, any>;

export const PROMOTION_SETTINGS_TABLE = "promotion_service_settings";
export const PROMOTION_ALLOCATIONS_TABLE = "promotion_allocations";

/** Câte anunțuri citim individual pentru un utilizator, la servicii numerice. */
export const PROMOTION_USER_LISTING_CAP = 12;
/** Bugetul total de citiri individuale într-o singură încărcare. */
export const PROMOTION_LISTING_READ_BUDGET = 40;
/** Cât timp rămâne valabil consumul citit. */
export const PROMOTION_USAGE_TTL_MS = 60_000;

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

/** Referința anunțului de la Imobiliare.ro → oferta locală și agentul responsabil. */
export async function loadImobiliareReferenceOwners(
  admin: Admin,
  organizationId: string,
): Promise<Map<string, { propertyId: string; userId: string | null }>> {
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
  const map = new Map<string, { propertyId: string; userId: string | null }>();
  for (const row of (listings ?? []) as { property_id: string; external_id: string | null }[]) {
    if (!owners.has(row.property_id)) continue;
    for (const reference of parseImobiliareReferences(row.external_id)) {
      map.set(reference, {
        propertyId: row.property_id,
        userId: owners.get(row.property_id) ?? null,
      });
    }
  }
  return map;
}

/* ------------------------------ memoria scurtă ----------------------------- */

type UsageCacheEntry = {
  expiresAt: number;
  /** Consumul agenției raportat de portal. */
  total: number | null;
  totalFromPortal: boolean;
  /** Anunțurile care ocupă serviciul, cu proprietarul lor. */
  refs: { reference: string; propertyId: string; userId: string | null }[];
  /** Valorile numerice deja citite, per referință. */
  amounts: Map<string, number>;
  error: string | null;
};

const usageCache = new Map<string, UsageCacheEntry>();

function cacheKey(organizationId: string, serviceKey: string): string {
  return `${organizationId}|${serviceKey}`;
}

/** Se apelează după fiecare scriere reușită către portal. */
export function invalidatePromotionUsageCache(organizationId: string, serviceKey?: string): void {
  if (serviceKey) {
    usageCache.delete(cacheKey(organizationId, serviceKey));
    return;
  }
  for (const key of [...usageCache.keys()]) {
    if (key.startsWith(`${organizationId}|`)) usageCache.delete(key);
  }
}

export function clearPromotionUsageCache(): void {
  usageCache.clear();
}

async function loadCacheEntry(input: {
  admin: Admin;
  session: ImobiliareSession;
  organizationId: string;
  definition: ImobiliarePromotionDefinition;
  now: number;
}): Promise<UsageCacheEntry> {
  const key = cacheKey(input.organizationId, input.definition.id);
  const cached = usageCache.get(key);
  if (cached && cached.expiresAt > input.now) return cached;

  const { fetchImobiliareSlotInventory, fetchImobiliareSlotListings } = await import(
    "@/lib/portals/imobiliare/promotions.server"
  );

  if (!input.definition.slotType) {
    const entry: UsageCacheEntry = {
      expiresAt: input.now + PROMOTION_USAGE_TTL_MS,
      total: 0,
      totalFromPortal: false,
      refs: [],
      amounts: new Map(),
      error: null,
    };
    usageCache.set(key, entry);
    return entry;
  }

  const [inventory, listings, owners] = await Promise.all([
    fetchImobiliareSlotInventory({
      session: input.session,
      organizationId: input.organizationId,
      slotType: input.definition.slotType,
    }),
    fetchImobiliareSlotListings({
      session: input.session,
      organizationId: input.organizationId,
      slotType: input.definition.slotType,
    }),
    loadImobiliareReferenceOwners(input.admin, input.organizationId),
  ]);

  const refs: UsageCacheEntry["refs"] = [];
  if (listings.ok) {
    for (const listing of listings.listings) {
      const reference = listing.reference;
      if (!reference) continue;
      const owner = owners.get(reference);
      if (!owner) continue;
      refs.push({ reference, propertyId: owner.propertyId, userId: owner.userId });
    }
  }

  const entry: UsageCacheEntry = {
    expiresAt: input.now + PROMOTION_USAGE_TTL_MS,
    total: inventory.inventory?.used ?? null,
    totalFromPortal: inventory.inventory !== null,
    refs,
    amounts: new Map(),
    error: inventory.inventory === null ? inventory.error : null,
  };
  usageCache.set(key, entry);
  return entry;
}

/**
 * Consumul unui serviciu: totalul agenției de la portal plus consumul
 * utilizatorilor ceruți. Un utilizator necalculabil este raportat separat.
 */
export async function loadPromotionUsage(input: {
  admin: Admin;
  session: ImobiliareSession;
  organizationId: string;
  definition: ImobiliarePromotionDefinition;
  /** Pentru cine calculăm consumul individual; gol = doar totalul agenției. */
  userIds: string[];
  maxListingReads?: number;
  now?: () => number;
}): Promise<PromotionUsage> {
  const now = (input.now ?? (() => Date.now()))();
  const entry = await loadCacheEntry({
    admin: input.admin,
    session: input.session,
    organizationId: input.organizationId,
    definition: input.definition,
    now,
  });

  const byUser = new Map<string, number>();
  const unknownUsers: string[] = [];
  const wanted = new Set(input.userIds);

  if (input.definition.kind === "numeric") {
    const { fetchImobiliareListingPromotions } = await import(
      "@/lib/portals/imobiliare/promotions.server"
    );
    let budget = input.maxListingReads ?? PROMOTION_LISTING_READ_BUDGET;
    for (const userId of wanted) {
      const refs = entry.refs.filter((ref) => ref.userId === userId);
      const missing = refs.filter((ref) => !entry.amounts.has(ref.reference));
      if (refs.length > PROMOTION_USER_LISTING_CAP || missing.length > budget) {
        unknownUsers.push(userId);
        continue;
      }
      let failed = false;
      for (const ref of missing) {
        const state = await fetchImobiliareListingPromotions({
          session: input.session,
          organizationId: input.organizationId,
          reference: ref.reference,
        });
        budget -= 1;
        if (state.error) {
          failed = true;
          break;
        }
        const value = state.states.get(input.definition.id);
        entry.amounts.set(
          ref.reference,
          typeof value === "number" ? Math.max(Math.trunc(value), 0) : 0,
        );
      }
      if (failed) {
        unknownUsers.push(userId);
        continue;
      }
      byUser.set(
        userId,
        refs.reduce((sum, ref) => sum + (entry.amounts.get(ref.reference) ?? 0), 0),
      );
    }
  } else {
    for (const userId of wanted) {
      byUser.set(userId, entry.refs.filter((ref) => ref.userId === userId).length);
    }
  }

  return {
    byUser,
    total: entry.total,
    totalFromPortal: entry.totalFromPortal,
    unknownUsers,
    error: entry.error,
  };
}

/** Consumul mai multor servicii, pentru ecranul de administrare. */
export async function loadImobiliarePromotionUsage(input: {
  admin: Admin;
  session: ImobiliareSession;
  organizationId: string;
  definitions: ImobiliarePromotionDefinition[];
  userIds: string[];
}): Promise<Map<string, PromotionUsage>> {
  const usage = new Map<string, PromotionUsage>();
  for (const definition of input.definitions) {
    try {
      usage.set(
        definition.id,
        await loadPromotionUsage({
          admin: input.admin,
          session: input.session,
          organizationId: input.organizationId,
          definition,
          userIds: input.userIds,
        }),
      );
    } catch {
      usage.set(
        definition.id,
        emptyPromotionUsage("Imobiliare.ro nu a putut fi contactat pentru acest serviciu."),
      );
    }
  }
  return usage;
}

/* ------------------------- serviciile active pe oferte ---------------------- */

/**
 * Ce oferte ocupă serviciul, cu cine răspunde de ele și când a fost activat
 * (din jurnalul operațiunilor). Se folosește la planul de retragere.
 */
export async function loadPromotionHoldings(input: {
  admin: Admin;
  session: ImobiliareSession;
  organizationId: string;
  definition: ImobiliarePromotionDefinition;
}): Promise<{ holdings: PromotionHolding[]; skipped: number }> {
  const now = Date.now();
  const entry = await loadCacheEntry({
    admin: input.admin,
    session: input.session,
    organizationId: input.organizationId,
    definition: input.definition,
    now,
  });

  const { data: logs } = await input.admin
    .from("portal_operation_logs")
    .select("property_id, operation, created_at")
    .eq("organization_id", input.organizationId)
    .eq("portal", IMOBILIARE_PORTAL_KEY)
    .eq("success", true)
    .order("created_at", { ascending: false })
    .limit(500);
  const activatedAt = new Map<string, string>();
  for (const row of (logs ?? []) as {
    property_id: string | null;
    operation: string | null;
    created_at: string | null;
  }[]) {
    if (!row.property_id || !row.created_at) continue;
    if (!row.operation?.startsWith(`promotion:${input.definition.id}:`)) continue;
    if (row.operation.endsWith(":off") || row.operation.endsWith(":0")) continue;
    if (!activatedAt.has(row.property_id)) activatedAt.set(row.property_id, row.created_at);
  }

  const holdings: PromotionHolding[] = [];
  let skipped = 0;

  if (input.definition.kind === "numeric") {
    const { fetchImobiliareListingPromotions } = await import(
      "@/lib/portals/imobiliare/promotions.server"
    );
    let budget = PROMOTION_LISTING_READ_BUDGET;
    for (const ref of entry.refs) {
      let amount = entry.amounts.get(ref.reference);
      if (amount === undefined) {
        if (budget <= 0) {
          skipped += 1;
          continue;
        }
        const state = await fetchImobiliareListingPromotions({
          session: input.session,
          organizationId: input.organizationId,
          reference: ref.reference,
        });
        budget -= 1;
        if (state.error) {
          skipped += 1;
          continue;
        }
        const value = state.states.get(input.definition.id);
        amount = typeof value === "number" ? Math.max(Math.trunc(value), 0) : 0;
        entry.amounts.set(ref.reference, amount);
      }
      if (amount <= 0) continue;
      holdings.push({
        propertyId: ref.propertyId,
        userId: ref.userId,
        amount,
        activatedAt: activatedAt.get(ref.propertyId) ?? null,
      });
    }
  } else {
    for (const ref of entry.refs) {
      holdings.push({
        propertyId: ref.propertyId,
        userId: ref.userId,
        amount: 1,
        activatedAt: activatedAt.get(ref.propertyId) ?? null,
      });
    }
  }

  return { holdings, skipped };
}

/* --------------------------------- poarta ---------------------------------- */

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
  const serviceAllocations =
    allocations.get(input.definition.id) ?? new Map<string, number | null>();
  const userId =
    ((property as { data: { assigned_to: string | null } | null }).data?.assigned_to ?? null) ||
    null;
  const allocation = userId ? promotionAllocationFor(serviceAllocations, userId) : null;

  // Consumul se citește numai dacă există un plafon de verificat.
  const usage =
    setting.enabled && (allocation !== null || setting.agencyCap !== null)
      ? await loadPromotionUsage({
          admin: input.admin,
          session: input.session,
          organizationId: input.organizationId,
          definition: input.definition,
          userIds: allocation !== null && userId ? [userId] : [],
        })
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
