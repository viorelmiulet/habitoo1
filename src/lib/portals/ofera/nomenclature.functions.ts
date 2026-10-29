import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OferaChanges, OferaSyncCounts } from "./nomenclature";
export const syncOferaNomenclature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("is_superadmin");
    if (data !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const { syncOferaNomenclatureServer } = await import("./nomenclature.server");
    return syncOferaNomenclatureServer(context.userId);
  });
export const getOferaNomenclatureStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed } = await context.supabase.rpc("is_superadmin");
    if (allowed !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const [{ data, error }, categories, cities, zones] = await Promise.all([
      context.supabase.from("ofera_nomenclature_syncs").select("synced_at,success,error_message,counts,changes").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
      context.supabase.from("ofera_categories").select("id", { count: "exact", head: true }).eq("active", true),
      context.supabase.from("ofera_cities").select("id", { count: "exact", head: true }).eq("active", true),
      context.supabase.from("ofera_zones").select("id", { count: "exact", head: true }).eq("active", true),
    ]);
    if (error || categories.error || cities.error || zones.error) throw new Error("Nomenclatorul Ofera nu a putut fi citit.");
    return { syncedAt: data?.synced_at ?? null, success: data?.success ?? null, error: data?.error_message ?? null, counts: (data?.counts ?? null) as OferaSyncCounts | null, changes: (data?.changes ?? null) as OferaChanges | null, active: { categories: categories.count ?? 0, cities: cities.count ?? 0, zones: zones.count ?? 0 } };
  });