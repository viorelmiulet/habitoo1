/**
 * Administrarea promovărilor Imobiliare.ro la nivel de agenție.
 *
 * Accesul este identic cu al locurilor de publicare: `agency_admin` numai pe
 * agenția din sesiune, Superadmin pe agenția indicată explicit. Contoarele
 * portalului și consumul agenților se citesc LIVE, nu din baza locală.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IMOBILIARE_PORTAL_KEY } from "@/lib/portals/imobiliare/config";
import {
  IMOBILIARE_PROMOTIONS,
  imobiliarePromotion,
} from "@/lib/portals/imobiliare/promotions";
import { requireSlotAdminOrg } from "@/lib/portals/slots.server";
import {
  promotionAllocationFor,
  promotionRemaining,
  validatePromotionCap,
  type PromotionKind,
} from "./allocation";
import {
  PROMOTION_ALLOCATIONS_TABLE,
  PROMOTION_SETTINGS_TABLE,
  loadImobiliarePromotionUsage,
  loadPromotionAllocations,
  loadPromotionSettings,
} from "./allocation.server";

export type PromotionAdminUserCell = {
  userId: string;
  name: string;
  /** `null` = nelimitat în limita agenției. */
  allocated: number | null;
  /** `null` = consumul acestui coleg nu a putut fi calculat acum. */
  used: number | null;
  remaining: number | null;
};

export type PromotionAdminService = {
  serviceKey: string;
  label: string;
  kind: PromotionKind;
  manageable: boolean;
  note: string | null;
  enabled: boolean;
  agencyCap: number | null;
  /** Rezerva reală de la portal. */
  poolTotal: number | null;
  poolUsed: number | null;
  poolAvailable: number | null;
  poolError: string | null;
  /** Consumul agenției, din contorul serviciului; `null` = neraportat. */
  agencyUsed: number | null;
  /** `true` = totalul vine direct de la portal, nu din citiri individuale. */
  usageFromPortal: boolean;
  /** Colegii pentru care consumul nu a putut fi calculat acum. */
  unknownUsers: string[];
  usageError: string | null;
  cells: PromotionAdminUserCell[];
};

