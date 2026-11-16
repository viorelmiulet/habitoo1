import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";
import { IMOBILIARE_MAX_MEDIA_REQUEST_BYTES } from "./config";

export type GalleryImage = { dataUrl: string; bytes: number; imageId: string };
export function mediaRequestBytes(images: { dataUrl: string }[]): number {
  return new TextEncoder().encode(JSON.stringify({ images: images.map(image => image.dataUrl) })).byteLength;
}

/** Bytes of the base64 payload carried by a data URL. */
function dataUrlBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  return Uint8Array.from(atob(dataUrl.slice(comma + 1)), ch => ch.charCodeAt(0));
}

function decodeRaster(bytes: Uint8Array, mime: string): { data: ArrayLike<number>; width: number; height: number } {
  if (mime === "image/png") {
    const png = decodePng(bytes);
    const data = new Uint8Array(png.width * png.height * 4);
    const channels = png.channels;
    const scale = png.depth === 16 ? 257 : 1;
    for (let i = 0; i < png.width * png.height; i++) {
      const src = i * channels;
      const value = (offset: number) => Math.round(Number(png.data[src + offset] ?? 0) / scale);
      const alpha = channels === 2 ? value(1) : channels === 4 ? value(3) : 255;
      for (let c = 0; c < 3; c++) {
        const color = value(channels < 3 ? 0 : c);
        data[i * 4 + c] = Math.round(color * alpha / 255 + 255 * (1 - alpha / 255));
      }
      data[i * 4 + 3] = 255;
    }
    return { data, width: png.width, height: png.height };
  }
  if (mime === "image/jpeg") return jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 96 });
  throw new Error("O fotografie nu poate fi comprimată în JPEG; păstrează galeria și încarcă acea fotografie ca JPEG sau PNG.");
}

/** Approximate JPEG bits per pixel by quality (photographic content). */
const QUALITY_BPP: readonly [number, number][] = [[82, 1.7], [70, 1.25], [55, 0.95], [40, 0.75], [25, 0.55], [15, 0.4]];

/** Highest quality whose estimated output fits `targetBytes` for `pixels` (pure). */
export function jpegQualityForTarget(pixels: number, targetBytes: number): number {
  for (const [quality, bpp] of QUALITY_BPP) if ((pixels * bpp) / 8 <= targetBytes) return quality;
  return QUALITY_BPP[QUALITY_BPP.length - 1]![0];
}

/**
 * Compress one photo exactly once: a single decode, nearest-neighbour downscale to
 * `maxSide`, a single encode at the quality estimated for `targetBytes`. The raster is
 * local, so it is released before the next photo is processed.
 */
export function compressPhotoOnce(bytes: Uint8Array, mime: string, targetBytes: number, maxSide = 1920): Uint8Array {
  const raster = decodeRaster(bytes, mime);
  const ratio = Math.min(1, maxSide / Math.max(raster.width, raster.height));
  const width = Math.max(1, Math.round(raster.width * ratio));
  const height = Math.max(1, Math.round(raster.height * ratio));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (Math.min(raster.height - 1, Math.floor(y / ratio)) * raster.width + Math.min(raster.width - 1, Math.floor(x / ratio))) * 4;
    const dest = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) data[dest + c] = raster.data[src + c] ?? 255;
  }
  const quality = jpegQualityForTarget(width * height, targetBytes);
  return new Uint8Array(jpeg.encode({ data, width, height }, quality).data);
}

/** Base64 + JSON overhead: 4/3 inflation plus a small allowance per image. */
const binaryShare = (budgetBytes: number, count: number) => Math.floor(((budgetBytes - 64 - count * 32) * 3) / 4);

export const OVER_BUDGET_MESSAGE = "Galeria completă depășește dimensiunea permisă chiar și după comprimare JPEG; nicio fotografie nu a fost trimisă sau omisă.";

/**
 * Single pass: photos already within their share stay untouched; each larger photo is
 * decoded at most once and re-encoded once. No gallery-wide retry loop over qualities.
 */
export async function fitImobiliareGallery(
  images: GalleryImage[],
  budget = IMOBILIARE_MAX_MEDIA_REQUEST_BYTES,
  options: { maxSide?: number; onCompress?: (position: number) => Promise<void> | void } = {},
): Promise<GalleryImage[]> {
  if (mediaRequestBytes(images) <= budget) return images;
  const share = binaryShare(budget, images.length);
  const perPhoto = Math.floor(share / Math.max(1, images.length));
  const out: GalleryImage[] = [];
  for (const [index, image] of images.entries()) {
    const bytes = dataUrlBytes(image.dataUrl);
    if (bytes.byteLength <= perPhoto) { out.push(image); continue; }
    // Step log is awaited before the synchronous work, so a killed run shows the photo number.
    await options.onCompress?.(index + 1);
    const mime = /^data:image\/png;/.test(image.dataUrl) ? "image/png" : /^data:image\/jpe?g;/.test(image.dataUrl) ? "image/jpeg" : "other";
    const encoded = compressPhotoOnce(bytes, mime, perPhoto, options.maxSide ?? 1920);
    out.push({ ...image, bytes: encoded.byteLength, dataUrl: `data:image/jpeg;base64,${Buffer.from(encoded).toString("base64")}` });
  }
  if (mediaRequestBytes(out) <= budget) return out;
  throw new Error(OVER_BUDGET_MESSAGE);
}
