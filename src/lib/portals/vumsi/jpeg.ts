/**
 * Vumsi: fiecare poză devine un JPEG real înainte de încărcare (calitate ~85,
 * max. 1600 px pe latura mare, sub 2 MB). Pur JS (jpeg-js / fast-png), sigur în Worker.
 */
import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";

export const VUMSI_JPEG_MAX_SIDE = 1600;
export const VUMSI_JPEG_MAX_BYTES = 2 * 1024 * 1024;
export const VUMSI_JPEG_QUALITY = 85;

export type SniffedKind = "jpeg" | "png" | "webp" | "gif" | "heic" | "html" | "unknown";

export function sniffImage(b: Uint8Array): SniffedKind {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  const ascii = (s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b.length >= 4 && ascii(0, 3) === "GIF") return "gif";
  if (b.length >= 12 && ascii(4, 8) === "ftyp") return "heic";
  const head = ascii(0, Math.min(64, b.length)).trimStart().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<")) return "html";
  return "unknown";
}

export function hexHead(b: Uint8Array, n = 12): string {
  return Array.from(b.slice(0, n), (x) => x.toString(16).padStart(2, "0")).join(" ");
}

type Raster = { data: ArrayLike<number>; width: number; height: number };

function decode(bytes: Uint8Array, kind: SniffedKind): Raster | null {
  if (kind === "jpeg") return jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 160 });
  if (kind === "png") {
    const png = decodePng(bytes);
    const out = new Uint8Array(png.width * png.height * 4);
    const ch = png.channels;
    const scale = png.depth === 16 ? 257 : 1;
    for (let i = 0; i < png.width * png.height; i++) {
      const v = (o: number) => Math.round(Number(png.data[i * ch + o] ?? 0) / scale);
      const a = ch === 2 ? v(1) : ch === 4 ? v(3) : 255;
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round((v(ch < 3 ? 0 : c) * a) / 255 + 255 * (1 - a / 255));
      out[i * 4 + 3] = 255;
    }
    return { data: out, width: png.width, height: png.height };
  }
  return null;
}

function resize(r: Raster, maxSide: number): Raster {
  const ratio = Math.min(1, maxSide / Math.max(r.width, r.height));
  if (ratio === 1) return r;
  const width = Math.max(1, Math.round(r.width * ratio));
  const height = Math.max(1, Math.round(r.height * ratio));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sy = Math.min(r.height - 1, Math.floor(y / ratio));
    const sx = Math.min(r.width - 1, Math.floor(x / ratio));
    const s = (sy * r.width + sx) * 4, d = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) data[d + c] = r.data[s + c] ?? 255;
  }
  return { data, width, height };
}

export type VumsiJpegResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number; sourceKind: SniffedKind; sourceBytes: number }
  | { ok: false; reason: string; sourceKind: SniffedKind; sourceBytes: number; head: string };

/** Convertește în JPEG real; răspunsurile non-imagine (HTML etc.) sunt refuzate. */
export function toVumsiJpeg(src: Uint8Array): VumsiJpegResult {
  const kind = sniffImage(src);
  const base = { sourceKind: kind, sourceBytes: src.byteLength, head: hexHead(src) };
  let raster: Raster | null = null;
  try { raster = decode(src, kind); } catch { raster = null; }
  if (!raster) return { ok: false, ...base, reason: kind === "html" || kind === "unknown" ? "răspunsul nu este o imagine" : `format ${kind} necompatibil` };
  for (const side of [VUMSI_JPEG_MAX_SIDE, 1280, 1024]) {
    const r = resize(raster, side);
    for (const q of [VUMSI_JPEG_QUALITY, 75, 65]) {
      const out = jpeg.encode({ data: r.data as Uint8Array, width: r.width, height: r.height }, q).data;
      if (out.byteLength < VUMSI_JPEG_MAX_BYTES) return { ok: true, bytes: new Uint8Array(out), width: r.width, height: r.height, sourceKind: kind, sourceBytes: src.byteLength };
    }
  }
  return { ok: false, ...base, reason: "imaginea depășește 2 MB și după comprimare" };
}
