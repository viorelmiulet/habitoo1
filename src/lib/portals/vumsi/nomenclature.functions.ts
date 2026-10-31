/** Vumsi: sincronizarea nomenclatoarelor (doar SuperAdmin, doar GET) și starea ultimului snapshot. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperadmin(supabase: any) {
  const { data } = await supabase.rpc("is_superadmin");
  if (data !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
}

export const syncVumsiNomenclature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase);
    const { vumsiGet } = await import("./client.server");
    const { buildVumsiSnapshot } = await import("./nomenclature");
    const snap = await buildVumsiSnapshot(async (path, query) => {
      const r = await vumsiGet<unknown>(path, query ?? {});
      return r.ok ? { ok: true as const, data: r.data } : { ok: false as const, message: r.message };
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await (supabaseAdmin as any).from("vumsi_nomenclature_snapshots").insert({
      synced_at: now,
      synced_by: context.userId,
      reference: snap.reference,
      categories: snap.categories,
      attributes: snap.attributes,
      counts: snap.counts,
    });
    if (error) throw new Error(error.message);
    return { counts: snap.counts, syncedAt: now };
  });

export const getVumsiNomenclatureStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase);
    const { data } = await (context.supabase as any)
      .from("vumsi_nomenclature_snapshots")
      .select("synced_at,counts")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { syncedAt: (data?.synced_at as string | undefined) ?? null, counts: (data?.counts as { categories: number; attributes: number; required: number } | undefined) ?? null };
  });
