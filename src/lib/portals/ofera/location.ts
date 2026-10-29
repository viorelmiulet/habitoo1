import type { PropertyRow } from "@/lib/site-feed/mapper";
import { normalizeRoName } from "@/lib/ro-normalize";
import { bucharestSector, isBucharest, stripAdminPrefix } from "../imo24/mapper";
import type { OferaPlace } from "./nomenclature";

export type OferaLocation = { cityId: number | null; regionId?: number; reasons: string[]; warnings: string[] };
export function resolveOferaLocation(p: Partial<PropertyRow>, catalog: { counties: (OferaPlace & { active?: boolean })[]; cities: (OferaPlace & { active?: boolean })[]; zones: (OferaPlace & { active?: boolean })[] }): OferaLocation {
  const result: OferaLocation = { cityId: null, reasons: [], warnings: [] };
  const bucharest = isBucharest(p.county) || isBucharest(p.city);
  const key = (v: string | null | undefined) => normalizeRoName(stripAdminPrefix(v ?? ""));
  const counties = catalog.counties.filter(c => c.active !== false && c.name_normalized === key(bucharest ? "București" : p.county));
  if (counties.length !== 1) { result.reasons.push("Județul nu are o potrivire unică în nomenclatorul Ofera."); return result; }
  const cities = catalog.cities.filter(c => c.active !== false && c.county_id === counties[0]?.id && c.name_normalized === key(bucharest ? "București" : p.city));
  if (cities.length !== 1) { result.reasons.push("Localitatea nu are o potrivire unică în județul Ofera."); return result; }
  result.cityId = cities[0]?.id ?? null;
  const zones = catalog.zones.filter(z => z.active !== false && z.city_id === result.cityId);
  if (!zones.length) return result;
  const district = key(p.district);
  const matches = district ? zones.filter(z => z.name_normalized === district) : [];
  if (matches.length === 1) { result.regionId = matches[0]?.id; return result; }
  if (matches.length > 1) { result.warnings.push("Cartierul are mai multe potriviri Ofera; zona nu se trimite."); return result; }
  if (bucharest) {
    const sector = bucharestSector(p.city, p.district, p.address);
    const fallback = sector ? zones.filter(z => z.name_normalized === key(`Sectorul ${sector}`)) : [];
    if (fallback.length === 1) { result.regionId = fallback[0]?.id; return result; }
  }
  result.warnings.push("Zona nu are o potrivire unică în Ofera; region_id nu se trimite.");
  return result;
}