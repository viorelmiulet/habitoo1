import { CRM_URL } from "@/lib/host";
import { agentPhotoUrl, feedImageUrl, type PropertyRow } from "@/lib/site-feed/mapper";
import { mapPropertyToOfera, oferaCurrency, type OferaContact } from "./mapper";
import { resolveOferaLocation } from "./location";
import type { OferaCategory, OferaPlace } from "./nomenclature";

export const OFERA_CURRENCY_KEY = "ofera_price_currency";
/** Read-only preview: no Ofera transport or partner token is imported. */
export async function buildOferaPreview(propertyId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: p, error } = await db.from("properties").select("*").eq("id", propertyId).is("deleted_at", null).maybeSingle();
  if (error || !p) throw new Error("Proprietatea nu a putut fi citită.");
  const row = p as PropertyRow;
  const checked = async (query: PromiseLike<{ data: unknown; error: unknown }>) => {
    const r = await query;
    if (r.error) throw new Error("Datele pentru previzualizarea Ofera nu au putut fi citite.");
    return r.data;
  };
  const [categories, counties, connection, images, profile, setting, organization] = await Promise.all([
    checked(db.from("ofera_categories").select("*").order("id")),
    checked(db.from("ofera_counties").select("*").eq("active", true)),
    checked(db.from("portal_connections").select("settings").eq("organization_id", row.organization_id).eq("portal", "ofera").maybeSingle()),
    checked(db.from("property_images").select("id,is_primary,position,storage_path,updated_at").eq("property_id", propertyId).eq("organization_id", row.organization_id).eq("include_in_publish", true).or("is_confidential.eq.false,is_confidential.is.null").order("is_primary", { ascending: false, nullsFirst: false }).order("position")),
    row.assigned_to ? checked(db.from("profiles").select("id,full_name,email,phone,avatar_url").eq("id", row.assigned_to).eq("organization_id", row.organization_id).maybeSingle()) : Promise.resolve(null),
    checked(db.from("platform_settings").select("value").eq("key", OFERA_CURRENCY_KEY).maybeSingle()),
    checked(db.from("organizations").select("logo_path,watermark_enabled,watermark_position,watermark_scale_percent,watermark_opacity_percent,watermark_margin_percent").eq("id", row.organization_id).maybeSingle()),
  ]);
  const countyRows = counties as OferaPlace[];
  const { normalizeRoName } = await import("@/lib/ro-normalize");
  const { isBucharest, stripAdminPrefix } = await import("../imo24/mapper");
  const bucharest = isBucharest(row.county) || isBucharest(row.city);
  const countyKey = normalizeRoName(stripAdminPrefix(bucharest ? "București" : row.county ?? ""));
  const matchingCounties = countyRows.filter(c => c.name_normalized === countyKey);
  const cityRows = matchingCounties.length === 1 ? await checked(db.from("ofera_cities").select("*").eq("active", true).eq("county_id", matchingCounties[0]?.id ?? 0).eq("name_normalized", normalizeRoName(stripAdminPrefix(bucharest ? "București" : row.city ?? "")))) as OferaPlace[] : [];
  const zoneRows = cityRows.length === 1 ? await checked(db.from("ofera_zones").select("*").eq("active", true).eq("city_id", cityRows[0]?.id ?? 0)) as OferaPlace[] : [];
  const location = resolveOferaLocation(row, { counties: countyRows, cities: cityRows, zones: zoneRows });
  const currency = oferaCurrency((setting as { value?: unknown } | null)?.value);
  const needsRate = [row.sale_currency ?? row.currency ?? "EUR", row.rent_currency ?? row.currency ?? "EUR"].some(c => c.toUpperCase() !== currency);
  let rate: number | null = null;
  if (needsRate) {
    const { getRonEurRateForDate } = await import("@/lib/commissions-rates.server");
    try {
      const resolved = await getRonEurRateForDate(new Date().toISOString().slice(0, 10), { table: db.from("exchange_rates") as never });
      if (resolved.source === "BNR") rate = resolved.rate;
    } catch { /* mapper reports missing rate, never guesses */ }
  }
  const agent = profile as { id: string; full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null } | null;
  const photo = agent ? agentPhotoUrl(agent, CRM_URL) : null;
  const contact: OferaContact | null = agent ? { tip: "business", name: agent.full_name ?? "", email: agent.email ?? "", phone: agent.phone ?? "", ...(photo ? { photo } : {}) } : null;
  const providerRaw = (connection as { settings?: { id_furnizor?: unknown } } | null)?.settings?.id_furnizor;
  const providerId = typeof providerRaw === "number" || typeof providerRaw === "string" && /^\d+$/.test(providerRaw) ? Number(providerRaw) : null;
  // Public media endpoint applies the current agency watermark itself; no private signed URLs.
  const result = mapPropertyToOfera(row, { categories: categories as OferaCategory[], location, providerId, images: (images as { id: string }[]).map(i => feedImageUrl(CRM_URL, i.id)), contact, currency, eurRonRate: rate });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ images, watermark: organization })));
  const imagesFingerprint = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
  return { ...result, location, currency, imagesFingerprint, bodiesJson: result.bodies.length ? JSON.stringify(result.bodies, null, 2) : null };
}