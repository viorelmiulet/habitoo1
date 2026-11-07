/**
 * Construcția feedului XML Kyero pentru BazarulDeCase.ro (server-only).
 * Aceleași oferte ca feedul JSON al portalului: agenția din token, oferte publicate,
 * nearhivate, cu status public și bifate pentru BazarulDeCase.ro.
 */
import { feedUrlsForRequest } from "@/lib/site-feed/config";
import { FEED_PUBLIC_STATUSES, feedImageUrl, isPropertyFeedEligible, isImageFeedEligible, type PropertyImageRow, type PropertyRow } from "@/lib/site-feed/mapper";
import { selectedPropertyIdsForPortal } from "@/lib/site-feed/selection.server";
import { readCompleteRows } from "@/lib/site-feed/complete-read.server";
import { publicCoords } from "@/lib/geo";
import { BAZARULDECASE_PORTAL, kyeroDocument, kyeroProperties } from "./kyero";

export type KyeroFeedBuild = { xml: string; properties: number; offers: number; warnings: string[] };

const amenities = (p: PropertyRow) => [
  ...new Set([
    ...(p.features ?? []), ...(p.additional_spaces ?? []), ...(p.kitchen_features ?? []), ...(p.metering ?? []),
    ...(p.appliances ?? []), ...(p.building_amenities ?? []), ...(p.street_arrangement ?? []),
    ...(((p as unknown as { views?: string[] }).views) ?? []), ...(p.misc_features ?? []), ...(p.cooling_systems ?? []),
  ]),
];

export async function buildBazarulKyeroFeed(input: { organizationId: string; requestUrl: URL | string; portal?: string }): Promise<KyeroFeedBuild> {
  const url = typeof input.requestUrl === "string" ? new URL(input.requestUrl) : input.requestUrl;
  const { baseUrl } = feedUrlsForRequest(url);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const selectedIds = await selectedPropertyIdsForPortal(input.organizationId, input.portal ?? BAZARULDECASE_PORTAL);
  if (!selectedIds.length) return { xml: kyeroDocument([]), properties: 0, offers: 0, warnings: [] };

  const rows: PropertyRow[] = [];
  for (let i = 0; i < selectedIds.length; i += 300) {
    const data = await readCompleteRows((from, to) => supabaseAdmin.from("properties").select("*")
      .eq("organization_id", input.organizationId).in("id", selectedIds.slice(i, i + 300))
      .eq("publish_status", "published").is("deleted_at", null).in("status", [...FEED_PUBLIC_STATUSES]).order("id").range(from, to));
    rows.push(...data.filter(isPropertyFeedEligible));
  }
  rows.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  const ids = rows.map((r) => r.id);
  const agentIds = [...new Set(rows.map((r) => r.assigned_to).filter((v): v is string => !!v))];

  const images: PropertyImageRow[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const data = await readCompleteRows((from, to) => supabaseAdmin.from("property_images").select("*")
      .eq("organization_id", input.organizationId).in("property_id", ids.slice(i, i + 300))
      .eq("include_in_publish", true).eq("is_confidential", false).order("id").range(from, to));
    images.push(...data);
  }
  const agents: {id: string; email: string | null; phone: string | null}[] = [];
  for (let i = 0; i < agentIds.length; i += 300) {
    agents.push(...await readCompleteRows((from, to) => supabaseAdmin.from("profiles").select("id, email, phone")
      .eq("organization_id", input.organizationId).in("id", agentIds.slice(i, i + 300)).order("id").range(from, to)));
  }
  const agentById = new Map(agents.map(a => [a.id, a]));
  const imagesBy = new Map<string, PropertyImageRow[]>();
  for (const img of images.filter(isImageFeedEligible)) imagesBy.set(img.property_id, [...(imagesBy.get(img.property_id) ?? []), img]);

  const xml: string[] = [];
  const warnings: string[] = [];
  for (const p of rows) {
    const imgs = (imagesBy.get(p.id) ?? [])
      .sort((a, b) => (a.is_primary === b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1))
      .map((img) => feedImageUrl(baseUrl, img.id));
    const c = publicCoords(p);
    const r = kyeroProperties({
      property: { ...p, features: amenities(p) },
      images: imgs,
      agent: p.assigned_to ? agentById.get(p.assigned_to) ?? null : null,
      coords: c ? { lat: c.lat, lng: c.lng } : null,
    });
    if (!r.xml.length) throw new Error("JSON-eligible offer cannot be rendered in Kyero");
    xml.push(...r.xml);
    warnings.push(...r.warnings);
  }
  // Unsupported data must fail the entire XML, never silently withdraw a JSON-eligible offer.
  if (warnings.length) throw new Error("Kyero inventory cannot be rendered completely");
  return { xml: kyeroDocument(xml), properties: xml.length, offers: rows.length, warnings };
}
