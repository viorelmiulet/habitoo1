/**
 * Imopedia.ro: import nomenclator regiuni/zone (doar SuperAdmin) și starea lui.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  IMOPEDIA_AREAS_URL,
  IMOPEDIA_REGIONS_URL,
  parseImopediaAreas,
  parseImopediaRegions,
  planImopediaAreas,
  planImopediaRegions,
  type ImopediaImportCounts,
  type StoredArea,
  type StoredRegion,
} from "./nomenclature";

async function assertSuperadmin(supabase: { rpc: (fn: "is_superadmin") => PromiseLike<{ data: unknown }> }) {
  const { data } = await supabase.rpc("is_superadmin");
  if (data !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Habitoo CRM (+https://habitoo.ro)", Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Imopedia: ${url} a răspuns HTTP ${res.status}.`);
  return res.json();
}

async function readAll<T>(admin: any, table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(cols).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export const syncImopediaNomenclature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ regions: ImopediaImportCounts; areas: ImopediaImportCounts }> => {
    await assertSuperadmin(context.supabase as any);
    // Ambele fișiere se validează înainte de orice scriere.
    const [rawRegions, rawAreas] = await Promise.all([fetchJson(IMOPEDIA_REGIONS_URL), fetchJson(IMOPEDIA_AREAS_URL)]);
    const regions = parseImopediaRegions(rawRegions);
    const areas = parseImopediaAreas(rawAreas);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const existingRegions = await readAll<StoredRegion>(admin, "imopedia_regions", "id,name,name_normalized");
    const existingAreas = await readAll<StoredArea>(
      admin,
      "imopedia_areas",
      "id,area,area_normalized,region_id,parent_id,depth,usable_in_api",
    );
    const rPlan = planImopediaRegions(regions, existingRegions);
    const aPlan = planImopediaAreas(areas, existingAreas);
    const now = new Date().toISOString();

    for (let i = 0; i < rPlan.upserts.length; i += 500) {
      const { error } = await admin
        .from("imopedia_regions")
        .upsert(rPlan.upserts.slice(i, i + 500).map((r) => ({ ...r, synced_at: now })));
      if (error) throw new Error(error.message);
    }
    for (let i = 0; i < aPlan.upserts.length; i += 500) {
      const { error } = await admin
        .from("imopedia_areas")
        .upsert(aPlan.upserts.slice(i, i + 500).map((r) => ({ ...r, synced_at: now })));
      if (error) throw new Error(error.message);
    }
    for (let i = 0; i < aPlan.disableIds.length; i += 500) {
      const { error } = await admin
        .from("imopedia_areas")
        .update({ usable_in_api: false, synced_at: now })
        .in("id", aPlan.disableIds.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }
    // Data ultimei sincronizări reușite (și când nimic nu s-a schimbat).
    await admin.from("imopedia_regions").update({ synced_at: now }).eq("id", 1);
    return { regions: rPlan.counts, areas: aPlan.counts };
  });

export const getImopediaNomenclatureStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase as any);
    const sb = context.supabase as any;
    const [{ data: last }, { count: usable }, { count: total }] = await Promise.all([
      sb.from("imopedia_regions").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("imopedia_areas").select("id", { count: "exact", head: true }).eq("usable_in_api", true),
      sb.from("imopedia_areas").select("id", { count: "exact", head: true }),
    ]);
    return { syncedAt: (last?.synced_at as string | undefined) ?? null, usableAreas: usable ?? 0, totalAreas: total ?? 0 };
  });
