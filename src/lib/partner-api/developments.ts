/**
 * Partner API developments (opt-in). Pure module: eligibility input comes from
 * the same eligible listing rows as /listings; prices reuse the feed rule.
 */
import { CRM_URL } from "@/lib/host";
import { publicLocation } from "@/lib/geo";
import { feedImageUrl, type PropertyRow } from "@/lib/site-feed/mapper";
import { developmentFeedPrices, type DevelopmentRow, type DevelopmentImageRow } from "@/lib/site-feed/developments";
import { stableJson, type PartnerDevelopment } from "./schema";

export function mapPartnerDevelopment(d: DevelopmentRow, units: PropertyRow[], images: DevelopmentImageRow[], baseUrl = CRM_URL): PartnerDevelopment {
  const location = publicLocation(d);
  const prices = developmentFeedPrices(d, units);
  return {
    id: d.id, agency_id: d.organization_id, agent_id: d.assigned_to ?? null, name: d.name,
    developer_name: d.developer_name ?? null, description: d.description ?? null,
    location: {
      county: d.county ?? null, city: d.city ?? null, district: d.district ?? null,
      street: location.street, street_number: location.street_number,
      lat: location.coords?.lat ?? null, lng: location.coords?.lng ?? null, precise: location.precise,
    },
    construction_stage: d.construction_stage ?? null, delivery_date: d.delivery_date ?? null,
    buildings_count: d.buildings_count ?? null, floors_count: d.floors_count ?? null, total_units: d.total_units ?? null,
    amenities: d.amenities ?? [], price_range: prices,
    area_from: d.area_from ?? null, area_to: d.area_to ?? null, estate_type: d.estate_type ?? null,
    images: [...images].sort((a, b) => a.is_primary === b.is_primary ? a.position - b.position : a.is_primary ? -1 : 1)
      .map((img, i) => ({ url: feedImageUrl(baseUrl, img.id), position: i, is_cover: i === 0 })),
    listing_ids: units.map(u => u.id).sort(),
    created_at: d.created_at ?? null, updated_at: null,
  };
}

/** Active, non-deleted developments of the agency with at least one eligible unit; links only to eligible developments. */
export function eligiblePartnerDevelopments(org: string, developments: DevelopmentRow[], units: PropertyRow[], images: DevelopmentImageRow[], baseUrl = CRM_URL) {
  const byDev = new Map<string, PropertyRow[]>();
  for (const u of units) if (u.development_id && u.organization_id === org) byDev.set(u.development_id, [...(byDev.get(u.development_id) ?? []), u]);
  const out: PartnerDevelopment[] = []; const links: Record<string, string> = {};
  for (const d of developments) {
    const list = byDev.get(d.id);
    if (!list?.length || d.organization_id !== org || d.status !== "active" || d.deleted_at) continue;
    out.push(mapPartnerDevelopment(d, list, images.filter(i => i.development_id === d.id), baseUrl));
    for (const u of list) links[u.id] = d.id;
  }
  return { developments: out.sort((a, b) => a.id.localeCompare(b.id)), links };
}

export type DevelopmentTombstone = { id: string; agency_id: string };
export type DevelopmentStateRow = { development_id: string; organization_id: string; content_hash: string; visible: boolean };
export type DevelopmentChange = { development_id: string; organization_id: string; content_hash: string; visible: boolean; payload: PartnerDevelopment | DevelopmentTombstone };
export function diffDevelopments(previous: DevelopmentStateRow[], current: PartnerDevelopment[], hash: (v: string) => string): DevelopmentChange[] {
  const prev = new Map(previous.map(r => [r.development_id, r])); const seen = new Set<string>(); const out: DevelopmentChange[] = [];
  for (const d of current) {
    seen.add(d.id); const content_hash = hash(stableJson(d)); const old = prev.get(d.id);
    if (old && old.visible && old.content_hash === content_hash) continue;
    out.push({ development_id: d.id, organization_id: d.agency_id, content_hash, visible: true, payload: d });
  }
  for (const old of previous) {
    if (!old.visible || seen.has(old.development_id)) continue;
    const payload = { id: old.development_id, agency_id: old.organization_id };
    out.push({ development_id: old.development_id, organization_id: old.organization_id, content_hash: hash(stableJson(payload)), visible: false, payload });
  }
  return out;
}

/** `include` is a comma-separated opt-in list; unknown values are ignored as before. */
export function includes(url: URL, name: string) {
  return url.searchParams.getAll("include").flatMap(v => v.split(",")).map(v => v.trim()).includes(name);
}
