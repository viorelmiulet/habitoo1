import { plainRo } from "./facts";
import * as taxonomy from "@/lib/property-taxonomy";

export type AutofillLocation = {
  propertyId?: string; address?: string; city?: string; street?: string; streetNumber?: string;
  lat?: number; lng?: number; residentialComplex?: string; localitySirutaCode?: number;
};
export type HistoryRow = Record<string, unknown> & { id: string; organization_id: string };
export type HistoryProposal = { values: Record<string, string | number | string[]>; confidence: Record<string, "high" | "medium"> };
export const HISTORY_FIELDS = ["building_type", "building_structure", "build_year", "building_floors", "seismic_risk", "construction_stage", "utilities", "heating_systems", "building_amenities", "parking", "street_arrangement"] as const;

export function buildingAddress(location: { address?: unknown; street?: unknown; streetNumber?: unknown }): string | null {
  if (typeof location.street === "string" && typeof location.streetNumber === "string" && location.streetNumber.trim()) {
    return plainRo(`${location.street} ${location.streetNumber}`).replace(/\b(?:strada|str|nr|numarul)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
  }
  if (typeof location.address !== "string") return null;
  const address = plainRo(location.address).split(/\b(?:apartament|ap|scara|sc|etaj)\b/)[0] ?? "";
  if (!/\d/.test(address)) return null;
  const building = address.match(/^(.*?\b\d+[a-z]?)(?:[,\s]|$)/)?.[1];
  if (!building) return null;
  return building.replace(/\b(?:strada|str|nr|numarul)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
}

export function distanceMeters(a: AutofillLocation, b: Record<string, unknown>): number {
  if (typeof a.lat !== "number" || typeof a.lng !== "number" || typeof b.lat !== "number" || typeof b.lng !== "number") return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function historyMatch(location: AutofillLocation, row: HistoryRow): "complex" | "address" | "coordinates" | null {
  if (location.residentialComplex && typeof row.residential_complex === "string" && plainRo(location.residentialComplex) === plainRo(row.residential_complex)) return "complex";
  const address = buildingAddress(location);
  if (address && address === buildingAddress({ address: row.address, street: row.street, streetNumber: row.street_number }) && location.city && typeof row.city === "string" && plainRo(location.city) === plainRo(row.city)) return "address";
  return distanceMeters(location, row) < 30 ? "coordinates" : null;
}

export function selectHistoryRows(rows: HistoryRow[], organizationId: string, location: AutofillLocation): HistoryRow[] {
  const candidates = rows.filter((r) => r.organization_id === organizationId && r.id !== location.propertyId && !r.deleted_at);
  for (const mode of ["complex", "address", "coordinates"] as const) {
    const matched = candidates.filter((r) => historyMatch(location, r) === mode);
    if (matched.length) return matched.slice(0, 20);
  }
  return [];
}

/** Aggregate only allowlisted building fields; whole arrays vote together, not a union of conflicting records. */
export function historyConsensus(rows: HistoryRow[], location: AutofillLocation): HistoryProposal {
  const values: HistoryProposal["values"] = {}, confidence: HistoryProposal["confidence"] = {};
  const options: Record<string, readonly string[]> = {
    building_type: taxonomy.buildingTypeOptions, building_structure: taxonomy.buildingStructureOptions,
    seismic_risk: taxonomy.seismicRiskOptions, construction_stage: taxonomy.constructionStageOptions,
    utilities: taxonomy.utilityOptions, heating_systems: ["Termoficare"], building_amenities: taxonomy.buildingAmenityOptions,
    parking: taxonomy.parkingOptions, street_arrangement: ["Mijloace de transport în comun"],
  };
  for (const key of HISTORY_FIELDS) {
    const votes = new Map<string, { value: string | number | string[]; count: number }>();
    for (const row of rows.slice(0, 20)) {
      if (key === "construction_stage" && historyMatch(location, row) !== "complex") continue;
      let value = row[key];
      if (Array.isArray(value)) value = [...new Set(value.filter((v): v is string => typeof v === "string" && Boolean(options[key]?.includes(v))))].sort();
      if (Array.isArray(value) && !value.length) continue;
      if (typeof value === "string" && !options[key]?.includes(value)) continue;
      if (key === "build_year" || key === "building_floors") {
        if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) continue;
      }
      if (typeof value !== "string" && typeof value !== "number" && !Array.isArray(value)) continue;
      const token = JSON.stringify(value), old = votes.get(token);
      votes.set(token, { value: value as string | number | string[], count: (old?.count ?? 0) + 1 });
    }
    const sorted = [...votes.values()].sort((a, b) => b.count - a.count);
    const winner = sorted[0];
    if (!winner || (sorted[1] && sorted[1].count === winner.count)) continue;
    values[key] = winner.value;
    confidence[key] = winner.count >= 2 ? "high" : "medium";
  }
  return { values, confidence };
}