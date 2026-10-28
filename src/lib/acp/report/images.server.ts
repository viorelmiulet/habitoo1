/**
 * Pozele raportului ACP: descărcare cu limită de timp și normalizare la JPEG
 * redimensionat (pdf-lib acceptă doar JPEG/PNG). Orice eșec întoarce `null`,
 * iar raportul desenează un fundal neutru „Fără fotografie”.
 * Pur JS (jpeg-js + fast-png), compatibil cu runtime-ul serverului.
 */
import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";

export type ReportImageLoader = (url: string) => Promise<Uint8Array | null>;

export const REPORT_IMAGE_TIMEOUT_MS = 5_000;
export const REPORT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const REPORT_IMAGE_MAX_PIXELS = 30_000_000;

function blockedHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return true;
  return false;
}

/** Descarcă o poză https; null dacă e inaccesibilă, prea mare sau mai lentă de 5 s. */
export const fetchReportImage: ReportImageLoader = async (raw) => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || blockedHost(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPORT_IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > REPORT_IMAGE_MAX_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength > REPORT_IMAGE_MAX_BYTES ? null : bytes;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** Rulează un loader cu limită de timp; orice excepție sau depășire dă null. */
export async function loadWithTimeout(
  loader: ReportImageLoader,
  url: string,
  timeoutMs = REPORT_IMAGE_TIMEOUT_MS,
): Promise<Uint8Array | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loader(url).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function imageKind(bytes: Uint8Array): "jpeg" | "png" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return null;
}

/**
 * Decodează JPEG/PNG, micșorează la `maxSide` px (medie pe zonă) și
 * re-encodează JPEG. Alte formate sau fișiere corupte → null.
 */
export function normalizeReportImage(
  bytes: Uint8Array,
  maxSide = 1000,
  quality = 72,
): { jpeg: Uint8Array; width: number; height: number } | null {
  try {
    const kind = imageKind(bytes);
    if (!kind) return null;
    let raster: { data: ArrayLike<number>; width: number; height: number };
    if (kind === "png") {
      const png = decodePng(bytes);
      if (png.width * png.height > REPORT_IMAGE_MAX_PIXELS) return null;
      const data = new Uint8Array(png.width * png.height * 4);
      const channels = png.channels;
      const scale = png.depth === 16 ? 257 : 1;
      if (png.palette) return null;
      for (let i = 0; i < png.width * png.height; i++) {
        const src = i * channels;
        const value = (offset: number) => Math.round(Number(png.data[src + offset] ?? 0) / scale);
        const alpha = channels === 2 ? value(1) : channels === 4 ? value(3) : 255;
        for (let c = 0; c < 3; c++) {
          const color = value(channels < 3 ? 0 : c);
          data[i * 4 + c] = Math.round((color * alpha) / 255 + 255 * (1 - alpha / 255));
        }
        data[i * 4 + 3] = 255;
      }
      raster = { data, width: png.width, height: png.height };
    } else {
      raster = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 160, maxResolutionInMP: 30 });
    }
    if (!raster.width || !raster.height) return null;
    const ratio = Math.min(1, maxSide / Math.max(raster.width, raster.height));
    const width = Math.max(1, Math.round(raster.width * ratio));
    const height = Math.max(1, Math.round(raster.height * ratio));
    const out = new Uint8Array(width * height * 4);
    const step = 1 / ratio;
    for (let y = 0; y < height; y++) {
      const y0 = Math.floor(y * step);
      const y1 = Math.min(raster.height, Math.max(y0 + 1, Math.floor((y + 1) * step)));
      for (let x = 0; x < width; x++) {
        const x0 = Math.floor(x * step);
        const x1 = Math.min(raster.width, Math.max(x0 + 1, Math.floor((x + 1) * step)));
        let r = 0, g = 0, b = 0, n = 0;
        // Eșantionare rară pe zone mari: calitate bună, cost limitat.
        const sy = Math.max(1, Math.floor((y1 - y0) / 3));
        const sx = Math.max(1, Math.floor((x1 - x0) / 3));
        for (let yy = y0; yy < y1; yy += sy) {
          for (let xx = x0; xx < x1; xx += sx) {
            const i = (yy * raster.width + xx) * 4;
            r += raster.data[i] ?? 0;
            g += raster.data[i + 1] ?? 0;
            b += raster.data[i + 2] ?? 0;
            n++;
          }
        }
        const d = (y * width + x) * 4;
        out[d] = r / n;
        out[d + 1] = g / n;
        out[d + 2] = b / n;
        out[d + 3] = 255;
      }
    }
    const encoded = jpeg.encode({ data: out, width, height }, quality).data;
    return { jpeg: new Uint8Array(encoded), width, height };
  } catch {
    return null;
  }
}
