import type { HomezzArea, HomezzCity } from "./location";

const TTL_MS = 60 * 60 * 1000;
const cityCache = new Map<string, { at: number; rows: HomezzCity[] }>();
const areaCache = new Map<number, { at: number; rows: HomezzArea[] }>();

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Cities of one county (service role), memoised one hour per isolate. */
export async function loadHomezzCities(countyCode: string, countryCode = "RO"): Promise<HomezzCity[]> {
  const key = `${countryCode}:${countyCode}`;
  const hit = cityCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const { data, error } = await (await admin())
    .from("homezz_cities")
    .select("id,name,county_code,country_code,lat,lng")
    .eq("country_code", countryCode)
    .eq("county_code", countyCode);
  if (error) throw new Error(`Nomenclatorul HomeZZ nu a putut fi citit: ${error.message}`);
  const rows = (data ?? []) as HomezzCity[];
  cityCache.set(key, { at: Date.now(), rows });
  return rows;
}

/** Areas of one city (service role), memoised one hour per isolate. */
export async function loadHomezzAreas(cityId: number): Promise<HomezzArea[]> {
  const hit = areaCache.get(cityId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const { data, error } = await (await admin())
    .from("homezz_areas")
    .select("id,name,city_id,lat,lng")
    .eq("city_id", cityId);
  if (error) throw new Error(`Zonele HomeZZ nu au putut fi citite: ${error.message}`);
  const rows = (data ?? []) as HomezzArea[];
  areaCache.set(cityId, { at: Date.now(), rows });
  return rows;
}
