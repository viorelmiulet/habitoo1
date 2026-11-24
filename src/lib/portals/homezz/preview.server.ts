import { mapPropertyToHomezz, type HomezzMapResult } from "./mapper";
import { homezzCountyCode, resolveHomezzLocation, type HomezzArea, type HomezzCity, type HomezzLocationResult } from "./location";

export type HomezzPreviewLoaders = {
  cities: (countyCode: string) => Promise<HomezzCity[]>;
  areas: (cityId: number) => Promise<HomezzArea[]>;
};
export type HomezzPreview = HomezzMapResult & { location: HomezzLocationResult };

const BUCHAREST = /^(municipiul )?bucuresti( sector(ul)? \d)?$|^sector(ul)? \d$/;

/** Pure-ish preview core: location via injected nomenclature loaders, then the mapper. No HomeZZ calls. */
export async function buildHomezzPreviewFrom(
  row: Record<string, any>,
  agent: { name: string | null; phone: string | null } | null,
  loaders: HomezzPreviewLoaders,
  currentYear: number,
): Promise<HomezzPreview> {
  const cityNorm = String(row.city ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const code = homezzCountyCode(row.county);
  const countyCode = code === "B" || BUCHAREST.test(cityNorm) ? "IF" : code;
  const input = { county: row.county, city: row.city, district: row.district, lat: row.lat, lng: row.lng };
  let location: HomezzLocationResult;
  if (!countyCode) location = resolveHomezzLocation(input, [], []);
  else {
    const cities = await loaders.cities(countyCode);
    // Locality only (standard „Central” always resolves once the city matches), then its areas.
    const city = resolveHomezzLocation({ ...input, district: "Central", lat: null, lng: null }, cities, []);
    location = city.ok ? resolveHomezzLocation(input, cities, await loaders.areas(city.cityId)) : city;
  }
  const result = mapPropertyToHomezz(row as never, { location, agent, currentYear });
  return { ...result, location };
}

/** SuperAdmin read-only preview for one property of one agency. Never imports the HomeZZ client or keys. */
export async function buildHomezzPreview(organizationId: string | null, propertyId: string): Promise<HomezzPreview> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  let q = db.from("properties").select("*").eq("id", propertyId).is("deleted_at", null);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data: p, error } = await q.maybeSingle();
  if (error || !p) throw new Error("Proprietatea nu a putut fi citită.");
  const row = p as Record<string, any>;
  let agent: { name: string | null; phone: string | null } | null = null;
  if (row.assigned_to) {
    const { data: prof, error: pe } = await db.from("profiles").select("full_name, phone").eq("id", row.assigned_to).maybeSingle();
    if (pe) throw new Error("Agentul responsabil nu a putut fi citit.");
    if (prof) agent = { name: (prof as any).full_name ?? null, phone: (prof as any).phone ?? null };
  }
  const { loadHomezzAreas, loadHomezzCities } = await import("./location.server");
  return buildHomezzPreviewFrom(row, agent, { cities: (c) => loadHomezzCities(c), areas: loadHomezzAreas }, new Date().getUTCFullYear());
}

/** Blocking reasons for pre-publish requirements. */
export async function homezzReasonsFor(organizationId: string, propertyId: string): Promise<string[]> {
  const r = await buildHomezzPreview(organizationId, propertyId);
  return r.ok ? [] : r.reasons;
}
