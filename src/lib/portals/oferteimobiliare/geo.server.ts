/**
 * Maparea geografică OferteImobiliare.ro: județ / oraș / zonă.
 *
 * Portalul are ID-uri proprii pentru locații, obținute din `GET /counties`,
 * `GET /cities` și `GET /zones`. Fără potrivirea corectă a locației anunțul nu
 * are unde să apară, deci lista se descarcă o dată și se ține în cache
 * (`portal_taxonomy_cache`, la fel ca taxonomia Storia), nu la fiecare publicare.
 */
import { normalizeLabel } from "./taxonomy";

const CACHE_PORTAL = "oferteimobiliare";
const CACHE_KEY = "geo";
/** Listele de locații se schimbă rar; o reîmprospătare pe săptămână e suficientă. */
const GEO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type OiGeoItem = { id: number; name: string; parentId: number | null };

export type OiGeoData = {
  counties: OiGeoItem[];
  cities: OiGeoItem[];
  zones: OiGeoItem[];
};

export type OiGeoCache = OiGeoData & { fetchedAt: string; stale: boolean };

function pick(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return null;
}

function asNumber(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) ? num : null;
}

/** Normalizare defensivă: acceptăm array simplu sau `{ data: [...] }`. */
export function normalizeGeoList(payload: unknown, parentKeys: string[]): OiGeoItem[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown } | null)?.data)
      ? ((payload as { data: unknown[] }).data as unknown[])
      : [];
  const out: OiGeoItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const id = asNumber(pick(raw, ["id", "county_id", "city_id", "zone_id"]));
    const nameRaw = pick(raw, ["name", "nume", "title", "denumire", "label"]);
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    if (id === null || !name) continue;
    out.push({ id, name, parentId: asNumber(pick(raw, parentKeys)) });
  }
  return out;
}

export const OI_CITY_PARENT_KEYS = ["county_id", "judet_id", "countyId", "parent_id"];
export const OI_ZONE_PARENT_KEYS = ["city_id", "oras_id", "cityId", "parent_id"];

/** Potrivire pe nume normalizat, opțional restrânsă la părinte (județ/oraș). */
export function matchGeo(
  items: OiGeoItem[],
  name: string | null,
  parentId?: number | null,
): OiGeoItem | null {
  const target = name ? normalizeLabel(name) : "";
  if (!target) return null;
  const scoped = parentId ? items.filter((i) => i.parentId === parentId || i.parentId === null) : items;
  const pool = scoped.length ? scoped : items;
  return (
    pool.find((i) => normalizeLabel(i.name) === target) ??
    // Fallback tolerant: „Cluj-Napoca” vs „Cluj Napoca”, „Sector 3” vs „Sectorul 3”.
    pool.find((i) => normalizeLabel(i.name).replace(/\s+/g, "") === target.replace(/\s+/g, "")) ??
    null
  );
}

export async function readOiGeoCache(): Promise<OiGeoCache | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("portal_taxonomy_cache")
    .select("fetched_at, categories")
    .eq("portal", CACHE_PORTAL)
    .eq("site_urn", CACHE_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const geo = (data.categories ?? {}) as Partial<OiGeoData>;
  return {
    counties: geo.counties ?? [],
    cities: geo.cities ?? [],
    zones: geo.zones ?? [],
    fetchedAt: data.fetched_at,
    stale: Date.now() - new Date(data.fetched_at).getTime() > GEO_TTL_MS,
  };
}

export async function writeOiGeoCache(
  geo: OiGeoData,
  meta: { organizationId?: string | null; actorId?: string | null },
): Promise<OiGeoCache> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fetchedAt = new Date().toISOString();
  const { error } = await supabaseAdmin.from("portal_taxonomy_cache").upsert(
    {
      portal: CACHE_PORTAL,
      site_urn: CACHE_KEY,
      fetched_at: fetchedAt,
      fetched_by: meta.actorId ?? null,
      organization_id: meta.organizationId ?? null,
      categories: geo as unknown as never,
      discrepancies: {} as unknown as never,
    },
    { onConflict: "portal,site_urn" },
  );
  if (error) throw new Error(error.message);
  return { ...geo, fetchedAt, stale: false };
}

export type OiGeoFetcher = (path: "/counties" | "/cities" | "/zones") => Promise<unknown>;

/** Descarcă cele trei liste și rescrie cache-ul. */
export async function refreshOiGeoCache(
  fetcher: OiGeoFetcher,
  meta: { organizationId?: string | null; actorId?: string | null } = {},
): Promise<OiGeoCache> {
  const [countiesRaw, citiesRaw, zonesRaw] = await Promise.all([
    fetcher("/counties"),
    fetcher("/cities"),
    fetcher("/zones"),
  ]);
  const geo: OiGeoData = {
    counties: normalizeGeoList(countiesRaw, []),
    cities: normalizeGeoList(citiesRaw, OI_CITY_PARENT_KEYS),
    zones: normalizeGeoList(zonesRaw, OI_ZONE_PARENT_KEYS),
  };
  if (geo.counties.length === 0 || geo.cities.length === 0) {
    throw new Error("Listele de locații OferteImobiliare au venit goale; cache-ul nu a fost actualizat.");
  }
  return writeOiGeoCache(geo, meta);
}

/** Cache-ul valabil; se reîmprospătează doar când lipsește sau a expirat. */
export async function ensureOiGeoCache(
  fetcher: OiGeoFetcher,
  meta: { organizationId?: string | null; actorId?: string | null } = {},
): Promise<OiGeoCache | null> {
  const cached = await readOiGeoCache();
  if (cached && !cached.stale && cached.counties.length > 0) return cached;
  try {
    return await refreshOiGeoCache(fetcher, meta);
  } catch {
    // Un cache expirat este mai util decât nimic: publicarea continuă cu el.
    return cached;
  }
}

/** Rezolvă județ / oraș / zonă pentru o ofertă. */
export function resolveOiLocation(
  geo: OiGeoData | null,
  input: { county: string | null; city: string | null; district: string | null },
): { countyId: number | null; cityId: number | null; zoneId: number | null } {
  if (!geo) return { countyId: null, cityId: null, zoneId: null };
  const county = matchGeo(geo.counties, input.county);
  const city = matchGeo(geo.cities, input.city, county?.id ?? null);
  const zone = city ? matchGeo(geo.zones, input.district, city.id) : null;
  return { countyId: county?.id ?? null, cityId: city?.id ?? null, zoneId: zone?.id ?? null };
}
