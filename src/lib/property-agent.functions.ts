/**
 * Mutarea anunțurilor către alt agent responsabil. Permisă doar managerului
 * agenției (agency_admin) și superadminului; rolul se verifică pe server.
 *
 * Publicările rămân neatinse; noul agent devine contact la următoarea
 * sincronizare. Declanșatorul de locuri din baza de date nu este ocolit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { portalDisplayName } from "@/lib/portals/registry";
import type { ReassignPorts } from "@/lib/property-reassign.server";

type Ctx = { supabase: any; userId: string };

async function buildPorts(context: Ctx): Promise<ReassignPorts> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  return {
    callerId: context.userId,
    isSuperadmin: async () => {
      const { data } = await context.supabase.rpc("is_superadmin");
      return data === true;
    },
    adminOrgIds: async () => {
      const { data } = await admin
        .from("user_roles")
        .select("organization_id")
        .eq("user_id", context.userId)
        .eq("role", "agency_admin");
      return ((data ?? []) as { organization_id: string | null }[])
        .map((r) => r.organization_id)
        .filter((v): v is string => Boolean(v));
    },
    loadProperties: async (ids) => {
      const { data, error } = await admin
        .from("properties")
        .select("id, organization_id, assigned_to, reference, deleted_at")
        .in("id", ids);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    loadTarget: async (userId, organizationId) => {
      const [profile, roles, jobs] = await Promise.all([
        admin
          .from("profiles")
          .select("id, organization_id, full_name, email, phone, is_active")
          .eq("id", userId)
          .maybeSingle(),
        admin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("organization_id", organizationId),
        admin
          .from("account_deletion_jobs")
          .select("id")
          .eq("target_id", userId)
          .in("status", ["queued", "running"]),
      ]);
      if (!profile.data) return null;
      return {
        ...profile.data,
        roles: ((roles.data ?? []) as { role: string }[]).map((r) => r.role),
        hasActiveDeletionJob: (jobs.data ?? []).length > 0,
      };
    },
    updateAssigned: async (propertyId, userId) => {
      const { error } = await context.supabase
        .from("properties")
        .update({ assigned_to: userId })
        .eq("id", propertyId);
      return { error: error ? error.message : null };
    },
    audit: async (row) => {
      try {
        await admin.from("audit_logs").insert({
          organization_id: row.organizationId,
          actor_id: context.userId,
          action: row.action,
          entity: "properties",
          entity_id: row.entityId,
          new_values: row.values,
          created_by: context.userId,
        });
      } catch {
        /* auditul nu blochează mutarea */
      }
    },
    portalName: (key) => portalDisplayName(key as never),
  };
}

export const reassignProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyIds: z.array(z.string().uuid()).min(1).max(100),
        toUserId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { reassignPropertiesCore } = await import("@/lib/property-reassign.server");
    return reassignPropertiesCore(await buildPorts(context as Ctx), data);
  });

/** Anunțurile nesterse ale unui utilizator (pentru „Mută toate anunțurile”). */
export const listUserPropertyIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { requireReassignAdmin } = await import("@/lib/property-reassign.server");
    const ports = await buildPorts(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("Utilizatorul nu face parte din agenție.");
    await requireReassignAdmin(ports, profile.organization_id);
    const { data: rows, error } = await admin
      .from("properties")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("assigned_to", data.userId)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return { ids: ((rows ?? []) as { id: string }[]).map((r) => r.id) };
  });

/** Compatibilitate: mutarea unui singur anunț, cu aceleași reguli. */
export const reassignPropertyAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ propertyId: z.string().uuid(), agentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { reassignPropertiesCore } = await import("@/lib/property-reassign.server");
    const res = await reassignPropertiesCore(await buildPorts(context as Ctx), {
      propertyIds: [data.propertyId],
      toUserId: data.agentId,
    });
    if (res.blocked.length > 0) {
      return { ok: false as const, code: "SLOT_LIMIT", message: res.blocked[0]!.message };
    }
    return { ok: true as const, agentId: data.agentId };
  });
