/** Încărcarea fotografiilor unei proprietăți, aceeași cale ca în galeria proprietății. */
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET, compressImage, mediaPath, uploadToBucket } from "@/lib/storage";

export async function uploadPropertyPhotos(orgId: string, propertyId: string, userId: string | null, files: File[], startPosition = 0): Promise<number> {
  let position = startPosition;
  for (const file of files) {
    const { blob, width, height } = await compressImage(file);
    const path = mediaPath(orgId, propertyId, file.name);
    await uploadToBucket(MEDIA_BUCKET, path, blob, "image/jpeg");
    const { error } = await supabase.from("property_images").insert({
      organization_id: orgId, property_id: propertyId, url: path, storage_path: path, position, width, height,
      is_primary: position === 0, created_by: userId,
    } as never);
    if (error) throw error;
    position += 1;
  }
  return position - startPosition;
}

/** Reordonează fotografiile existente; baza de date marchează prima ca principală. */
export async function reorderPropertyPhotos(imageIds: string[]): Promise<void> {
  const results = await Promise.all(imageIds.map((id, idx) => supabase.from("property_images").update({ position: idx } as never).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
