/**
 * Imaginile pentru Imobiliare.ro: base64 în payload, nu URL-uri.
 *
 * Citim fișierul din storage-ul propriu, aplicăm watermark-ul agenției dacă e
 * activ (exact ca la feedurile publice) și codificăm `data:image/...;base64,`.
 * Galerie completă într-o cerere. Pozele vin deja redimensionate din storage
 * (transformare de imagini, după filigran); comprimarea JPEG în worker rămâne doar
 * rezervă, o singură dată pe poză, când originalele nu încap în buget.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MEDIA_BUCKET } from "@/lib/storage";
import { ensureWatermarkedPath } from "@/lib/watermark.server";
import { watermarkFromOrg } from "@/lib/watermark";
import { isImageFeedEligible, type PropertyImageRow } from "@/lib/site-feed/mapper";
import { IMOBILIARE_MAX_IMAGES } from "./config";
import { IMOBILIARE_WAIT_MS, withImobiliareTimeout } from "./wait";
import { fitImobiliareGallery } from "./media-compression.server";
import type { ImobiliareStep } from "./steps.server";

/** Variant requested from storage image transformation (format kept as origin). */
export const IMOBILIARE_PHOTO_TRANSFORM = { width: 1600, height: 1600, resize: "contain", quality: 80, format: "origin" } as const;

type Admin = SupabaseClient<Database>;

export type EncodedImage = { dataUrl: string; bytes: number; imageId: string };

function mimeFromPath(path: string): string {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

function toBase64(bytes: Uint8Array): string {
  // Encode in 3-byte-aligned slices so no full-size binary string is held alongside the result.
  const chunk = 0x8000 * 3;
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += chunk) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(index, index + chunk))));
  }
  return parts.join("");
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
  /** Jurnal de pași (fără date personale): numărul pozei. */
  onStep?: (step: Extract<ImobiliareStep, "photo_resize" | "photo_compress">, photo: number) => Promise<void> | void;
}): Promise<{ images: EncodedImage[]; warnings: string[]; expected: number; transient?: boolean }> {
  const sleep = input.sleep ?? defaultSleep;
  let transient = false;
  let dataError = false;
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
    warnings.push(`Imobiliare.ro acceptă maximum ${IMOBILIARE_MAX_IMAGES} poze; se trimit primele ${IMOBILIARE_MAX_IMAGES}.`);
  }
  const cfg = watermarkFromOrg(org ?? null);

  const images: EncodedImage[] = [];
  const seenHashes = new Map<string, number>();
  let duplicates = 0;
  for (const row of eligible.slice(0, IMOBILIARE_MAX_IMAGES)) {
    if (!row.storage_path) {
      warnings.push(`Poza ${eligible.indexOf(row) + 1} nu are fișier disponibil.`);
      dataError = true;
      continue;
    }
    const watermarked = await withImobiliareTimeout(ensureWatermarkedPath(input.admin, row.storage_path, cfg), 30_000, `Pregătirea pozei ${eligible.indexOf(row) + 1} (filigran) nu s-a terminat în 30 de secunde.`);
    const path = watermarked ?? row.storage_path;
    const position0 = eligible.indexOf(row) + 1;
    await input.onStep?.("photo_resize", position0);
    let data: Blob | null = null;
    try {
      const result = await withImobiliareTimeout(
        input.admin.storage.from(MEDIA_BUCKET).download(path, { transform: { ...IMOBILIARE_PHOTO_TRANSFORM } }),
        IMOBILIARE_WAIT_MS,
        "Redimensionarea pozei din storage nu a răspuns în 20 de secunde.",
      );
      if (!result.error && result.data && result.data.size > 0) { data = result.data; }
    } catch {
      // Transformarea indisponibilă: revenim la original mai jos.
    }
    let lastError: unknown = null;
    for (let attempt = 0; !data && attempt <= IMOBILIARE_DOWNLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) await sleep(IMOBILIARE_DOWNLOAD_RETRY_DELAYS_MS[attempt - 1]!);
      try {
        const result = await withImobiliareTimeout(input.admin.storage.from(MEDIA_BUCKET).download(path), IMOBILIARE_WAIT_MS, "Descărcarea pozei din storage nu a răspuns în 20 de secunde.");
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
    const bytes = new Uint8Array(await withImobiliareTimeout(data.arrayBuffer(), IMOBILIARE_WAIT_MS, "Citirea pozei din storage nu s-a terminat în 20 de secunde."));
    const position = eligible.indexOf(row) + 1;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const firstPosition = seenHashes.get(hash);
    if (firstPosition !== undefined) {
      // Conținut identic: Imobiliare.ro păstrează o singură copie; o trimitem o dată.
      warnings.push(`Poza ${position} e identică cu poza ${firstPosition} și a fost trimisă o singură dată.`);
      duplicates += 1;
      continue;
    }
    seenHashes.set(hash, position);
    const mime = watermarked ? "image/jpeg" : mimeFromPath(row.storage_path);
    images.push({
      imageId: row.id,
      bytes: bytes.byteLength,
      dataUrl: `data:${mime};base64,${toBase64(bytes)}`,
    });
  }

  const expectedUnique = expected - duplicates;
  if (images.length === 0) {
    warnings.push("Nicio imagine publicabilă nu a putut fi pregătită pentru Imobiliare.ro.");
  }
  // O poză care nu se poate citi se sare; restul galeriei se trimite.
  const meta = images.length === 0 ? { transient: transient && !dataError } : {};
  if (images.length === 0) return { images, warnings, expected: expectedUnique, ...meta };
  try {
    const fitted = await fitImobiliareGallery(images, undefined, {
      maxSide: IMOBILIARE_PHOTO_TRANSFORM.width,
      onCompress: (n) => input.onStep?.("photo_compress", n),
    });
    return { images: fitted, warnings, expected: expectedUnique };
  } catch (error) {
    return { images: [], expected: expectedUnique, warnings: [...warnings, error instanceof Error ? error.message : "Comprimarea galeriei a eșuat."] };
  }
}
