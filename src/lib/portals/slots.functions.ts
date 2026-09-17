/**
 * Administrarea locurilor de publicare: totalul agenției și alocările per agent.
 * Pot fi setate de administratorul agenției (pentru agenția lui) și de superadmin.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireActiveOrgAuth } from "@/lib/org-access";
import { portalDisplayName, getPortalDefinition } from "@/lib/portals/registry";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allocationFor, remainingSlots } from "@/lib/portals/slots";
import {
  loadMyPortalSlot,
  loadPortalSlotState,
  logSlotAllocationChange,
  requireSlotAdminOrg,
} from "@/lib/portals/slots.server";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const portalKeySchema = z.string().min(1).max(40);
/** `null` înseamnă nelimitat, explicit. */
const slotsSchema = z.number().int().min(0).max(100_000).nullable();

export const getPortalSlotOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid().optional(), portalId: portalKeySchema })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Doar Superadmin sau administratorul acestei agenții; agenții sunt refuzați.
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    const admin = await loadAdmin();
    const state = await loadPortalSlotState(admin, organizationId, definition.id);
    const { data: members } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("organization_id", organizationId);

    return {
      portalId: definition.id,
      portalName: portalDisplayName(definition.id as never),
      agencyTotal: state.agencyTotal,
      agencyUsed: state.usedByAgency,
      agencyRemaining: remainingSlots(state.agencyTotal, state.usedByAgency),
      agents: ((members ?? []) as { id: string; full_name: string | null; email: string | null }[])
        .map((member) => {
          const total = allocationFor(state, member.id);
          const used = state.usedByAgent.get(member.id) ?? 0;
          return {
            userId: member.id,
            name: member.full_name?.trim() || member.email || member.id,
            total,
            used,
            remaining: remainingSlots(total, used),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "ro")),
    };
  });

/**
 * Ce anunțuri s-ar retrage dacă noile limite s-ar salva. Doar citire: dialogul de
 * confirmare o folosește, iar anularea nu schimbă nimic.
 */
export const previewPortalSlotChange = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        portalId: portalKeySchema,
        totalSlots: slotsSchema.optional(),
        userId: z.string().uuid().optional(),
        slots: slotsSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    const admin = await loadAdmin();
    const { planPortalSlotWithdrawals } = await import("@/lib/portals/slot-withdraw.server");
    const withdrawals = await planPortalSlotWithdrawals(admin as never, {
      organizationId,
      portalKey: definition.id,
      ...(data.userId ? { allocation: { userId: data.userId, slots: data.slots ?? null } } : {}),
      ...(data.userId ? {} : { agencyTotal: data.totalSlots ?? null }),
    });
    return {
      portalId: definition.id,
      portalName: portalDisplayName(definition.id as never),
      withdrawals,
    };
  });

/**
 * Pune în coadă retragerile surplusului, după salvarea limitelor. Retragerile
 * rulează pe server, durabil; eșecurile se raportează per proprietate și NU
 * anulează modificarea limitei.
 */
async function queueWithdrawals(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  input: {
    organizationId: string;
    portalKey: string;
    actorId: string | null;
    agencyTotal?: number | null;
    allocation?: { userId: string; slots: number | null };
  },
) {
  const { planPortalSlotWithdrawals, enqueuePortalSlotWithdrawals } = await import(
    "@/lib/portals/slot-withdraw.server"
  );
  const plan = await planPortalSlotWithdrawals(admin as never, {
    organizationId: input.organizationId,
    portalKey: input.portalKey,
    ...(input.allocation ? { allocation: input.allocation } : {}),
    ...(input.agencyTotal !== undefined ? { agencyTotal: input.agencyTotal } : {}),
  });
  const queued = await enqueuePortalSlotWithdrawals(admin as never, {
    organizationId: input.organizationId,
    portalKey: input.portalKey,
    propertyIds: plan.map((item) => item.propertyId),
    startedBy: input.actorId,
  });
  return { withdrawals: plan, queueError: queued.error };
}

