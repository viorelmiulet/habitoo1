/**
 * HomeDirect.ro: rezolvarea locației (județ → oraș → cartier) prin nomenclatorul HomeDirect,
 * cu validare finală `/locations/validate` și cache de 30 de zile în `homedirect_location_cache`.
 * Fără cheie CRM → „locație neverificată” (blochează doar publicarea, nu previzualizarea).
 */
import { normalizeLabel, stripAdminPrefix, isBucharest, bucharestSector } from "@/lib/portals/imo24/mapper";
import { homedirectRequest, type HomedirectDeps } from "./client.server";
import { hasHomedirectKey } from "./config";

export const HOMEDIRECT_LOCATION_TTL_MS = 30 * 24 * 60 * 60_000;
export const HOMEDIRECT_BUCHAREST_COUNTY = "bucuresti ilfov";

export type HomedirectLocationInput = { county: string | null; city: string | null; district: string | null; address?: string | null };

export type HomedirectLocation =
  | {
      status: "verified";
      county: { id: number; name: string };
      city: { id: number; name: string };
      district: { id: number; name: string } | null;
      warnings: string[];
    }
  | { status: "invalid"; reasons: string[] }
  | { status: "unverified"; reason: string; input: { county: string; city: string; district: string | null } };

export type HomedirectLocationStore = {
  get(key: string): Promise<{ payload: unknown; fetched_at: string } | null>;
  put(key: string, kind: "location" | "districts", payload: unknown): Promise<void>;
};

type Named = { id: number; name: string; region_id?: number | null };

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
function list(body: unknown): Named[] {
  const raw = Array.isArray(body) ? body : (rec(body)?.["data"] as unknown);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => rec(x))
    .filter((x): x is Record<string, unknown> => !!x && Number.isFinite(Number(x["id"])) && typeof x["name"] === "string")
    .map((x) => ({
      id: Number(x["id"]),
      name: String(x["name"]),
      region_id: x["region_id"] == null ? null : Number(x["region_id"]),
    }));
}

const eq = (a: string, b: string) => normalizeLabel(a) === normalizeLabel(b);

export function homedirectLocationKey(input: HomedirectLocationInput): string {
  return ["loc", normalizeLabel(input.county), normalizeLabel(input.city), normalizeLabel(input.district)].join("|");
}

/** Interogările Habitoo → HomeDirect (pur). */
export function homedirectLocationQuery(input: HomedirectLocationInput) {
  const bucharest = isBucharest(input.city) || isBucharest(input.county);
  const ilfov = /^ilfov\b/.test(normalizeLabel(stripAdminPrefix(input.county ?? "")));
  const county = stripAdminPrefix((input.county ?? "").trim());
  const city = bucharest ? "București" : stripAdminPrefix((input.city ?? "").trim());
  const sector = bucharest ? bucharestSector(input.district, input.city, input.address ?? null) : null;
  const district = (input.district ?? "").trim() || null;
  return { bucharestIlfov: bucharest || ilfov, county, city, district, sectorName: sector ? `Sector ${sector}` : null };
}

/** Alege județul HomeDirect (București/Ilfov → „Bucuresti - Ilfov”). */
export function pickCounty(counties: Named[], q: ReturnType<typeof homedirectLocationQuery>): Named | null {
  if (q.bucharestIlfov) return counties.find((c) => normalizeLabel(c.name) === HOMEDIRECT_BUCHAREST_COUNTY) ?? null;
  return counties.find((c) => eq(c.name, q.county)) ?? null;
}

export function pickCity(cities: Named[], name: string, countyId: number): Named | null {
  const same = cities.filter((c) => eq(c.name, name));
  return same.find((c) => c.region_id === countyId) ?? same.find((c) => c.region_id == null) ?? null;
}

/** Cartierul Habitoo, apoi sectorul. Fără potrivire exactă → null. */
export function pickDistrict(districts: Named[], q: ReturnType<typeof homedirectLocationQuery>): Named | null {
  for (const name of [q.district, q.sectorName]) {
    if (!name) continue;
    const hit = districts.find((d) => eq(d.name, name) || eq(d.name, stripAdminPrefix(name)));
    if (hit) return hit;
  }
  return null;
}

const fresh = (row: { fetched_at: string } | null, now: number) =>
  !!row && now - new Date(row.fetched_at).getTime() < HOMEDIRECT_LOCATION_TTL_MS;

