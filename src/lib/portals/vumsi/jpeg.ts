/**
 * Vumsi acceptă JPEG/PNG/WebP/HEIC până la 25 MB (redimensionează ei peste 5000 px):
 * acestea pleacă neschimbate. Conversia în JPEG e doar rezervă (alte formate, ex. GIF,
 * sau fișiere peste 25 MB). Pur JS (jpeg-js / fast-png / omggif), sigur în Worker.
 */
import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";
import { GifReader } from "omggif";

export const VUMSI_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const VUMSI_JPEG_QUALITY = 85;
const PASSTHROUGH: Partial<Record<SniffedKind, { mime: string; ext: string }>> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
  heic: { mime: "image/heic", ext: "heic" },
};

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
  if (kind === "gif") {
    const g = new GifReader(bytes);
    const out = new Uint8Array(g.width * g.height * 4);
    g.decodeAndBlitFrameRGBA(0, out);
    for (let i = 0; i < g.width * g.height; i++) {
      const a = out[i * 4 + 3] / 255;
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(out[i * 4 + c] * a + 255 * (1 - a));
      out[i * 4 + 3] = 255;
    }
    return { data: out, width: g.width, height: g.height };
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

/** Rezervă: convertește în JPEG real sub 25 MB; răspunsurile non-imagine (HTML etc.) sunt refuzate. */
export function toVumsiJpeg(src: Uint8Array): VumsiJpegResult {
  const kind = sniffImage(src);
  const base = { sourceKind: kind, sourceBytes: src.byteLength, head: hexHead(src) };
  let raster: Raster | null = null;
  try { raster = decode(src, kind); } catch { raster = null; }
  if (!raster) return { ok: false, ...base, reason: kind === "html" || kind === "unknown" ? "răspunsul nu este o imagine" : `format ${kind} necompatibil` };
  for (const side of [Infinity, 5000, 3000]) {
    const r = Number.isFinite(side) ? resize(raster, side) : raster;
    for (const q of [VUMSI_JPEG_QUALITY, 75]) {
      const out = jpeg.encode({ data: r.data as Uint8Array, width: r.width, height: r.height }, q).data;
      if (out.byteLength <= VUMSI_MAX_IMAGE_BYTES) return { ok: true, bytes: new Uint8Array(out), width: r.width, height: r.height, sourceKind: kind, sourceBytes: src.byteLength };
    }
  }
  return { ok: false, ...base, reason: "imaginea depășește 25 MB și după comprimare" };
}

export type VumsiUpload =
  | { ok: true; bytes: Uint8Array; mime: string; ext: string; converted: boolean; sourceKind: SniffedKind }
  | { ok: false; reason: string; sourceKind: SniffedKind };

/** Formatele acceptate de Vumsi (≤ 25 MB) pleacă neschimbate; restul trec prin conversia JPEG. */
export function prepareVumsiImage(src: Uint8Array): VumsiUpload {
  const kind = sniffImage(src);
  const pass = PASSTHROUGH[kind];
  if (pass && src.byteLength <= VUMSI_MAX_IMAGE_BYTES) return { ok: true, bytes: src, ...pass, converted: false, sourceKind: kind };
  const j = toVumsiJpeg(src);
  if (!j.ok) return { ok: false, reason: j.reason, sourceKind: kind };
  return { ok: true, bytes: j.bytes, mime: "image/jpeg", ext: "jpg", converted: true, sourceKind: kind };
}
