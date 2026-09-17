/**
 * Locuri de publicare — citirea stării reale și verificarea înainte de publicare.
 *
 * Un singur helper partajat pentru TOATE portalurile: fluxul comun de publicare
 * și mutarea unei proprietăți către alt agent folosesc aceleași numărători.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkPortalSlot,
  computePortalSlotState,
  reassignRefusalMessage,
  slotRefusalMessage,
  type PortalSlotState,
} from "./slots";

type Admin = SupabaseClient<any, any, any>;

const LIMIT_TABLE = "portal_slot_limits";
const ALLOCATION_TABLE = "portal_slot_allocations";

export const SLOT_ADMIN_ONLY =
  "Acces refuzat: locurile de publicare se administrează de administratorul agenției sau de Superadmin.";

/**
 * Garda de acces pentru administrarea locurilor. REFOLOSEȘTE garda existentă de
 * administrator de agenție (`requireLaCheieActivator`): superadminul lucrează pe
 * agenția primită explicit, iar un `agency_admin` DOAR pe agenția din sesiune,
 * cu rolul verificat pentru acea agenție. Un agent simplu este refuzat, inclusiv
 * când trimite `organizationId`-ul altei agenții.
 */
export async function requireSlotAdminOrg(
  context: Parameters<
    typeof import("@/lib/portals/lacheie/access.server").requireLaCheieActivator
  >[0],
  requestedOrganizationId?: string | null,
  deps?: Parameters<
    typeof import("@/lib/portals/lacheie/access.server").requireLaCheieActivator
  >[2],
): Promise<string> {
  const { requireLaCheieActivator, LACHEIE_ACCESS_ACTIVATOR_ONLY } = await import(
    "@/lib/portals/lacheie/access.server"
  );
  try {
    return await requireLaCheieActivator(context, requestedOrganizationId ?? null, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === LACHEIE_ACCESS_ACTIVATOR_ONLY) throw new Error(SLOT_ADMIN_ONLY);
    throw error;
  }
}

/**
 * Cifrele PROPRII ale utilizatorului pe un portal: alocarea lui, cât a consumat
 * și cât i-a rămas. Nu întoarce alte persoane și nu dă drept de modificare.
 * Totalul agenției nu este citit direct de agent (tabelul rămâne al
 * administratorilor); serverul îi spune doar dacă agenția mai are locuri.
 */
export async function loadMyPortalSlot(
  admin: Admin,
  input: { organizationId: string; userId: string; portalKey: string },
): Promise<{
  portalKey: string;
  allocated: number | null;
  used: number;
  remaining: number | null;
  agencyExhausted: boolean;
}> {
  const { allocationFor, remainingSlots } = await import("./slots");
  const state = await loadPortalSlotState(admin, input.organizationId, input.portalKey);
  const allocated = allocationFor(state, input.userId);
  const used = state.usedByAgent.get(input.userId) ?? 0;
  return {
    portalKey: input.portalKey,
    allocated,
    used,
    remaining: remainingSlots(allocated, used),
    agencyExhausted: state.agencyTotal !== null && state.usedByAgency >= state.agencyTotal,
  };
}


/** Starea locurilor pe un portal, citită din datele reale ale agenției. */
export async function loadPortalSlotState(
  admin: Admin,
  organizationId: string,
  portalKey: string,
): Promise<PortalSlotState> {
  const [{ data: limitRow }, { data: allocationRows }, { data: selections }, { data: properties }] =
    await Promise.all([
      admin
        .from(LIMIT_TABLE)
        .select("total_slots")
        .eq("organization_id", organizationId)
        .eq("portal_key", portalKey)
        .maybeSingle(),
      admin
        .from(ALLOCATION_TABLE)
        .select("user_id, slots")
        .eq("organization_id", organizationId)
        .eq("portal_key", portalKey),
      admin
        .from("portal_publications")
        .select("property_id")
        .eq("organization_id", organizationId)
        .eq("portal_key", portalKey)
        .eq("enabled", true),
      admin.from("properties").select("id, assigned_to").eq("organization_id", organizationId),
    ]);

  return computePortalSlotState({
    portalKey,
    agencyTotal: (limitRow as { total_slots: number | null } | null)?.total_slots ?? null,
    allocations: ((allocationRows ?? []) as { user_id: string; slots: number | null }[]).map(
      (row) => ({ userId: row.user_id, slots: row.slots ?? null }),
    ),
    selections: ((selections ?? []) as { property_id: string }[]).map((row) => ({
      propertyId: row.property_id,
    })),
    properties: ((properties ?? []) as { id: string; assigned_to: string | null }[]).map((row) => ({
      id: row.id,
      assignedTo: row.assigned_to ?? null,
    })),
  });
}

async function agentLabel(admin: Admin, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const row = (data ?? null) as { full_name: string | null; email: string | null } | null;
  return row?.full_name?.trim() || row?.email?.trim() || null;
}

