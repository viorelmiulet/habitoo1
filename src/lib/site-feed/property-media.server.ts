import { createMediaCache } from "./media-cache";
import { httpsUrlOrNull, isPropertyFeedEligible } from "./mapper";
import { parseMediaId, signed } from "./media-redirect.server";
import type { ImageParams } from "./image-params";
import { watermarkFromOrg } from "@/lib/watermark";

type Db = Parameters<typeof signed>[0];
type Image = {
  url: string | null; storage_path: string | null; include_in_publish: boolean | null;
  is_confidential: boolean | null;
};
type Property = Parameters<typeof isPropertyFeedEligible>[0];
type Org = Parameters<typeof watermarkFromOrg>[0];

// Access snapshots are shorter than the previous one-hour HTTP redirect cache.
export const PUBLIC_MEDIA_ACCESS_TTL_MS = 60_000;
export const PUBLIC_MEDIA_SIGNED_TTL_MS = (24 * 60 * 60 - 5 * 60) * 1000;
const targets = createMediaCache<string>(PUBLIC_MEDIA_ACCESS_TTL_MS);
const signatures = createMediaCache<string>(PUBLIC_MEDIA_SIGNED_TTL_MS);

/** Same access and watermark policy for redirects and direct portal URLs. */
export async function publishableImageTarget(db: Db, image: Image, property: Property, org: Org, params?: ImageParams | null, signing?: { ttlSeconds: number }) {
  if (image.include_in_publish !== true || image.is_confidential === true || !isPropertyFeedEligible(property)) return null;
  if (!image.storage_path) return httpsUrlOrNull(image.url);
  const cfg = watermarkFromOrg(org);
  const key = JSON.stringify([image.storage_path, cfg, params ?? null]);
  const resolve = async () => {
    let path = image.storage_path;
    if (!path) return null;
    if (cfg.enabled) {
      const { ensureWatermarkedPath } = await import("@/lib/watermark.server");
      path = (await ensureWatermarkedPath(db, path, cfg)) ?? path;
    }
    // A failed signature must not be cached as a successful original URL.
    return signed(db, "property-media", path, params, signing?.ttlSeconds);
  };
  // A portal requiring a minimum remaining lifetime needs a fresh signature.
  return signing ? resolve() : signatures(key, resolve);
}

export async function propertyMediaTarget(rawId: unknown, params?: ImageParams | null, dbIn?: Db) {
  const id = parseMediaId(rawId)?.toLowerCase();
  if (!id) return null;
  return targets(JSON.stringify([id, params ?? null]), async () => {
    const db = dbIn ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: image, error: imageError } = await db.from("property_images")
      .select("url, storage_path, property_id, organization_id, include_in_publish, is_confidential").eq("id", id).maybeSingle();
    if (imageError || !image || image.include_in_publish !== true || image.is_confidential === true) return null;
    const { data: property, error: propertyError } = await db.from("properties")
      .select("publish_status, deleted_at, status").eq("id", image.property_id).maybeSingle();
    if (propertyError || !property || !isPropertyFeedEligible(property)) return null;
    const { data: org, error: orgError } = image.storage_path ? await db.from("organizations")
      .select("logo_path, watermark_enabled, watermark_position, watermark_scale_percent, watermark_opacity_percent, watermark_margin_percent")
      .eq("id", image.organization_id).maybeSingle() : { data: null, error: null };
    if (orgError) return null;
    return publishableImageTarget(db, image, property, org, params);
  });
}