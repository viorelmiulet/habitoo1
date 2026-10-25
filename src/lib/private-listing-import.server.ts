import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const MIRROR_PATH = /^[a-zA-Z0-9_.-]{1,180}\/\d{1,2}-[0-9a-f]{8}-[0-9a-f-]{27,36}\.(jpg|png|webp|gif)$/i;
const MEDIA_BUCKET = "property-media";

/** Reads only already-mirrored listing files; never fetches arbitrary network URLs. */
export async function copyListingPhotos(
  client: SupabaseClient<Database>,
  images: string[],
  orgId: string,
  propertyId: string,
): Promise<{ paths: string[]; skipped: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const paths: string[] = [];
  for (const image of images) {
    try {
      const url = new URL(image);
      const sourcePath = url.searchParams.get("p") ?? "";
      if (!/^\/api\/public\/listings\/media\/[0-9a-f-]+$/i.test(url.pathname) || !MIRROR_PATH.test(sourcePath)) continue;
      const { data: blob, error } = await supabaseAdmin.storage.from("listing-images").download(sourcePath);
      if (error || !blob || !blob.size) continue;
      const extension = sourcePath.split(".").pop() ?? "jpg";
      const path = `${orgId}/${propertyId}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await client.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (!uploaded.error) paths.push(path);
    } catch { /* A missing photo does not abort the remaining gallery. */ }
  }
  return { paths, skipped: images.length - paths.length };
}