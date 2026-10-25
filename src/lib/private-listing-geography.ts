import { normalizeRoName, titleCaseRo } from "./ro-normalize";

export function geographyKey(value: string | null | undefined): string {
  const key = normalizeRoName(value ?? "");
  return key.replace(/^sectorul ([1-6])$/, "sector $1");
}

export type GeographyRow = { city: string | null; county: string | null; zone: string | null; neighborhood: string | null; property_type?: string | null };
export type PlaceOption = { value: string; label: string; count: number; kind?: "sector" | "neighborhood"; sector?: string };
export type ListingFacets = { counties: PlaceOption[]; localities: Record<string, PlaceOption[]>; zones: Record<string, PlaceOption[]>; propertyTypes: string[] };
export const localityScope = (county?: string | null, city?: string | null) => `${geographyKey(county)}|${geographyKey(city)}`;

/** Căutare în liste de opțiuni, insensibilă la diacritice („cl” găsește Cluj). */
export function filterPlaceOptions(options: PlaceOption[], query: string): PlaceOption[] {
  const key = geographyKey(query);
  if (!key) return options;
  return options.filter((o) => geographyKey(o.label).includes(key) || o.value.includes(key));
}

export const ZONE_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

/** Indexul primei opțiuni a cărei etichetă începe cu litera dată (-1 dacă nu există). */
export function firstIndexForLetter(options: PlaceOption[], letter: string): number {
  const target = geographyKey(letter);
  return options.findIndex((o) => geographyKey(o.label).startsWith(target));
}

export function buildListingFacets(rows: GeographyRow[]): ListingFacets {
  // Un cartier stă la sectorul în care apare cel mai des în anunțuri (București).
  const neighborhoodSectors = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (geographyKey(row.city) !== "bucuresti") continue;
    const sector = geographyKey(row.zone);
    const neighborhood = geographyKey(row.neighborhood);
    if (!/^sector [1-6]$/.test(sector) || !neighborhood) continue;
    const counts = neighborhoodSectors.get(neighborhood) ?? new Map<string, number>();
    counts.set(sector, (counts.get(sector) ?? 0) + 1);
    neighborhoodSectors.set(neighborhood, counts);
  }
  const neighborhoodSector = new Map(
    [...neighborhoodSectors].map(([nb, counts]) => [nb, [...counts].sort((a, b) => b[1] - a[1])[0][0]]),
  );

  const counties = new Map<string, PlaceOption>();
  const localities = new Map<string, Map<string, PlaceOption>>();
  const zones = new Map<string, Map<string, PlaceOption>>();
  const types = new Set<string>();
  const add = (map: Map<string, PlaceOption>, value: string | null, kind?: PlaceOption["kind"]) => {
    const key = geographyKey(value);
    if (!key || !value) return;
    const old = map.get(key);
    const label = /^sector [1-6]$/.test(key) ? `Sector ${key.slice(-1)}` : titleCaseRo(value);
    map.set(key, { value: key, label: old?.label ?? label, count: (old?.count ?? 0) + 1, ...(kind ? { kind } : {}) });
  };
  const bucket = (map: Map<string, Map<string, PlaceOption>>, key: string) => {
    let group = map.get(key);
    if (!group) { group = new Map(); map.set(key, group); }
    return group;
  };
  for (const row of rows) {
    add(counties, row.county);
    if (row.property_type) types.add(row.property_type);
    const county = geographyKey(row.county);
    const city = geographyKey(row.city);
    if (!city) continue;
    add(bucket(localities, county), row.city);
    // Empty county scope preserves older city-only links, including repeated names.
    if (county) add(bucket(localities, ""), row.city);
    for (const scope of new Set([localityScope(row.county, row.city), localityScope(null, row.city)])) {
      const group = bucket(zones, scope);
      if (city === "bucuresti" && /^sector [1-6]$/.test(geographyKey(row.zone))) add(group, row.zone, "sector");
      add(group, row.neighborhood, "neighborhood");
    }
  }
  const alphabetic = (a: PlaceOption, b: PlaceOption) => a.label.localeCompare(b.label, "ro");
  return {
    counties: [...counties.values()].sort((a, b) => (a.value === "bucuresti" ? -1 : b.value === "bucuresti" ? 1 : alphabetic(a, b))),
    localities: Object.fromEntries([...localities].map(([key, values]) => [key, [...values.values()].sort((a, b) => b.count - a.count || alphabetic(a, b))])),
    zones: Object.fromEntries([...zones].map(([key, values]) => [key, [...values.values()].sort(alphabetic)])),
    propertyTypes: [...types].sort((a, b) => a.localeCompare(b, "ro")),
  };
}

export function zoneFilter(value: string): { column: "zone_key" | "neighborhood_key"; value: string } {
  const key = geographyKey(value);
  return { column: /^sector [1-6]$/.test(key) ? "zone_key" : "neighborhood_key", value: key };
}