export async function resolveHomedirectLocation(
  input: HomedirectLocationInput,
  store: HomedirectLocationStore,
  deps: HomedirectDeps & { now?: () => number } = {},
): Promise<HomedirectLocation> {
  const q = homedirectLocationQuery(input);
  if (!q.city || (!q.county && !q.bucharestIlfov)) {
    return { status: "invalid", reasons: [!q.city ? "Completează localitatea proprietății." : "Completează județul proprietății."] };
  }
  const env = deps.env ?? process.env;
  if (!hasHomedirectKey(env)) {
    return {
      status: "unverified",
      reason: "Locație neverificată: cheia CRM HomeDirect nu este configurată pe server.",
      input: { county: q.bucharestIlfov ? "Bucuresti - Ilfov" : q.county, city: q.city, district: q.district ?? q.sectorName },
    };
  }
  const now = (deps.now ?? Date.now)();
  const key = homedirectLocationKey(input);
  const cached = await store.get(key);
  if (fresh(cached, now) && cached && rec(cached.payload)?.["status"]) return cached.payload as HomedirectLocation;

  const transient = (msg: string): HomedirectLocation => ({
    status: "unverified",
    reason: `Locație neverificată: ${msg}`,
    input: { county: q.county, city: q.city, district: q.district ?? q.sectorName },
  });

  const countiesRes = await homedirectRequest<unknown>(
    "GET", `/locations/counties?search=${encodeURIComponent(q.bucharestIlfov ? "Bucuresti" : q.county)}`, undefined, deps);
  if (!countiesRes.ok) return transient(countiesRes.message);
  const counties = list(countiesRes.data);
  const county = pickCounty(counties, q);
  if (!county) {
    const result: HomedirectLocation = {
      status: "invalid",
      reasons: [`Județul „${q.bucharestIlfov ? "Bucuresti - Ilfov" : q.county}” nu există la HomeDirect.${counties.length ? ` Sugestii HomeDirect: ${counties.slice(0, 8).map((c) => c.name).join(", ")}.` : ""}`],
    };
    await store.put(key, "location", result);
    return result;
  }

  const citiesRes = await homedirectRequest<unknown>(
    "GET", `/locations/cities?search=${encodeURIComponent(q.city)}&limit=50`, undefined, deps);
  if (!citiesRes.ok) return transient(citiesRes.message);
  const cities = list(citiesRes.data);
  const city = pickCity(cities, q.city, county.id);
  if (!city) {
    const sug = cities.filter((c) => c.region_id == null || c.region_id === county.id).slice(0, 8).map((c) => c.name);
    const result: HomedirectLocation = {
      status: "invalid",
      reasons: [`Localitatea „${q.city}” nu există la HomeDirect în județul ${county.name}.${sug.length ? ` Sugestii HomeDirect: ${sug.join(", ")}.` : ""}`],
    };
    await store.put(key, "location", result);
    return result;
  }

  const warnings: string[] = [];
  let district: Named | null = null;
  if (q.district || q.sectorName) {
    const dKey = `districts|${city.id}`;
    const dCached = await store.get(dKey);
    let districts: Named[];
    if (fresh(dCached, now) && dCached && Array.isArray(dCached.payload)) districts = dCached.payload as Named[];
    else {
      const dRes = await homedirectRequest<unknown>("GET", `/locations/districts?cityId=${city.id}`, undefined, deps);
      if (!dRes.ok) return transient(dRes.message);
      districts = list(dRes.data).map(({ id, name }) => ({ id, name }));
      await store.put(dKey, "districts", districts);
    }
    district = pickDistrict(districts, q);
    if (!district) {
      warnings.push(`Cartierul „${q.district ?? q.sectorName}” nu există la HomeDirect pentru ${city.name}: anunțul se trimite fără cartier.`);
    }
  }

  const params = new URLSearchParams({ city: String(city.id), county: String(county.id) });
  if (district) params.set("district", String(district.id));
  const v = await homedirectRequest<unknown>("GET", `/locations/validate?${params}`, undefined, deps);
  if (!v.ok) {
    if (v.status === 400) {
      const body = rec(v.body) ?? {};
      const details = Array.isArray(body["details"]) ? (body["details"] as unknown[]).map(String).join(" ") : v.message;
      const result: HomedirectLocation = { status: "invalid", reasons: [`HomeDirect a respins locația: ${details}`] };
      await store.put(key, "location", result);
      return result;
    }
    return transient(v.message);
  }
  const result: HomedirectLocation = {
    status: "verified",
    county: { id: county.id, name: county.name },
    city: { id: city.id, name: city.name },
    district: district ? { id: district.id, name: district.name } : null,
    warnings,
  };
  await store.put(key, "location", result);
  return result;
}

/** Store-ul real (service role). */
export async function homedirectLocationStore(): Promise<HomedirectLocationStore> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const table = () => (supabaseAdmin as any).from("homedirect_location_cache");
  return {
    async get(key) {
      const { data } = await table().select("payload,fetched_at").eq("cache_key", key).maybeSingle();
      return data ?? null;
    },
    async put(key, kind, payload) {
      await table().upsert({ cache_key: key, kind, payload, fetched_at: new Date().toISOString() }, { onConflict: "cache_key" });
    },
  };
}
