/**
 * Imopedia.ro: previzualizarea câmpurilor `SavePropertyType` (doar SuperAdmin, doar citire).
 * Nu face niciun apel la Imopedia.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveImopediaLocation } from "./location";
import { mapPropertyToImopedia } from "./mapper";

export const previewImopediaPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { propertyId: string }) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await (context.supabase as any).rpc("is_superadmin");
    if (isSuper !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: p, error } = await admin.from("properties").select("*").eq("id", data.propertyId).maybeSingle();
    if (error || !p) throw new Error("Proprietatea nu a fost găsită.");

    const { data: conn } = await admin
      .from("portal_connections")
      .select("settings")
      .eq("organization_id", p.organization_id)
      .eq("portal", "imopedia")
      .maybeSingle();
    const agencyId = Number((conn?.settings as Record<string, unknown> | null)?.["agency_id"]) || 0;

    const { data: regions } = await admin.from("imopedia_regions").select("id,name");
    const areas: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await admin
        .from("imopedia_areas")
        .select("id,area,region_id,parent_id,depth,usable_in_api")
        .order("id")
        .range(from, from + 999);
      areas.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    const location = resolveImopediaLocation(
      { county: p.county, city: p.city, neighborhood: p.district },
      regions ?? [],
      areas,
    );
    const result = mapPropertyToImopedia(p, {
      agencyId,
      location,
      collaboration: {
        active: p.collaboration === true && p.collaboration_opted_out !== true,
        commissionPercent: typeof p.collab_commission_percent === "number" ? p.collab_commission_percent : null,
      },
    });
    const warnings = [...result.warnings];
    if (!agencyId) warnings.push("Agenția nu are ID Imopedia (AGENTIA) salvat; AGENTIA = 0 în previzualizare.");
    return {
      ok: result.ok,
      fields: result.fields.map((f) => ({ name: f.name, type: f.type, value: f.value ?? null })),
      reasons: result.ok ? [] : result.reasons,
      warnings,
      location,
    };
  });
