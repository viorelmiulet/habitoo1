/**
 * Mutarea unei proprietăți către alt agent responsabil.
 *
 * Consumul locurilor de publicare se mută împreună cu proprietatea: dacă noul
 * agent nu are loc liber pe un portal unde oferta este selectată, reasignarea
 * este refuzată. Oferta NU se retrage silențios.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { portalDisplayName } from "@/lib/portals/registry";

export const reassignPropertyAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: z.string().uuid(),
        agentId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Organizația vine din proprietatea vizibilă utilizatorului (RLS), nu din input.
    const { data: property, error: readError } = await context.supabase
      .from("properties")
      .select("id, organization_id, assigned_to")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!property) throw new Error("Proprietatea nu a fost găsită.");
    if ((property.assigned_to ?? null) === data.agentId) {
      return { ok: true as const, agentId: data.agentId };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureReassignSlots } = await import("@/lib/portals/slots.server");
    const guard = await ensureReassignSlots(supabaseAdmin, {
      organizationId: property.organization_id,
      propertyId: property.id,
      newAgentId: data.agentId,
      actorId: context.userId,
      portalName: (portalKey) => portalDisplayName(portalKey as never),
    });
    if (!guard.ok) return { ok: false as const, code: "SLOT_LIMIT", message: guard.message };

    // Scrierea trece prin sesiunea utilizatorului: RLS decide dacă are dreptul.
    const { error } = await context.supabase
      .from("properties")
      .update({ assigned_to: data.agentId })
      .eq("id", property.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, agentId: data.agentId };
  });
