/**
 * Imaginile pentru Imobiliare.ro: base64 în payload, nu URL-uri.
 *
 * Citim fișierul din storage-ul propriu, aplicăm watermark-ul agenției dacă e
 * activ (exact ca la feedurile publice) și codificăm `data:image/...;base64,`.
 * Trimiterea se face în loturi, ca să nu depășim dimensiunea unei cereri.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MEDIA_BUCKET } from "@/lib/storage";
import { ensureWatermarkedPath } from "@/lib/watermark.server";
import { watermarkFromOrg } from "@/lib/watermark";
import { isImageFeedEligible, type PropertyImageRow } from "@/lib/site-feed/mapper";
import {
  IMOBILIARE_IMAGES_PER_BATCH,
  IMOBILIARE_MAX_BATCH_BYTES,
  IMOBILIARE_MAX_IMAGES,
} from "./config";

type Admin = SupabaseClient<Database>;

export type EncodedImage = { dataUrl: string; bytes: number; imageId: string };

function mimeFromPath(path: string): string {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Grupează imaginile în loturi limitate la număr și la dimensiune totală. */
export function batchEncodedImages(
  images: EncodedImage[],
  perBatch = IMOBILIARE_IMAGES_PER_BATCH,
  maxBytes = IMOBILIARE_MAX_BATCH_BYTES,
): EncodedImage[][] {
  const batches: EncodedImage[][] = [];
  let current: EncodedImage[] = [];
  let size = 0;
  for (const image of images) {
    const wouldExceed = current.length >= perBatch || (current.length > 0 && size + image.bytes > maxBytes);
    if (wouldExceed) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(image);
    size += image.bytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export async function encodeImobiliareImages(input: {
  admin: Admin;
  organizationId: string;
  propertyId: string;
}): Promise<{ images: EncodedImage[]; warnings: string[] }> {
  const warnings: string[] = [];
  const [{ data: rows }, { data: org }] = await Promise.all([
    input.admin
      .from("property_images")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("property_id", input.propertyId)
      .order("position", { ascending: true }),
    input.admin
      .from("organizations")
      .select(
        "logo_path, watermark_enabled, watermark_position, watermark_scale_percent, watermark_opacity_percent, watermark_margin_percent",
      )
      .eq("id", input.organizationId)
      .maybeSingle(),
  ]);

  const eligible = ((rows ?? []) as PropertyImageRow[])
    .filter(isImageFeedEligible)
    .slice(0, IMOBILIARE_MAX_IMAGES);
  const cfg = watermarkFromOrg(org ?? null);

  const images: EncodedImage[] = [];
  for (const row of eligible) {
    if (!row.storage_path) {
      warnings.push("O imagine nu are fișier în storage și a fost omisă.");
      continue;
    }
    const watermarked = await ensureWatermarkedPath(input.admin, row.storage_path, cfg);
    const path = watermarked ?? row.storage_path;
    const { data, error } = await input.admin.storage.from(MEDIA_BUCKET).download(path);
    if (error || !data) {
      warnings.push("O imagine nu a putut fi citită din storage și a fost omisă.");
      continue;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    const mime = watermarked ? "image/jpeg" : mimeFromPath(row.storage_path);
    images.push({
      imageId: row.id,
      bytes: bytes.byteLength,
      dataUrl: `data:${mime};base64,${toBase64(bytes)}`,
    });
  }

  if (images.length === 0) {
    warnings.push("Nicio imagine publicabilă nu a putut fi pregătită pentru Imobiliare.ro.");
  }
  return { images, warnings };
}
