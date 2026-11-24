/** Datele unui anunț HomeZZ (server-only): maparea, agentul legat, pozele publice și ofertele salvate. */
import { CRM_URL } from "@/lib/host";
import { watermarkFromOrg } from "@/lib/watermark";
import { imo24ImageUrls } from "@/lib/portals/imo24/publish";
import { HOMEZZ_MAX_IMAGES, parseHomezzOffers } from "./publish";
import type { HomezzListingData } from "../adapters/homezz.server";

/** Varianta redimensionată de rutele media existente: cel mult 1024×768, `fit=contain` (fără decupare). */
export const HOMEZZ_IMAGE_QUERY = "w=1024&h=768&fit=contain";

export function homezzImages(urls: string[]): { ids: string[]; urls: string[] } {
  const first = urls.slice(0, HOMEZZ_MAX_IMAGES);
  return {
    ids: first.map((u) => (/\/media\/([^/.?]+)/.exec(u)?.[1] ?? u)),
    urls: first.map((u) => `${u}${u.includes("?") ? "&" : "?"}${HOMEZZ_IMAGE_QUERY}`),
  };
}

export async function loadHomezzListing(organizationId: string, propertyId: string, opts: { withdraw: boolean }): Promise<HomezzListingData> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  // Retragerea funcționează și pentru proprietăți șterse (soft delete).
  let q = db.from("properties").select("id, reference, assigned_to").eq("id", propertyId).eq("organization_id", organizationId);
  if (!opts.withdraw) q = q.is("deleted_at", null);
  const { data: p, error } = await q.maybeSingle();
  if (error || !p) throw new Error("Proprietatea nu a fost găsită.");
  const row = p as { reference: string | null; assigned_to: string | null };
  const [{ data: listing }, { data: link }] = await Promise.all([
    db.from("portal_listings").select("portal_offers").eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal", "homezz").maybeSingle(),
    row.assigned_to
      ? db.from("portal_agent_links").select("external_key").eq("organization_id", organizationId).eq("portal", "homezz").eq("user_id", row.assigned_to).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const stored = parseHomezzOffers((listing as { portal_offers?: unknown } | null)?.portal_offers);
  const agentEmail = ((link as { external_key?: string | null } | null)?.external_key ?? "").trim().toLowerCase() || null;
  if (opts.withdraw) {
    return { mapping: { ok: false, reasons: [], warnings: [] }, reference: row.reference, assignedTo: row.assigned_to, agentEmail, stored, images: { ids: [], urls: [], warnings: [] } };
  }
  const { buildHomezzPreview } = await import("./preview.server");
  const mapping = await buildHomezzPreview(organizationId, propertyId);
  const [{ data: images }, { data: org }] = await Promise.all([
    db.from("property_images").select("*").eq("organization_id", organizationId).eq("property_id", propertyId),
    db.from("organizations").select("id,watermark_enabled").eq("id", organizationId).maybeSingle(),
  ]);
  const pics = imo24ImageUrls((images ?? []) as never, { baseUrl: CRM_URL, watermark: watermarkFromOrg(org as never).enabled });
  const picked = homezzImages(pics.urls.filter((u) => u.startsWith("https://")));
  const warnings = pics.warnings.map((w) => w.replace(/imo24\.ro/g, "HomeZZ"));
  if (pics.urls.length > HOMEZZ_MAX_IMAGES) warnings.push(`HomeZZ primește primele ${HOMEZZ_MAX_IMAGES} poze.`);
  return { mapping: { ok: mapping.ok, ...(mapping.ok ? { ads: mapping.ads } : { reasons: mapping.reasons }), warnings: mapping.warnings } as never, reference: row.reference, assignedTo: row.assigned_to, agentEmail, stored, images: { ...picked, warnings } };
}

/** Lajumate: citește `ad-info` pentru ofertele scadente și salvează `ljm_url`. Erorile nu blochează cardul. */
export async function refreshHomezzLajumate(organizationId: string, propertyId: string, now = new Date()): Promise<{ checked: number; saved: number }> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { homezzLajumateDue, parseHomezzAdInfo } = await import("./publish");
  const { data: listing } = await db.from("portal_listings").select("id, portal_offers").eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal", "homezz").maybeSingle();
  if (!listing) return { checked: 0, saved: 0 };
  const offers = parseHomezzOffers((listing as { portal_offers?: unknown }).portal_offers);
  const due = offers.filter((o) => homezzLajumateDue(o, now));
  if (!due.length) return { checked: 0, saved: 0 };
  const { homezzAgentDeps } = await import("./agents.server");
  const deps = await homezzAgentDeps();
  const key = await deps.agencyKey(organizationId);
  let saved = 0;
  for (const o of due) {
    o.ljm_checked_at = now.toISOString();
    const info = parseHomezzAdInfo(await deps.post("ad-info", { key, internal_id: o.internal_id }));
    if (info.ljmUrl) { o.ljm_url = info.ljmUrl; saved++; }
  }
  await db.from("portal_listings").update({ portal_offers: offers as never, updated_at: now.toISOString() } as never).eq("id", (listing as { id: string }).id);
  return { checked: due.length, saved };
}
