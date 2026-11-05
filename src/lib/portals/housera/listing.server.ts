/** Datele unui anunț Housera (server-only): maparea H3, pozele publice și starea salvată. */
import { CRM_URL } from "@/lib/host";
import { watermarkFromOrg } from "@/lib/watermark";
import { imo24ImageUrls } from "@/lib/portals/imo24/publish";
import { parsePortalOffers, type PortalOffer } from "../imobiliare/offer-links";
import type { HouseraMapResult } from "./mapper";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadHouseraMapping(organizationId: string, propertyId: string, actorId: string | null): Promise<HouseraMapResult> {
  const db = await admin();
  const { loadHouseraSchema, refreshHouseraSchema } = await import("./taxonomy.server");
  const { mapPropertyToHousera } = await import("./mapper");
  const { data: p } = await db.from("properties").select("*")
    .eq("id", propertyId).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  if (!p) throw new Error("Proprietatea nu a fost găsită.");
  const cached = (await loadHouseraSchema(process.env)) ?? (await refreshHouseraSchema(process.env, actorId)).cached;
  let agentEmail: string | null = null;
  if (p.assigned_to) {
    const { data: prof } = await db.from("profiles").select("email").eq("id", p.assigned_to).maybeSingle();
    agentEmail = prof?.email ?? null;
  }
  return mapPropertyToHousera(p as never, cached.schema, { agentEmail });
}

/** Aceleași URL-uri publice HTTPS ca la imo24/Vumsi, în ordinea din Fotografii. */
export async function loadHouseraPhotoUrls(organizationId: string, propertyId: string): Promise<{ urls: string[]; warnings: string[] }> {
  const db = await admin();
  const [{ data: images }, { data: org }] = await Promise.all([
    db.from("property_images").select("*").eq("organization_id", organizationId).eq("property_id", propertyId),
    db.from("organizations").select("id,watermark_enabled").eq("id", organizationId).maybeSingle(),
  ]);
  const pics = imo24ImageUrls((images ?? []) as never, { baseUrl: CRM_URL, watermark: watermarkFromOrg(org as never).enabled });
  return { urls: pics.urls.filter((u) => u.startsWith("https://")), warnings: pics.warnings.map((w) => w.replace(/imo24\.ro/g, "Housera")) };
}

export async function loadHouseraStoredOffers(organizationId: string, propertyId: string): Promise<PortalOffer[]> {
  const { data } = await (await admin()).from("portal_listings").select("portal_offers")
    .eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal", "housera").maybeSingle();
  return parsePortalOffers(data?.portal_offers);
}
