/**
 * Administrarea locurilor de publicare: totalul agenției și alocările per agent.
 * Pot fi setate de administratorul agenției (pentru agenția lui) și de superadmin.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireActiveOrgAuth } from "@/lib/org-access";
import { portalDisplayName, getPortalDefinition } from "@/lib/portals/registry";
import { resolvePublishingOrg, type AuthContext } from "@/lib/portals.functions";
import { allocationFor, remainingSlots } from "@/lib/portals/slots";
import { loadPortalSlotState, logSlotAllocationChange } from "@/lib/portals/slots.server";

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
    const { organizationId } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
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

export const setPortalSlotTotal = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid().optional(),
        portalId: portalKeySchema,
        totalSlots: slotsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");

    const admin = await loadAdmin();
    const { data: existing } = await admin
      .from("portal_slot_limits")
      .select("total_slots")
      .eq("organization_id", organizationId)
      .eq("portal_key", definition.id)
      .maybeSingle();

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
    return { ok: true as const, totalSlots: data.totalSlots };
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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolvePublishingOrg(
      context as unknown as AuthContext,
      data.organizationId,
    );
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
    return { ok: true as const, slots: data.slots };
  });
