/**
 * Imaginile pentru Imobiliare.ro: base64 în payload, nu URL-uri.
 *
 * Citim fișierul din storage-ul propriu, aplicăm watermark-ul agenției dacă e
 * activ (exact ca la feedurile publice) și codificăm `data:image/...;base64,`.
 * Galerie completă într-o cerere; comprimare JPEG numai când depășește bugetul.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MEDIA_BUCKET } from "@/lib/storage";
import { ensureWatermarkedPath } from "@/lib/watermark.server";
import { watermarkFromOrg } from "@/lib/watermark";
import { isImageFeedEligible, type PropertyImageRow } from "@/lib/site-feed/mapper";
import { IMOBILIARE_MAX_IMAGES } from "./config";
import { fitImobiliareGallery } from "./media-compression.server";

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

/** Pauzele dintre reîncercările unei descărcări din storage (3 reîncercări). */
export const IMOBILIARE_DOWNLOAD_RETRY_DELAYS_MS: readonly number[] = [500, 1_500, 3_000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function describeStorageError(error: unknown): string {
  if (!error) return "fișier gol";
  const e = error as { statusCode?: unknown; status?: unknown; name?: unknown; message?: unknown };
  const code = e.statusCode ?? e.status ?? (typeof e.name === "string" && e.name !== "Error" ? e.name : null);
  const message = typeof e.message === "string" && e.message ? e.message : String(error);
  return (code ? `${String(code)} ${message}` : message).slice(0, 200);
}

export async function encodeImobiliareImages(input: {
  admin: Admin;
  organizationId: string;
  propertyId: string;
  /** Doar pentru teste. */
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ images: EncodedImage[]; warnings: string[]; expected: number; transient?: boolean }> {
  const sleep = input.sleep ?? defaultSleep;
  let transient = false;
  const warnings: string[] = [];
  const [{ data: rows, error: rowsError }, { data: org }] = await Promise.all([
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

  if (rowsError) throw new Error("Fotografiile CRM nu au putut fi citite; galeria nu a fost trimisă.");
  const eligible = ((rows ?? []) as PropertyImageRow[]).filter(isImageFeedEligible);
  const expected = eligible.length;
  if (expected > IMOBILIARE_MAX_IMAGES) {
    return { images: [], expected, warnings: [`Galeria are ${expected} poze publicabile; Imobiliare.ro acceptă maximum 30. Nicio poză nu a fost omisă automat.`] };
  }
  const cfg = watermarkFromOrg(org ?? null);

  const images: EncodedImage[] = [];
  for (const row of eligible) {
    if (!row.storage_path) {
      warnings.push(`Poza ${eligible.indexOf(row) + 1} nu are fișier disponibil.`);
      continue;
    }
    const watermarked = await ensureWatermarkedPath(input.admin, row.storage_path, cfg);
    const path = watermarked ?? row.storage_path;
    let data: Blob | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= IMOBILIARE_DOWNLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) await sleep(IMOBILIARE_DOWNLOAD_RETRY_DELAYS_MS[attempt - 1]!);
      try {
        const result = await input.admin.storage.from(MEDIA_BUCKET).download(path);
        if (!result.error && result.data) { data = result.data; break; }
        lastError = result.error;
      } catch (error) {
        lastError = error;
      }
    }
    if (!data) {
      const detail = describeStorageError(lastError);
      console.error("[imobiliare-media] descărcare eșuată", { propertyId: input.propertyId, path, detail });
      warnings.push(`Poza ${eligible.indexOf(row) + 1} nu a putut fi descărcată (storage: ${detail}).`);
      transient = true;
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
  if (images.length !== expected) return { images, warnings, expected, transient };
  try {
    return { images: fitImobiliareGallery(images), warnings, expected };
  } catch (error) {
    return { images: [], expected, warnings: [...warnings, error instanceof Error ? error.message : "Comprimarea galeriei a eșuat."] };
  }
}