export const setPortalSlotTotal = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        portalId: portalKeySchema,
        totalSlots: slotsSchema,
        /** Confirmarea retragerilor arătate în dialog. */
        confirmWithdrawals: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Doar Superadmin sau administratorul acestei agenții; agenții sunt refuzați.
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    const admin = await loadAdmin();
    const { data: existing } = await admin
      .from("portal_slot_limits")
      .select("total_slots")
      .eq("organization_id", organizationId)
      .eq("portal_key", definition.id)
      .maybeSingle();

    // Reducerea sub consum se salvează doar după confirmarea retragerilor.
    const { planPortalSlotWithdrawals } = await import("@/lib/portals/slot-withdraw.server");
    const planned = await planPortalSlotWithdrawals(admin as never, {
      organizationId,
      portalKey: definition.id,
      agencyTotal: data.totalSlots,
    });
    if (planned.length > 0 && data.confirmWithdrawals !== true) {
      return { ok: false as const, requiresConfirmation: true as const, withdrawals: planned };
    }

    const { error } = await admin.from("portal_slot_limits").upsert(
      {
        organization_id: organizationId,
        portal_key: definition.id,
        total_slots: data.totalSlots,
        updated_by: context.userId,
      } as never,
      { onConflict: "organization_id,portal_key" },
    );
    if (error) throw new Error(error.message);

    await logSlotAllocationChange(admin, {
      organizationId,
      actorId: context.userId,
      portalKey: definition.id,
      previous: (existing as { total_slots: number | null } | null)?.total_slots ?? null,
      next: data.totalSlots,
    });

    const queued = await queueWithdrawals(admin, {
      organizationId,
      portalKey: definition.id,
      actorId: context.userId,
    });
    return {
      ok: true as const,
      totalSlots: data.totalSlots,
      withdrawals: queued.withdrawals,
      queueError: queued.queueError,
    };
  });

export const setPortalSlotAllocation = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        portalId: portalKeySchema,
        userId: z.string().uuid(),
        slots: slotsSchema,
        confirmWithdrawals: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Doar Superadmin sau administratorul acestei agenții; agenții sunt refuzați.
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    const admin = await loadAdmin();
    const { data: member } = await admin
      .from("profiles")
      .select("id")
      .eq("id", data.userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!member) throw new Error("Utilizatorul nu face parte din agenție.");

    const { data: existing } = await admin
      .from("portal_slot_allocations")
      .select("slots")
      .eq("organization_id", organizationId)
      .eq("portal_key", definition.id)
      .eq("user_id", data.userId)
      .maybeSingle();

    const { planPortalSlotWithdrawals } = await import("@/lib/portals/slot-withdraw.server");
    const planned = await planPortalSlotWithdrawals(admin as never, {
      organizationId,
      portalKey: definition.id,
      allocation: { userId: data.userId, slots: data.slots },
    });
    if (planned.length > 0 && data.confirmWithdrawals !== true) {
      return { ok: false as const, requiresConfirmation: true as const, withdrawals: planned };
    }

    const { error } = await admin.from("portal_slot_allocations").upsert(
      {
        organization_id: organizationId,
        portal_key: definition.id,
        user_id: data.userId,
        slots: data.slots,
        updated_by: context.userId,
      } as never,
      { onConflict: "organization_id,portal_key,user_id" },
    );
    if (error) throw new Error(error.message);

    await logSlotAllocationChange(admin, {
      organizationId,
      actorId: context.userId,
      portalKey: definition.id,
      userId: data.userId,
      previous: (existing as { slots: number | null } | null)?.slots ?? null,
      next: data.slots,
    });

    const queued = await queueWithdrawals(admin, {
      organizationId,
      portalKey: definition.id,
      actorId: context.userId,
    });
    return {
      ok: true as const,
      slots: data.slots,
      withdrawals: queued.withdrawals,
      queueError: queued.queueError,
    };
  });

/** Progresul ultimei retrageri automate a agenției — doar administratorii. */
export const getPortalSlotWithdrawStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const admin = await loadAdmin();
    const { readPortalSlotWithdrawProgress } = await import("@/lib/portals/slot-withdraw.server");
    const progress = await readPortalSlotWithdrawProgress(admin as never, organizationId);
    return progress
      ? { ...progress, portalName: portalDisplayName(progress.portalKey as never) }
      : null;
  });

