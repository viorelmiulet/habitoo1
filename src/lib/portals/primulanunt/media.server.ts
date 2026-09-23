/**
 * Pozele pentru PrimulAnunț.ro — fișiere reale, trimise separat de anunț.
 *
 * Documentația oficială (https://www.primulanunt.ro/api-agentii, secțiunea
 * „3. Fotografii”): `POST /api/public/v1/listings/{id}/media`,
 * `multipart/form-data`, câmpul `file` repetat, până la 20 de imagini, maximum
 * 10 MB fiecare, prima imagine devine coperta.
 *
 * Aici pregătim doar fișierele: citim din storage-ul propriu, aplicăm
 * watermark-ul agenției (aceeași cale ca la Imobiliare.ro) și tăiem ce nu
 * respectă limitele portalului.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MEDIA_BUCKET } from "@/lib/storage";
import { ensureWatermarkedPath } from "@/lib/watermark.server";
import { watermarkFromOrg } from "@/lib/watermark";
import { isImageFeedEligible, type PropertyImageRow } from "@/lib/site-feed/mapper";
import type { PrimulAnuntMediaFile } from "./types";

type Admin = SupabaseClient<Database>;

/** Limitele documentate de portal. */
export const PRIMULANUNT_MAX_IMAGES = 20;
export const PRIMULANUNT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type PrimulAnuntMediaSet = { files: PrimulAnuntMediaFile[]; warnings: string[] };

function mimeFromPath(path: string): string {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Pozele publicabile ale unei proprietăți, pregătite pentru multipart. */
export async function loadPrimulAnuntMedia(input: {
  admin: Admin;
  organizationId: string;
  propertyId: string;
}): Promise<PrimulAnuntMediaSet> {
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

  const all = ((rows ?? []) as PropertyImageRow[]).filter(isImageFeedEligible);
  const eligible = all.slice(0, PRIMULANUNT_MAX_IMAGES);
  if (all.length > eligible.length) {
    warnings.push(
      `PrimulAnunț.ro acceptă maximum ${PRIMULANUNT_MAX_IMAGES} poze: au fost trimise primele ${PRIMULANUNT_MAX_IMAGES}, în ordinea din CRM.`,
    );
  }

  const cfg = watermarkFromOrg(org ?? null);
  const files: PrimulAnuntMediaFile[] = [];

  for (const [index, row] of eligible.entries()) {
    const position = index + 1;
    if (!row.storage_path) {
      warnings.push(`Poza ${position} nu are fișier în storage și a fost omisă.`);
      continue;
    }
    const watermarked = await ensureWatermarkedPath(input.admin, row.storage_path, cfg);
    const path = watermarked ?? row.storage_path;
    const { data, error } = await input.admin.storage.from(MEDIA_BUCKET).download(path);
    if (error || !data) {
      warnings.push(`Poza ${position} nu a putut fi citită din storage și a fost omisă.`);
      continue;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    const mime = watermarked ? "image/jpeg" : mimeFromPath(row.storage_path);
    if (bytes.byteLength > PRIMULANUNT_MAX_IMAGE_BYTES) {
      warnings.push(
        `Poza ${position} depășește limita de 10 MB a PrimulAnunț.ro și nu a fost trimisă.`,
      );
      continue;
    }
    files.push({
      imageId: row.id,
      filename: `foto-${position}.${extensionFor(mime)}`,
      contentType: mime,
      bytes,
    });
  }

  if (files.length === 0) {
    warnings.push("Nicio poză publicabilă nu a fost trimisă către PrimulAnunț.ro.");
  }
  return { files, warnings };
}
