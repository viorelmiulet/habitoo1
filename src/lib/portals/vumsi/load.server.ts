/** Vumsi (server-only): datele pentru publicare, starea `vumsi_listings` și conturile găsite. */
import { CRM_URL } from "@/lib/host";
import { watermarkFromOrg } from "@/lib/watermark";
import { imo24ImageUrls } from "@/lib/portals/imo24/publish";
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { VUMSI_SETUP_MESSAGE, mapPropertyToVumsi } from "./mapper";
import type { VumsiDesiredImage, VumsiStored } from "./publish";
import { loadVumsiSetup } from "./preview.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Pozele publicabile, în ordinea din Fotografii, cu watermark dacă e activ (aceleași URL-uri ca la imo24). */
export async function loadVumsiImages(organizationId: string, propertyId: string, db?: any): Promise<{ images: VumsiDesiredImage[]; warnings: string[] }> {
  const d = db ?? (await admin());
  const [{ data: images }, { data: org }] = await Promise.all([
    d.from("property_images").select("*").eq("organization_id", organizationId).eq("property_id", propertyId),
    d.from("organizations").select("id,watermark_enabled").eq("id", organizationId).maybeSingle(),
  ]);
  const pics = imo24ImageUrls((images ?? []) as never, { baseUrl: CRM_URL, watermark: watermarkFromOrg(org as never).enabled });
  return {
    images: pics.urls.map((url) => ({ url, source: url.match(/\/media\/([^/.?]+)/)?.[1] ?? url })),
    warnings: pics.warnings.map((w) => w.replace(/imo24\.ro/g, "Vumsi")),
  };
}

export async function fetchVumsiImage(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url, { redirect: "follow" });
    return r.ok ? await r.blob() : null;
  } catch {
    return null;
  }
}

export async function loadVumsiStored(organizationId: string, propertyId: string): Promise<VumsiStored[]> {
  const db = await admin();
  const { data } = await db.from("vumsi_listings")
    .select("external_id,transaction,vumsi_uuid,status,public_url,expires_at,images,status_checked_at,deleted_at")
    .eq("organization_id", organizationId).eq("property_id", propertyId);
  return (data ?? []) as VumsiStored[];
}

export async function saveVumsiStored(organizationId: string, propertyId: string, states: VumsiStored[]) {
  if (!states.length) return;
  const db = await admin();
  const now = new Date().toISOString();
  await db.from("vumsi_listings").upsert(
    states.map((s) => ({ ...s, organization_id: organizationId, property_id: propertyId, updated_at: now })),
    { onConflict: "organization_id,external_id" },
  );
}

export async function saveVumsiAccount(kind: "user" | "company", externalId: string, organizationId: string, uuid: string) {
  const db = await admin();
  await db.from("vumsi_accounts").upsert({ kind, external_id: externalId, organization_id: organizationId, vumsi_uuid: uuid, checked_at: new Date().toISOString() });
}

export async function loadVumsiPropertyState(organizationId: string, propertyId: string) {
  const db = await admin();
  const { data } = await db.from("properties").select("status,deleted_at").eq("id", propertyId).eq("organization_id", organizationId).maybeSingle();
  return (data ?? null) as { status: string | null; deleted_at: string | null } | null;
}

/** Motivele blocante pentru fila Publicare, fără apeluri la Vumsi (localitatea se rezolvă la publicare). */
export async function vumsiReasonsLoader(db: any) {
  const { snapshot, mappings } = await loadVumsiSetup(db);
  return (row: PropertyRow): string[] => {
    if (!snapshot || !mappings.categories.length || !mappings.types.length) return [VUMSI_SETUP_MESSAGE];
    return mapPropertyToVumsi(row, { attributes: snapshot.attributes ?? {}, mappings, cityId: 0 }).reasons;
  };
}
