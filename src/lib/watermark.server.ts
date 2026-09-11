/**
 * Compunerea watermark-ului, pur JavaScript (fără dependențe native): rulează
 * în runtime-ul Worker unde `sharp`/`canvas` nu sunt disponibile.
 *
 * Strategie: generare LENEȘĂ, la prima cerere a portalului pentru imaginea
 * respectivă, cu rezultatul salvat în storage sub `watermarked/<hash>/<cale>`.
 * Publicarea nu așteaptă niciodată procesarea imaginilor.
 */
import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";
import {
  isWatermarkActive,
  logoMimeFromPath,
  watermarkRect,
  watermarkedPath,
  type WatermarkConfig,
} from "@/lib/watermark";

const MEDIA_BUCKET = "property-media";
const LOGO_BUCKET = "agency-logos";
/** Peste această dimensiune renunțăm la watermark ca să nu blocăm requestul. */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 4200 * 4200;

type Raster = { data: Uint8Array; width: number; height: number };

function pngToRaster(bytes: Uint8Array): Raster | null {
  const img = decodePng(bytes);
  const src = img.data as unknown as ArrayLike<number>;
  const channels = img.channels ?? 3;
  const scale = img.depth === 16 ? 257 : 1;
  const out = new Uint8Array(img.width * img.height * 4);
  for (let i = 0; i < img.width * img.height; i += 1) {
    const s = i * channels;
    const value = (v: number) => Math.min(255, Math.round(v / scale));
    if (channels === 1) {
      const g = value(src[s] ?? 0);
      out.set([g, g, g, 255], i * 4);
    } else if (channels === 2) {
      const g = value(src[s] ?? 0);
      out.set([g, g, g, value(src[s + 1] ?? 0)], i * 4);
    } else {
      out.set(
        [
          value(src[s] ?? 0),
          value(src[s + 1] ?? 0),
          value(src[s + 2] ?? 0),
          channels === 4 ? value(src[s + 3] ?? 0) : 255,
        ],
        i * 4,
      );
    }
  }
  return { data: out, width: img.width, height: img.height };
}

function jpegToRaster(bytes: Uint8Array): Raster {
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { data: new Uint8Array(img.data), width: img.width, height: img.height };
}

function decodeRaster(bytes: Uint8Array, mime: string | null): Raster | null {
  if (mime === "image/png") return pngToRaster(bytes);
  if (mime === "image/jpeg") return jpegToRaster(bytes);
  return null;
}

/** Compune logo-ul peste fotografie și întoarce un JPEG. */
export function composeWatermark(
  photo: Raster,
  logo: Raster,
  cfg: WatermarkConfig,
): Uint8Array {
  const rect = watermarkRect(photo.width, photo.height, logo.width, logo.height, cfg);
  const alpha = cfg.opacityPercent / 100;

  for (let y = 0; y < rect.height; y += 1) {
    const srcY = Math.min(logo.height - 1, Math.floor((y * logo.height) / rect.height));
    const destY = rect.y + y;
    if (destY < 0 || destY >= photo.height) continue;
    for (let x = 0; x < rect.width; x += 1) {
      const srcX = Math.min(logo.width - 1, Math.floor((x * logo.width) / rect.width));
      const destX = rect.x + x;
      if (destX < 0 || destX >= photo.width) continue;
      const s = (srcY * logo.width + srcX) * 4;
      const d = (destY * photo.width + destX) * 4;
      const a = ((logo.data[s + 3] ?? 255) / 255) * alpha;
      if (a <= 0) continue;
      for (let c = 0; c < 3; c += 1) {
        const base = photo.data[d + c] ?? 0;
        const over = logo.data[s + c] ?? 0;
        photo.data[d + c] = Math.round(base * (1 - a) + over * a);
      }
      photo.data[d + 3] = 255;
    }
  }

  const encoded = jpeg.encode({ data: photo.data, width: photo.width, height: photo.height }, 82);
  return new Uint8Array(encoded.data);
}

type AdminClient = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null }>;
      upload: (
        path: string,
        body: Blob | Uint8Array,
        options?: { upsert?: boolean; contentType?: string },
      ) => Promise<{ error: unknown }>;
      createSignedUrl: (
        path: string,
        seconds: number,
      ) => Promise<{ data: { signedUrl: string } | null }>;
    };
  };
};

async function downloadBytes(admin: AdminClient, bucket: string, path: string) {
  const { data } = await admin.storage.from(bucket).download(path);
  if (!data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return bytes.byteLength > MAX_SOURCE_BYTES ? null : bytes;
}

/**
 * Întoarce calea variantei cu watermark, generând-o dacă lipsește.
 * `null` = servește originalul (watermark inactiv sau imposibil de generat).
 */
export async function ensureWatermarkedPath(
  admin: AdminClient,
  storagePath: string,
  cfg: WatermarkConfig,
): Promise<string | null> {
  if (!isWatermarkActive(cfg) || !cfg.logoPath) return null;
  const target = watermarkedPath(storagePath, cfg);

  // Cache: dacă varianta există deja pentru această configurație, o refolosim.
  const cached = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(target, 60);
  if (cached.data?.signedUrl) return target;

  try {
    const [photoBytes, logoBytes] = await Promise.all([
      downloadBytes(admin, MEDIA_BUCKET, storagePath),
      downloadBytes(admin, LOGO_BUCKET, cfg.logoPath),
    ]);
    if (!photoBytes || !logoBytes) return null;

    const photo = decodeRaster(photoBytes, "image/jpeg") ?? decodeRaster(photoBytes, "image/png");
    const logo = decodeRaster(logoBytes, logoMimeFromPath(cfg.logoPath));
    if (!photo || !logo) return null;
    if (photo.width * photo.height > MAX_PIXELS) return null;

    const out = composeWatermark(photo, logo, cfg);
    const { error } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(target, out, { upsert: true, contentType: "image/jpeg" });
    if (error) return null;
    return target;
  } catch (error) {
    console.error("[watermark] generare eșuată", error);
    return null;
  }
}
