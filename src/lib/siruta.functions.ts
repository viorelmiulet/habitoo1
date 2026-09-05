// Server functions pentru nomenclatorul oficial SIRUTA.
// Citirea statisticilor este permisă oricărui utilizator autentificat (RLS: read-only),
// dar importul/actualizarea nomenclatorului este permis exclusiv superadminului și este auditat.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthContext = {
  supabase: { rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: { message: string } | null }> };
  userId: string;
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: importul nomenclatorului este permis exclusiv superadminului.");
  }
  return context.userId;
}

export type NomenclatureStats = {
  counties: number;
  uats: number;
  localities: number;
  version: string | null;
  importedAt: string | null;
  sourceUrl: string | null;
};

export const getNomenclatureStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NomenclatureStats> => {
    const supabase = context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient<
      import("@/integrations/supabase/types").Database
    >;
    const [counties, uats, localities, meta] = await Promise.all([
      supabase.from("ro_counties").select("id", { count: "exact", head: true }),
      supabase.from("ro_uats").select("id", { count: "exact", head: true }),
      supabase.from("ro_localities").select("id", { count: "exact", head: true }),
      supabase.from("ro_nomenclature_meta").select("*").eq("id", "siruta").maybeSingle(),
    ]);

    return {
      counties: counties.count ?? 0,
      uats: uats.count ?? 0,
      localities: localities.count ?? 0,
      version: meta.data?.version ?? null,
      importedAt: meta.data?.imported_at ?? null,
      sourceUrl: meta.data?.source_url ?? null,
    };
  });

export type SirutaImportResult = {
  version: string;
  counties: number;
  uats: number;
  localities: number;
  skipped: number;
  importedAt: string;
  propertiesChecked: number;
  propertiesMigrated: number;
};

export const importSiruta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SirutaImportResult> => {
    const actorId = await assertSuperadmin(context);

    const [{ supabaseAdmin }, importer, { getRequestURL }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/siruta-import.server"),
      import("@tanstack/react-start/server"),
    ]);

    const origin = new URL(getRequestURL()).origin;
    const summary = await importer.importSirutaNomenclature(supabaseAdmin, origin);
    const backfill = await importer.backfillPropertySiruta(supabaseAdmin);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: null,
      actor_id: actorId,
      action: "nomenclature.imported",
      entity: "ro_nomenclature",
      new_values: { ...summary, properties_migrated: backfill.migrated },
    } as never);

    return {
      ...summary,
      propertiesChecked: backfill.checked,
      propertiesMigrated: backfill.migrated,
    };
  });