/**
 * Tabloul complet pentru pagina „Sloturi portaluri”: rânduri = utilizatorii
 * agenției, coloane = portalurile activate pentru agenție.
 */
export const getPortalSlotMatrix = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const admin = await loadAdmin();

    const { data: connections } = await admin
      .from("portal_connections")
      .select("portal, activated")
      .eq("organization_id", organizationId);
    const portalKeys = ((connections ?? []) as { portal: string; activated: boolean | null }[])
      .filter((row) => row.activated === true)
      .map((row) => row.portal)
      .filter((key) => getPortalDefinition(key) !== undefined);

    const { data: members } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("organization_id", organizationId);
    const users = ((members ?? []) as { id: string; full_name: string | null; email: string | null }[])
      .map((member) => ({
        userId: member.id,
        name: member.full_name?.trim() || member.email || member.id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ro"));

    const portals = [];
    for (const portalKey of portalKeys) {
      const state = await loadPortalSlotState(admin, organizationId, portalKey);
      portals.push({
        portalId: portalKey,
        portalName: portalDisplayName(portalKey as never),
        agencyTotal: state.agencyTotal,
        agencyUsed: state.usedByAgency,
        agencyRemaining: remainingSlots(state.agencyTotal, state.usedByAgency),
        cells: users.map((user) => {
          const total = allocationFor(state, user.userId);
          const used = state.usedByAgent.get(user.userId) ?? 0;
          return {
            userId: user.userId,
            total,
            used,
            remaining: remainingSlots(total, used),
          };
        }),
      });
    }

    return { organizationId, users, portals };
  });


/**
 * Cifrele PROPRII ale utilizatorului pe un portal — doar citire, doar rândul lui.
 * Orice utilizator autentificat al agenției poate cere acest răspuns.
 */
export const getMyPortalSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ portalId: portalKeySchema }).parse(input))
  .handler(async ({ data, context }) => {
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    // Agenția vine din profilul sesiunii, niciodată din input.
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("Contul nu este asociat unei agenții.");

    const admin = await loadAdmin();
    const mine = await loadMyPortalSlot(admin, {
      organizationId: profile.organization_id,
      userId: context.userId,
      portalKey: definition.id,
    });
    return { ...mine, portalName: portalDisplayName(definition.id as never) };
  });

/** Jurnalul modificărilor de locuri: cine a schimbat ce și când. */
export const getPortalSlotAuditTrail = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid().optional(), limit: z.number().int().min(1).max(100).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireSlotAdminOrg(context as never, data.organizationId ?? null);
    const admin = await loadAdmin();
    const { data: rows } = await admin
      .from("audit_logs")
      .select("id, action, actor_id, entity_id, old_values, new_values, created_at")
      .eq("organization_id", organizationId)
      .in("action", ["portal.slot_total_changed", "portal.slot_allocation_changed"])
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 25);

    const entries = ((rows ?? []) as any[]).map((row) => ({
      id: row.id as string,
      action: row.action as string,
      actorId: (row.actor_id ?? null) as string | null,
      userId: (row.entity_id ?? null) as string | null,
      portalKey: ((row.new_values ?? {}) as Record<string, unknown>).portal_key as string | undefined,
      previous: (((row.old_values ?? {}) as Record<string, unknown>).slots ?? null) as number | null,
      next: (((row.new_values ?? {}) as Record<string, unknown>).slots ?? null) as number | null,
      createdAt: (row.created_at ?? null) as string | null,
    }));

    const ids = [
      ...new Set(entries.flatMap((e) => [e.actorId, e.userId].filter(Boolean) as string[])),
    ];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await admin.from("profiles").select("id, full_name, email").in("id", ids);
      for (const p of ((profiles ?? []) as any[])) {
        names.set(p.id as string, (p.full_name?.trim() || p.email || p.id) as string);
      }
    }

    return entries.map((entry) => ({
      ...entry,
      portalName: entry.portalKey ? portalDisplayName(entry.portalKey as never) : null,
      actorName: entry.actorId ? (names.get(entry.actorId) ?? null) : null,
      userName: entry.userId ? (names.get(entry.userId) ?? null) : null,
    }));
  });
