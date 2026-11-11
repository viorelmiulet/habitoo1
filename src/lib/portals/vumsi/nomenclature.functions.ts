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
      .select("synced_at,counts,reference")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { vumsiAllowsRealEstate } = await import("./company-type");
    return { companyTypeAllowed: data ? vumsiAllowsRealEstate(data.reference) : true, syncedAt: (data?.synced_at as string | undefined) ?? null, counts: (data?.counts as { categories: number; attributes: number; required: number } | undefined) ?? null };
  });

/** SuperAdmin: PATCH `company_type: real_estate` pentru agențiile Vumsi încă nesincronizate. */
export const syncVumsiCompanyTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase);
    const { hasVumsiKey, VUMSI_KEY_MISSING_MESSAGE } = await import("./config");
    if (!hasVumsiKey()) throw new Error(VUMSI_KEY_MISSING_MESSAGE);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { vumsiAllowsRealEstate, syncAllVumsiCompanyTypes, VUMSI_COMPANY_TYPE_REJECTED } = await import("./company-type");
    const { data: snap } = await db.from("vumsi_nomenclature_snapshots").select("reference").order("synced_at", { ascending: false }).limit(1).maybeSingle();
    if (snap && !vumsiAllowsRealEstate(snap.reference)) throw new Error(`${VUMSI_COMPANY_TYPE_REJECTED}.`);
    const { data: rows, error } = await db.from("vumsi_accounts").select("external_id,vumsi_uuid,company_type_synced_at")
      .eq("kind", "company").not("vumsi_uuid", "is", null).is("company_type_synced_at", null);
    if (error) throw new Error(error.message);
    const { vumsiRequest } = await import("./client.server");
    const { markVumsiCompanyTypeSynced } = await import("./load.server");
    const call: import("./publish").VumsiCall = (m, p, o) => vumsiRequest(m, p, o ?? {}, {});
    return syncAllVumsiCompanyTypes(call, rows ?? [], markVumsiCompanyTypeSynced);
  });
