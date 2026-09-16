// Nomenclatorul de locații Imobiliare.ro: statistici (read-only) și import
// manual din fișierul livrat de portal. Importul este exclusiv superadmin și
// este auditat; nu interogăm API-ul portalului pentru locații.
import { createServerFn } from "@tanstack/react-start";
import { requireActiveOrgAuth } from "@/lib/org-access";

type AuthContext = {
  supabase: {
    rpc: (
      fn: "is_superadmin",
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
  userId: string;
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: importul locațiilor este permis exclusiv superadminului.");
  }
  return context.userId;
}

export type ImobiliareLocationStats = {
  total: number;
  zones: number;
  syncedAt: string | null;
};

export const getImobiliareLocationStats = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<ImobiliareLocationStats> => {
    const supabase = context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient<
      import("@/integrations/supabase/types").Database
    >;
    const [total, zones, latest] = await Promise.all([
      supabase.from("imobiliare_locations").select("id", { count: "exact", head: true }),
      supabase
        .from("imobiliare_locations")
        .select("id", { count: "exact", head: true })
        .eq("depth", 3),
      supabase
        .from("imobiliare_locations")
        .select("synced_at")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      total: total.count ?? 0,
      zones: zones.count ?? 0,
      syncedAt: latest.data?.synced_at ?? null,
    };
  });

const MAX_CONTENT_BYTES = 24 * 1024 * 1024;

export const importImobiliareLocationsFile = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .validator((input: { content: string; fileName?: string }) => {
    const content = typeof input?.content === "string" ? input.content : "";
    if (content.trim().length === 0) throw new Error("Fișierul de locații este gol.");
    if (content.length > MAX_CONTENT_BYTES) {
      throw new Error("Fișierul de locații depășește 24 MB. Trimite-l comprimat sau împărțit.");
    }
    return { content, fileName: typeof input.fileName === "string" ? input.fileName : null };
  })
  .handler(async ({ data, context }) => {
    const actorId = await assertSuperadmin(context);
    const [{ supabaseAdmin }, importer] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/portals/imobiliare/locations.server"),
    ]);

    const summary = await importer.importImobiliareLocations(supabaseAdmin, data.content);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: null,
      actor_id: actorId,
      action: "imobiliare_locations.imported",
      entity: "imobiliare_locations",
      new_values: { ...summary, file_name: data.fileName },
    } as never);

    return summary;
  });
