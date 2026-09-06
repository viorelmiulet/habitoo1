import { supabase } from "@/integrations/supabase/client";

export const MEDIA_BUCKET = "property-media";
export const DOCS_BUCKET = "crm-documents";
export const AVATAR_BUCKET = "avatars";

/** Tipuri și dimensiune acceptate pentru fotografia de profil. */
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export function avatarPath(orgId: string, userId: string) {
  return `${orgId}/${userId}/avatar-${Date.now()}.jpg`;
}


function safeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-");
}

/** Comprimă și redimensionează o imagine în browser înainte de upload. */
export async function compressImage(
  file: File,
  maxSide = 1920,
  quality = 0.82,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: file, width: bitmap.width, height: bitmap.height };
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  return { blob: blob ?? file, width, height };
}

/** Rotește o imagine existentă (dintr-un URL semnat) cu 90 de grade. */
export async function rotateImageBlob(src: string): Promise<Blob | null> {
  const res = await fetch(src);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

export function mediaPath(orgId: string, propertyId: string, fileName: string) {
  return `${orgId}/${propertyId}/${Date.now()}-${safeName(fileName)}`;
}

export function docPath(orgId: string, entityType: string, entityId: string, fileName: string) {
  return `${orgId}/${entityType}/${entityId}/${Date.now()}-${safeName(fileName)}`;
}

export async function uploadToBucket(
  bucket: string,
  path: string,
  body: Blob | File,
  contentType?: string,
) {
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    upsert: true,
    ...(contentType ? { contentType } : {}),
  });
  if (error) throw error;
  return path;
}

export async function signedUrl(bucket: string, path: string, seconds = 3600) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function signedUrls(bucket: string, paths: string[], seconds = 3600) {
  if (paths.length === 0) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, seconds);
  const map: Record<string, string> = {};
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}

export async function removeFromBucket(bucket: string, paths: string[]) {
  if (paths.length === 0) return;
  await supabase.storage.from(bucket).remove(paths);
}