export type PromotionAdminView = {
  available: boolean;
  message: string | null;
  organizationId: string | null;
  users: { userId: string; name: string }[];
  services: PromotionAdminService[];
  syncedAt: string | null;
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function imobiliareSession(organizationId: string) {
  const { getPortalDefinition } = await import("@/lib/portals/registry");
  const definition = getPortalDefinition(IMOBILIARE_PORTAL_KEY);
  if (!definition || definition.status !== "available") {
    return { ok: false as const, message: "Integrarea Imobiliare.ro nu este disponibilă." };
  }
  const { buildContext } = await import("@/lib/portals.functions");
  const { row, ctx } = await buildContext(organizationId, definition);
  if (!row || row.activated !== true) {
    return { ok: false as const, message: "Imobiliare.ro nu este activat pentru această agenție." };
  }
  const admin = await loadAdmin();
  const { getImobiliareSession } = await import("@/lib/portals/imobiliare/auth.server");
  const session = await getImobiliareSession({
    admin,
    organizationId,
    username: ctx.externalAccountId,
    credential: ctx.portalCredential,
  });
  if (!session.ok) return { ok: false as const, message: session.message };
  return { ok: true as const, session: session.session, admin };
}

async function loadAgencyUsers(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  organizationId: string,
): Promise<{ userId: string; name: string }[]> {
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("organization_id", organizationId);
  return ((data ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((row) => ({ userId: row.id, name: row.full_name || row.email || "Utilizator" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

export const getImobiliarePromotionAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PromotionAdminView> => {
    const organizationId = await requireSlotAdminOrg(
      context as never,
      data.organizationId ?? null,
    );
    const prepared = await imobiliareSession(organizationId);
    if (!prepared.ok) {
      return {
        available: false,
        message: prepared.message,
        organizationId,
        users: [],
        services: [],
        syncedAt: null,
      };
    }

    const { fetchImobiliareSlotInventories } = await import(
      "@/lib/portals/imobiliare/promotions.server"
    );
    const [users, settings, allocations, inventories] = await Promise.all([
      loadAgencyUsers(prepared.admin, organizationId),
      loadPromotionSettings(prepared.admin, { organizationId }),
      loadPromotionAllocations(prepared.admin, { organizationId }),
      fetchImobiliareSlotInventories({ session: prepared.session, organizationId }),
    ]);
    const usage = await loadImobiliarePromotionUsage({
      admin: prepared.admin,
      session: prepared.session,
      organizationId,
      definitions: IMOBILIARE_PROMOTIONS.filter((item) => item.slotType !== null),
      userIds: users.map((user) => user.userId),
    });

    const services: PromotionAdminService[] = IMOBILIARE_PROMOTIONS.map((definition) => {
      const setting = settings.get(definition.id) ?? { enabled: false, agencyCap: null };
      const serviceAllocations =
        allocations.get(definition.id) ?? new Map<string, number | null>();
      const slot = definition.slotType ? inventories.get(definition.slotType) : undefined;
      const serviceUsage = usage.get(definition.id) ?? null;
      return {
        serviceKey: definition.id,
        label: definition.label,
        kind: definition.kind,
        manageable: definition.writeField !== null,
        note: definition.note ?? null,
        enabled: setting.enabled,
        agencyCap: setting.agencyCap,
        poolTotal: slot?.inventory?.total ?? null,
        poolUsed: slot?.inventory?.used ?? null,
        poolAvailable: slot?.inventory?.available ?? null,
        poolError: slot?.error ?? null,
        agencyUsed: serviceUsage?.total ?? null,
        usageFromPortal: serviceUsage?.totalFromPortal ?? false,
        unknownUsers: serviceUsage?.unknownUsers ?? [],
        usageError: serviceUsage?.error ?? null,
        cells: users.map((user) => {
          const allocated = promotionAllocationFor(serviceAllocations, user.userId);
          const unknown = serviceUsage?.unknownUsers.includes(user.userId) ?? false;
          const used = unknown ? null : (serviceUsage?.byUser.get(user.userId) ?? 0);
          return {
            userId: user.userId,
            name: user.name,
            allocated,
            used,
            remaining: used === null ? null : promotionRemaining(allocated, used),
          };
        }),
      };
    });

    const syncedAt =
      [...inventories.values()]
        .map((slot) => slot.syncedAt)
        .filter((value): value is string => value !== null)
        .sort()
        .at(-1) ?? null;

    return { available: true, message: null, organizationId, users, services, syncedAt };
  });

export type PromotionAdminActionResult = { ok: boolean; message: string };

async function upsertSetting(input: {
  organizationId: string;
  serviceKey: string;
  actorId: string;
  patch: { enabled?: boolean; agency_cap?: number | null };
}): Promise<void> {
  const admin = await loadAdmin();
  const { data: existing } = await admin
    .from(PROMOTION_SETTINGS_TABLE)
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("portal_key", IMOBILIARE_PORTAL_KEY)
    .eq("service_key", input.serviceKey)
    .maybeSingle();
  const row = {
    organization_id: input.organizationId,
    portal_key: IMOBILIARE_PORTAL_KEY,
    service_key: input.serviceKey,
    updated_by: input.actorId,
    updated_at: new Date().toISOString(),
    ...input.patch,
  };
  if (existing?.id) {
    await admin.from(PROMOTION_SETTINGS_TABLE).update(row).eq("id", existing.id);
    return;
  }
  await admin.from(PROMOTION_SETTINGS_TABLE).insert(row);
}

export const setImobiliarePromotionService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        serviceKey: z.string().min(1).max(64),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PromotionAdminActionResult> => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const definition = imobiliarePromotion(data.serviceKey);
    if (!definition) return { ok: false, message: "Serviciu de promovare necunoscut." };
    await upsertSetting({
      organizationId,
      serviceKey: definition.id,
      actorId: (context as unknown as { userId: string }).userId,
      patch: { enabled: data.enabled },
    });
    return {
      ok: true,
      message: data.enabled
        ? `${definition.label} este activat pentru agenție.`
        : `${definition.label} nu se mai folosește în agenție.`,
    };
  });

export const setImobiliarePromotionCap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        serviceKey: z.string().min(1).max(64),
        cap: z.number().int().min(0).max(100_000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PromotionAdminActionResult> => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const definition = imobiliarePromotion(data.serviceKey);
    if (!definition) return { ok: false, message: "Serviciu de promovare necunoscut." };

    if (data.cap !== null) {
      const prepared = await imobiliareSession(organizationId);
      if (!prepared.ok) return { ok: false, message: prepared.message };
      const { fetchImobiliareSlotInventory } = await import(
        "@/lib/portals/imobiliare/promotions.server"
      );
      const slot = definition.slotType
        ? await fetchImobiliareSlotInventory({
            session: prepared.session,
            organizationId,
            slotType: definition.slotType,
          })
        : null;
      const check = validatePromotionCap({
        label: definition.label,
        cap: data.cap,
        poolTotal: slot?.inventory?.total ?? null,
      });
      if (!check.ok) return { ok: false, message: check.message };
    }

    await upsertSetting({
      organizationId,
      serviceKey: definition.id,
      actorId: (context as unknown as { userId: string }).userId,
      patch: { agency_cap: data.cap },
    });
    return {
      ok: true,
      message:
        data.cap === null
          ? `${definition.label}: plafonul agenției a fost eliminat (limita este rezerva de la portal).`
          : `${definition.label}: plafonul agenției este ${data.cap}.`,
    };
  });

export const setImobiliarePromotionAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        serviceKey: z.string().min(1).max(64),
        userId: z.string().uuid(),
        amount: z.number().int().min(0).max(100_000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PromotionAdminActionResult> => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const definition = imobiliarePromotion(data.serviceKey);
    if (!definition) return { ok: false, message: "Serviciu de promovare necunoscut." };

    const admin = await loadAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!profile?.id) return { ok: false, message: "Utilizatorul nu face parte din agenție." };

    const row = {
      organization_id: organizationId,
      portal_key: IMOBILIARE_PORTAL_KEY,
      service_key: definition.id,
      user_id: data.userId,
      amount: data.amount,
      updated_by: (context as unknown as { userId: string }).userId,
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await admin
      .from(PROMOTION_ALLOCATIONS_TABLE)
      .select("id")
      .eq("organization_id", organizationId)
      .eq("portal_key", IMOBILIARE_PORTAL_KEY)
      .eq("service_key", definition.id)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (existing?.id) {
      await admin.from(PROMOTION_ALLOCATIONS_TABLE).update(row).eq("id", existing.id);
    } else {
      await admin.from(PROMOTION_ALLOCATIONS_TABLE).insert(row);
    }

    return {
      ok: true,
      message:
        data.amount === null
          ? `${definition.label}: alocare nelimitată în limita agenției.`
          : `${definition.label}: alocare de ${data.amount}.`,
    };
  });
