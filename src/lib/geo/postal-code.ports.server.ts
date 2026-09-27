/**
 * Porturile reale ale rezolvării codului poștal (Nominatim, nomenclator,
 * cache, jurnal) și completarea în lot pentru ofertele fără cod. Server-only.
 */
import type { PostalCodeRow } from "./postal-code";
import type { PostalPorts, PostalResolution } from "./postal-code.server";

export const PROPERTY_COLUMNS =
  "id, organization_id, reference, title, postal_code, postal_code_source, postal_code_resolved_from, address, district, city, county, lat, lng, locality_siruta_code, uat_siruta_code";

export type PropertyRow = PostalCodeRow & {
  id: string;
  organization_id: string;
  reference: string | null;
  title: string | null;
};

/** Porturile reale: nomenclator propriu pentru localitate, cache și jurnal. */
export async function realPorts(organizationId: string, property: PropertyRow): Promise<PostalPorts> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { nominatimReverse } = await import("./postal-code.server");

  return {
    reverse: nominatimReverse,
    localityPostal: async (row) => {
      if (row.locality_siruta_code) {
        const { data } = await supabaseAdmin
          .from("ro_localities")
          .select("postal_code")
          .eq("siruta_code", row.locality_siruta_code)
          .maybeSingle();
        if (data?.postal_code) return data.postal_code;
      }
      if (row.uat_siruta_code) {
        const { data } = await supabaseAdmin
          .from("ro_uats")
          .select("postal_code")
          .eq("siruta_code", row.uat_siruta_code)
          .maybeSingle();
        if (data?.postal_code) return data.postal_code;
      }
      return null;
    },
    cacheGet: async (key) => {
      const { data } = await supabaseAdmin
        .from("geocode_postal_cache")
        .select("postal_code, source")
        .eq("coord_key", key)
        .maybeSingle();
      return data ? { postalCode: data.postal_code ?? null, source: data.source } : null;
    },
    cacheSet: async (key, postalCode, source) => {
      await supabaseAdmin
        .from("geocode_postal_cache")
        .upsert(
          { coord_key: key, postal_code: postalCode, source, updated_at: new Date().toISOString() },
          { onConflict: "coord_key" },
        );
    },
    providerCallsToday: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("postal_code_resolution_attempts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("used_provider", true)
        .gte("created_at", since);
      return count ?? 0;
    },
    logAttempt: async (entry) => {
      const { error } = await supabaseAdmin.from("postal_code_resolution_attempts").insert({
        organization_id: organizationId,
        property_id: property.id,
        outcome: entry.outcome,
        postal_code: entry.postalCode,
        source: entry.source,
        used_provider: entry.usedProvider,
        detail: entry.detail,
      });
      // Nu înghițim eroarea: dacă nici jurnalul nu se poate scrie, rezolvarea
      // se raportează ca eșuată, nu ca reușită în silence.
      if (error) throw new Error(error.message);
    },
    save: async (value) => {
      const { error } = await supabaseAdmin
        .from("properties")
        .update({
          postal_code: value.postalCode,
          postal_code_source: value.source,
          postal_code_resolved_at: new Date().toISOString(),
          postal_code_resolved_from: value.resolvedFrom,
        })
        .eq("id", property.id)
        // Garanție suplimentară: o valoare manuală nu poate fi atinsă nici
        // dacă între citire și scriere cineva a completat câmpul.
        // `neq` singur exclude și rândurile cu sursă NULL (NULL <> x e NULL în SQL).
        .or("postal_code_source.is.null,postal_code_source.neq.manual")
        .select("id");
      if (!error && (!updated || updated.length === 0)) {
        throw new Error("Codul poștal nu a fost salvat (oferta are cod manual sau nu mai există).");
      }
      if (error) throw new Error(error.message);
    },
  };
}



/**
 * Completează codul poștal din coordonate pentru ofertele care au coordonate
 * dar nu au cod. Respectă cache-ul, plafonul zilnic per agenție și ritmul de o
 * cerere pe secundă; codurile manuale nu se ating (vezi `decidePostalResolution`
 * și garanția din `save`).
 */
export async function sweepMissingPostalCodes(input: {
  organizationId?: string;
  limit: number;
}): Promise<PostalResolution[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolvePostalCodeFor } = await import("./postal-code.server");
  let query = supabaseAdmin
    .from("properties")
    .select(PROPERTY_COLUMNS)
    .is("deleted_at", null)
    .or("postal_code.is.null,postal_code.eq.")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .order("updated_at", { ascending: false })
    .limit(input.limit);
  if (input.organizationId) query = query.eq("organization_id", input.organizationId);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  const results: PostalResolution[] = [];
  for (const raw of (rows ?? []) as unknown as PropertyRow[]) {
    const result = await resolvePostalCodeFor(raw.id, raw, await realPorts(raw.organization_id, raw));
    results.push(result);
    if (result.usedProvider) await new Promise((r) => setTimeout(r, 1100));
  }
  return results;
}
