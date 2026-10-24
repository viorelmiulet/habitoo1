import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";
import { IMOBILIARE_MAX_MEDIA_REQUEST_BYTES } from "./config";

export type GalleryImage = { dataUrl: string; bytes: number; imageId: string };
export function mediaRequestBytes(images: { dataUrl: string }[]): number {
  return new TextEncoder().encode(JSON.stringify({ images: images.map(image => image.dataUrl) })).byteLength;
}

/** Pure JS, sequential decoding: no native dependencies or concurrent large rasters. */
function compressedJpeg(image: GalleryImage, quality: number): GalleryImage {
  const comma = image.dataUrl.indexOf(",");
  const bytes = Uint8Array.from(atob(image.dataUrl.slice(comma + 1)), ch => ch.charCodeAt(0));
  let raster: { data: ArrayLike<number>; width: number; height: number };
  if (image.dataUrl.startsWith("data:image/png;")) {
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
    raster = { data, width: png.width, height: png.height };
  } else if (/^data:image\/jpe?g;/.test(image.dataUrl)) {
    raster = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 96 });
  } else {
    throw new Error("O fotografie nu poate fi comprimată în JPEG; păstrează galeria și încarcă acea fotografie ca JPEG sau PNG.");
  }
  const ratio = Math.min(1, 1920 / Math.max(raster.width, raster.height));
  const width = Math.max(1, Math.round(raster.width * ratio));
  const height = Math.max(1, Math.round(raster.height * ratio));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (Math.min(raster.height - 1, Math.floor(y / ratio)) * raster.width + Math.min(raster.width - 1, Math.floor(x / ratio))) * 4;
    const dest = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) data[dest + c] = raster.data[src + c] ?? 255;
  }
  const encoded = jpeg.encode({ data, width, height }, quality).data;
  return { ...image, bytes: encoded.byteLength, dataUrl: `data:image/jpeg;base64,${Buffer.from(encoded).toString("base64")}` };
}

export function fitImobiliareGallery(images: GalleryImage[], budget = IMOBILIARE_MAX_MEDIA_REQUEST_BYTES): GalleryImage[] {
  if (mediaRequestBytes(images) <= budget) return images;
  for (const quality of [82, 70, 55, 40, 25]) {
    const compressed = images.map(image => compressedJpeg(image, quality));
    if (mediaRequestBytes(compressed) <= budget) return compressed;
  }
  throw new Error("Galeria completă depășește dimensiunea permisă chiar și după comprimare JPEG; nicio fotografie nu a fost trimisă sau omisă.");
}