/** Datele unui anunț Vrexa (server-only): maparea, pozele publice stabile și ofertele salvate. */
import { CRM_URL } from "@/lib/host";
import { watermarkFromOrg } from "@/lib/watermark";
import { imo24ImageUrls } from "@/lib/portals/imo24/publish";
import { parseVrexaOffers, vrexaImages, VREXA_MAX_IMAGES, type VrexaOffer } from "./publish";
import type { VrexaMapResult } from "./mapper";

export type VrexaListingData = {
  mapping: VrexaMapResult;
  reference: string | null;
  stored: VrexaOffer[];
  images: string[];
  imageWarnings: string[];
};

export async function loadVrexaStored(organizationId: string, propertyId: string): Promise<VrexaOffer[]> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db.from("portal_listings").select("portal_offers").eq("organization_id", organizationId).eq("property_id", propertyId).eq("portal", "vrexa").maybeSingle();
  return parseVrexaOffers((data as { portal_offers?: unknown } | null)?.portal_offers);
}

export async function loadVrexaListing(organizationId: string, propertyId: string, opts: { withdraw: boolean }): Promise<VrexaListingData> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  let q = db.from("properties").select("id, reference").eq("id", propertyId).eq("organization_id", organizationId);
  if (!opts.withdraw) q = q.is("deleted_at", null);
  const { data: p, error } = await q.maybeSingle();
  if (error || !p) throw new Error("Proprietatea nu a fost găsită.");
  const reference = (p as { reference: string | null }).reference;
  const stored = await loadVrexaStored(organizationId, propertyId);
  if (opts.withdraw) return { mapping: { ok: false, reasons: [], warnings: [] }, reference, stored, images: [], imageWarnings: [] };
  const { buildVrexaPreview } = await import("./preview.server");
  const mapping = await buildVrexaPreview(organizationId, propertyId);
  const [{ data: images }, { data: org }] = await Promise.all([
    db.from("property_images").select("*").eq("organization_id", organizationId).eq("property_id", propertyId),
    db.from("organizations").select("id,watermark_enabled").eq("id", organizationId).maybeSingle(),
  ]);
  // Rutele media existente: URL după ID-ul pozei (o poză nouă = ID nou = URL nou), fără semnătură care expiră.
  const pics = imo24ImageUrls((images ?? []) as never, { baseUrl: CRM_URL, watermark: watermarkFromOrg(org as never).enabled });
  const imageWarnings = pics.warnings.map((w) => w.replace(/imo24\.ro/g, "Vrexa"));
  if (pics.urls.length > VREXA_MAX_IMAGES) imageWarnings.push(`Vrexa primește primele ${VREXA_MAX_IMAGES} poze.`);
  return { mapping, reference, stored, images: vrexaImages(pics.urls), imageWarnings };
}