/** Jurnalizează în audit orice refuz din cauza locurilor. */
export async function logSlotRefusal(
  admin: Admin,
  input: {
    organizationId: string;
    actorId: string | null;
    portalKey: string;
    propertyId: string | null;
    agentId: string | null;
    scope: "agent" | "agency" | "reassign";
    used?: number;
    total?: number;
    message: string;
  },
): Promise<void> {
  try {
    await admin.from("audit_logs").insert({
      organization_id: input.organizationId,
      actor_id: input.actorId,
      action: "portal.slot_refused",
      entity: "portal_publications",
      entity_id: input.propertyId,
      new_values: {
        portal_key: input.portalKey,
        agent_id: input.agentId,
        scope: input.scope,
        used: input.used ?? null,
        total: input.total ?? null,
        message: input.message,
      },
      created_by: input.actorId,
    } as never);
  } catch {
    /* auditul nu blochează refuzul */
  }
}

/** Jurnalizează schimbarea unui total de agenție sau a unei alocări. */
export async function logSlotAllocationChange(
  admin: Admin,
  input: {
    organizationId: string;
    actorId: string | null;
    portalKey: string;
    userId?: string | null;
    previous: number | null | undefined;
    next: number | null;
  },
): Promise<void> {
  await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_id: input.actorId,
    action: input.userId ? "portal.slot_allocation_changed" : "portal.slot_total_changed",
    entity: input.userId ? ALLOCATION_TABLE : LIMIT_TABLE,
    entity_id: input.userId ?? null,
    old_values: { portal_key: input.portalKey, slots: input.previous ?? null },
    new_values: { portal_key: input.portalKey, slots: input.next },
    created_by: input.actorId,
  } as never);
}

export type SlotGuardResult = { ok: true } | { ok: false; message: string };

/**
 * Verificarea din fluxul comun de publicare. Se aplică și când publicarea este
 * declanșată de un administrator de agenție sau de superadmin: locul este al
 * agentului responsabil al proprietății.
 */
export async function ensurePortalSlotAvailable(
  admin: Admin,
  input: {
    organizationId: string;
    portalKey: string;
    portalName: string;
    propertyId: string;
    actorId: string | null;
  },
): Promise<SlotGuardResult> {
  const { data: propertyRow } = await admin
    .from("properties")
    .select("assigned_to")
    .eq("id", input.propertyId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  const agentId = (propertyRow as { assigned_to: string | null } | null)?.assigned_to ?? null;

  const state = await loadPortalSlotState(admin, input.organizationId, input.portalKey);
  const check = checkPortalSlot(state, { propertyId: input.propertyId, agentId });
  if (check.ok) return { ok: true };

  const message = slotRefusalMessage({
    portalName: input.portalName,
    agentName: await agentLabel(admin, agentId),
    scope: check.scope,
    used: check.used,
    total: check.total,
  });
  await logSlotRefusal(admin, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    portalKey: input.portalKey,
    propertyId: input.propertyId,
    agentId,
    scope: check.scope,
    used: check.used,
    total: check.total,
    message,
  });
  return { ok: false, message };
}

/**
 * Mutarea unei proprietăți către alt agent mută și consumul. Dacă noul agent nu
 * are loc liber pe un portal unde oferta este selectată, reasignarea este
 * refuzată — oferta NU se retrage în silence.
 */
export async function ensureReassignSlots(
  admin: Admin,
  input: {
    organizationId: string;
    propertyId: string;
    newAgentId: string | null;
    actorId: string | null;
    portalName: (portalKey: string) => string;
  },
): Promise<SlotGuardResult> {
  if (!input.newAgentId) return { ok: true };

  const { data: selections } = await admin
    .from("portal_publications")
    .select("portal_key")
    .eq("organization_id", input.organizationId)
    .eq("property_id", input.propertyId)
    .eq("enabled", true);
  const portalKeys = ((selections ?? []) as { portal_key: string }[]).map((row) => row.portal_key);
  if (portalKeys.length === 0) return { ok: true };

  const blocked: string[] = [];
  for (const portalKey of portalKeys) {
    const state = await loadPortalSlotState(admin, input.organizationId, portalKey);
    // Proprietatea mutată nu se numără la noul agent: contează locurile lui deja ocupate.
    state.countedPropertyIds.delete(input.propertyId);
    const check = checkPortalSlot(state, {
      propertyId: input.propertyId,
      agentId: input.newAgentId,
    });
    if (!check.ok && check.scope === "agent") blocked.push(input.portalName(portalKey));
  }
  if (blocked.length === 0) return { ok: true };

  const message = reassignRefusalMessage({
    agentName: await agentLabel(admin, input.newAgentId),
    portalNames: blocked,
  });
  await logSlotRefusal(admin, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    portalKey: blocked.join(","),
    propertyId: input.propertyId,
    agentId: input.newAgentId,
    scope: "reassign",
    message,
  });
  return { ok: false, message };
}
