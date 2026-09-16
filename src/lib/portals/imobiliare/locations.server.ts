/**
 * Nomenclatorul de locații Imobiliare.ro: import idempotent și potrivire.
 * Datele vin exclusiv din fișierul livrat de portal (dump SQL sau CSV).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeRoName } from "@/lib/ro-normalize";
import {
  denormalizeLocations,
  matchImobiliareLocation,
  parseImobiliareLocations,
  imobiliareCityAliases,
  type LocationCandidate,
  type LocationMatch,
} from "./locations";

type Admin = SupabaseClient<Database>;

export type LocationImportSummary = {
  read: number;
  imported: number;
  skipped: number;
  counties: number;
  cities: number;
  zones: number;
  importedAt: string;
};

const BATCH = 500;

export async function importImobiliareLocations(
  admin: Admin,
  content: string,
): Promise<LocationImportSummary> {
  const parsed = parseImobiliareLocations(content);
  if (parsed.rows.length === 0) {
    throw new Error(
      "Fișierul nu conține locații recognoscibile. Sunt necesare coloanele id, parent_id, depth și name.",
    );
  }
  const rows = denormalizeLocations(parsed.rows);
  const syncedAt = new Date().toISOString();

  let imported = 0;
  for (let index = 0; index < rows.length; index += BATCH) {
    const chunk = rows.slice(index, index + BATCH).map((row) => ({ ...row, synced_at: syncedAt }));
    const { error } = await admin.from("imobiliare_locations").upsert(chunk as never, {
      onConflict: "id",
    });
    if (error) throw new Error(`Importul locațiilor a eșuat: ${error.message}`);
    imported += chunk.length;
  }

  return {
    read: parsed.read,
    imported,
    skipped: parsed.skipped,
    counties: rows.filter((row) => row.depth === 1).length,
    cities: rows.filter((row) => row.depth === 2).length,
    zones: rows.filter((row) => row.depth >= 3).length,
    importedAt: syncedAt,
  };
}

export async function imobiliareLocationStats(admin: Admin): Promise<{
  total: number;
  zones: number;
  syncedAt: string | null;
}> {
  const [total, zones, latest] = await Promise.all([
    admin.from("imobiliare_locations").select("id", { count: "exact", head: true }),
    admin.from("imobiliare_locations").select("id", { count: "exact", head: true }).eq("depth", 3),
    admin
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
}

/** Găsește zona `depth = 3` pentru adresa unei oferte. */
export async function resolveImobiliareLocation(
  admin: Admin,
  input: { county: string | null; city: string | null; district: string | null },
): Promise<LocationMatch> {
  const city = input.city?.trim();
  if (!city) {
    return { ok: false, reason: "Oferta nu are orașul completat." };
  }
  const cityAliases = imobiliareCityAliases(city);
  const countyNormalized = input.county ? normalizeRoName(input.county) : null;

  let query = admin
    .from("imobiliare_locations")
    .select("id, name, depth, city_normalized, county_normalized")
    .eq("depth", 3)
    .in("city_normalized", cityAliases)
    .order("is_hidden", { ascending: true })
    .order("name", { ascending: true })
    .limit(500);
  if (countyNormalized) query = query.eq("county_normalized", countyNormalized);

  let { data } = await query;
  if ((data ?? []).length === 0 && countyNormalized) {
    const retry = await admin
      .from("imobiliare_locations")
      .select("id, name, depth, city_normalized, county_normalized")
      .eq("depth", 3)
      .in("city_normalized", cityAliases)
      .order("is_hidden", { ascending: true })
    .order("name", { ascending: true })
      .limit(500);
    data = retry.data;
  }

  const candidates = ((data ?? []) as {
    id: number;
    name: string;
    depth: number;
    city_normalized: string | null;
    county_normalized: string | null;
  }[]).map<LocationCandidate>((row) => ({
    id: row.id,
    name: row.name,
    depth: row.depth,
    cityNormalized: row.city_normalized,
    countyNormalized: row.county_normalized,
  }));

  if (candidates.length === 0) {
    const { count } = await admin
      .from("imobiliare_locations")
      .select("id", { count: "exact", head: true });
    if (!count) {
      return {
        ok: false,
        reason:
          "Nomenclatorul de locații Imobiliare.ro nu este încărcat. Importă fișierul de locații din Superadmin → Nomenclator.",
      };
    }
  }

  return matchImobiliareLocation({
    county: input.county,
    city,
    district: input.district,
    candidates,
  });
}
