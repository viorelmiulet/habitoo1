/**
 * Geometria și identificarea fișierului — modul pur, fără I/O.
 *
 * Aici nu se scrie nimic pe disc și nu se apelează nicio rețea: doar recunoaștem
 * formatul din primii octeți, citim orientarea EXIF, reducem și decupăm pixeli.
 * Octeții imaginii nu sunt niciodată înregistrați în loguri.
 */

/** Plafon la intrare, înainte de orice prelucrare. */
export const MAX_ID_INPUT_BYTES = 12 * 1024 * 1024;
/** Plafon după reducere, pentru cererea trimisă modelului. */
export const MAX_ID_OUTPUT_BYTES = 4 * 1024 * 1024;
/** Latura maximă pentru prima citire. */
export const MAX_ID_EDGE = 1600;
/** Latura maximă pentru decupajul de reîncercare (rezoluție mai mare pe zona citibilă). */
export const MAX_ID_CROP_EDGE = 2200;

export type IdImageKind = "jpeg" | "png" | "webp" | "heic" | "pdf";

export type Raster = { data: Uint8Array; width: number; height: number };

const SIGNATURES: { kind: IdImageKind; test: (bytes: Uint8Array) => boolean }[] = [
  { kind: "jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    kind: "png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    kind: "webp",
    test: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45,
  },
  { kind: "pdf", test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  {
    kind: "heic",
    test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  },
];

/** Formatul real, din semnătura fișierului — nu din tipul declarat de client. */
export function sniffIdImageKind(bytes: Uint8Array): IdImageKind | null {
  if (bytes.length < 12) return null;
  for (const entry of SIGNATURES) if (entry.test(bytes)) return entry.kind;
  return null;
}

export function mimeForKind(kind: IdImageKind): string {
  if (kind === "jpeg") return "image/jpeg";
  if (kind === "png") return "image/png";
  if (kind === "webp") return "image/webp";
  if (kind === "heic") return "image/heic";
  return "application/pdf";
}

/** Orientarea EXIF (1–8) dintr-un JPEG; `1` dacă nu este declarată. */
export function readJpegOrientation(bytes: Uint8Array): number {
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1] as number;
    const size = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);
    if (marker === 0xe1 && size > 8) {
      const start = offset + 4;
      const isExif =
        bytes[start] === 0x45 &&
        bytes[start + 1] === 0x78 &&
        bytes[start + 2] === 0x69 &&
        bytes[start + 3] === 0x66;
      if (isExif) {
        const tiff = start + 6;
        const little = bytes[tiff] === 0x49;
        const u16 = (at: number) =>
          little
            ? (bytes[at] as number) | ((bytes[at + 1] as number) << 8)
            : ((bytes[at] as number) << 8) | (bytes[at + 1] as number);
        const u32 = (at: number) =>
          little
            ? (bytes[at] as number) |
              ((bytes[at + 1] as number) << 8) |
              ((bytes[at + 2] as number) << 16) |
              ((bytes[at + 3] as number) << 24)
            : ((bytes[at] as number) << 24) |
              ((bytes[at + 1] as number) << 16) |
              ((bytes[at + 2] as number) << 8) |
              (bytes[at + 3] as number);
        const ifd = tiff + u32(tiff + 4);
        const count = u16(ifd);
        for (let i = 0; i < count; i += 1) {
          const entry = ifd + 2 + i * 12;
          if (u16(entry) === 0x0112) {
            const value = u16(entry + 8);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
      }
    }
    if (marker === 0xda) break;
    offset += 2 + size;
  }
  return 1;
}

/** Aplică orientarea EXIF pe pixeli (rotire și, unde e cazul, oglindire). */
export function applyOrientation(raster: Raster, orientation: number): Raster {
  if (orientation <= 1 || orientation > 8) return raster;
  const { data, width, height } = raster;
  const swap = orientation >= 5;
  const outWidth = swap ? height : width;
  const outHeight = swap ? width : height;
  const out = new Uint8Array(outWidth * outHeight * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let nx = x;
      let ny = y;
      if (orientation === 2) nx = width - 1 - x;
      else if (orientation === 3) {
        nx = width - 1 - x;
        ny = height - 1 - y;
      } else if (orientation === 4) ny = height - 1 - y;
      else if (orientation === 5) {
        nx = y;
        ny = x;
      } else if (orientation === 6) {
        nx = height - 1 - y;
        ny = x;
      } else if (orientation === 7) {
        nx = height - 1 - y;
        ny = width - 1 - x;
      } else if (orientation === 8) {
        nx = y;
        ny = width - 1 - x;
      }
      const from = (y * width + x) * 4;
      const to = (ny * outWidth + nx) * 4;
      out[to] = data[from] as number;
      out[to + 1] = data[from + 1] as number;
      out[to + 2] = data[from + 2] as number;
      out[to + 3] = data[from + 3] as number;
    }
  }
  return { data: out, width: outWidth, height: outHeight };
}

/** Reduce imaginea la latura maximă cerută, prin medie pe blocuri. Nu mărește niciodată. */
export function downscale(raster: Raster, maxEdge: number): Raster {
  const longest = Math.max(raster.width, raster.height);
  if (longest <= maxEdge) return raster;
  const scale = maxEdge / longest;
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  const out = new Uint8Array(width * height * 4);
  const xRatio = raster.width / width;
  const yRatio = raster.height / height;
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < Math.min(y1, raster.height); sy += 1) {
        for (let sx = x0; sx < Math.min(x1, raster.width); sx += 1) {
          const at = (sy * raster.width + sx) * 4;
          r += raster.data[at] as number;
          g += raster.data[at + 1] as number;
          b += raster.data[at + 2] as number;
          a += raster.data[at + 3] as number;
          n += 1;
        }
      }
      const to = (y * width + x) * 4;
      out[to] = Math.round(r / n);
      out[to + 1] = Math.round(g / n);
      out[to + 2] = Math.round(b / n);
      out[to + 3] = Math.round(a / n);
    }
  }
  return { data: out, width, height };
}

/** Decupează partea de jos a imaginii (zona citibilă automat a actului). */
export function cropBottom(raster: Raster, fraction: number): Raster {
  const keep = Math.max(1, Math.min(raster.height, Math.round(raster.height * fraction)));
  const top = raster.height - keep;
  const out = new Uint8Array(raster.width * keep * 4);
  for (let y = 0; y < keep; y += 1) {
    const from = (top + y) * raster.width * 4;
    out.set(raster.data.subarray(from, from + raster.width * 4), y * raster.width * 4);
  }
  return { data: out, width: raster.width, height: keep };
}
