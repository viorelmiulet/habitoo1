/**
 * Pregătirea fotografiei actului pe server — totul în memorie.
 *
 * Regulă absolută: octeții imaginii nu sunt scriși nicăieri (fără bucket, fără
 * tabel, fără fișier temporar) și nu apar în loguri sau mesaje de eroare. Sunt
 * decodați, rotiți, reduși și trimiși modelului, apoi eliberați.
 *
 * Mediul de rulare al serverului nu are biblioteci native (sharp/canvas), deci
 * folosim decodoare pure JavaScript: JPEG și PNG sunt decodate și recodate aici;
 * WEBP și HEIC nu au decodor pur-JS, deci sunt trimise așa cum sunt (modelul le
 * acceptă), fără decupaj de reîncercare; din PDF extragem prima pagină.
 */
import { Buffer } from "node:buffer";
import { decode as decodeJpeg, encode as encodeJpeg } from "jpeg-js";
import { decode as decodePng } from "fast-png";
import { PDFDocument } from "pdf-lib";
import {
  applyOrientation,
  cropBottom,
  downscale,
  mimeForKind,
  readJpegOrientation,
  sniffIdImageKind,
  MAX_ID_CROP_EDGE,
  MAX_ID_EDGE,
  MAX_ID_INPUT_BYTES,
  MAX_ID_OUTPUT_BYTES,
  type IdImageKind,
  type Raster,
} from "./prepare";
import type { IdQualityReason } from "./quality";

export type IdAttachment = { mimeType: string; base64: string; bytes: number };

export type PreparedIdImage =
  | { ok: false; reason: IdQualityReason }
  | {
      ok: true;
      kind: IdImageKind;
      attachment: IdAttachment;
      /** Pixelii la rezoluție completă, doar pentru decupajul de reîncercare. */
      raster: Raster | null;
    };

const JPEG_QUALITY = 82;

export function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  return new Uint8Array(Buffer.from(clean, "base64"));
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function toRaster(png: ReturnType<typeof decodePng>): Raster | null {
  const { width, height, channels, depth } = png;
  const source = png.data as unknown as { length: number; [index: number]: number };
  const shift = depth === 16 ? 8 : 0;
  if (!width || !height || !channels) return null;
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const at = i * channels;
    const value = (index: number) => (source[at + index] as number) >> shift;
    const r = value(0);
    const g = channels >= 3 ? value(1) : r;
    const b = channels >= 3 ? value(2) : r;
    const a = channels === 4 ? value(3) : channels === 2 ? value(1) : 255;
    const to = i * 4;
    out[to] = r;
    out[to + 1] = g;
    out[to + 2] = b;
    out[to + 3] = a;
  }
  return { data: out, width, height };
}

function jpegAttachment(raster: Raster): IdAttachment {
  const encoded = encodeJpeg({ data: raster.data, width: raster.width, height: raster.height }, JPEG_QUALITY);
  const bytes = new Uint8Array(encoded.data);
  return { mimeType: "image/jpeg", base64: encodeBase64(bytes), bytes: bytes.length };
}

async function firstPdfPage(bytes: Uint8Array): Promise<Uint8Array | null> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (source.getPageCount() === 0) return null;
  const single = await PDFDocument.create();
  const [page] = await single.copyPages(source, [0]);
  if (!page) return null;
  single.addPage(page);
  return await single.save();
}

/** Pregătește o imagine sau un PDF pentru trimiterea la citirea automată. */
export async function prepareIdUpload(input: { contentType: string; base64: string }): Promise<PreparedIdImage> {
  const bytes = decodeBase64(input.base64);
  if (bytes.length === 0) return { ok: false, reason: "image_empty" };
  if (bytes.length > MAX_ID_INPUT_BYTES) return { ok: false, reason: "image_too_large" };

  const kind = sniffIdImageKind(bytes);
  if (!kind) return { ok: false, reason: "image_unsupported_format" };

  if (kind === "pdf") {
    let page: Uint8Array | null = null;
    try {
      page = await firstPdfPage(bytes);
    } catch {
      return { ok: false, reason: "image_corrupt" };
    }
    if (!page) return { ok: false, reason: "pdf_no_pages" };
    if (page.length > MAX_ID_OUTPUT_BYTES) return { ok: false, reason: "image_too_large" };
    return {
      ok: true,
      kind,
      attachment: { mimeType: "application/pdf", base64: encodeBase64(page), bytes: page.length },
      raster: null,
    };
  }

  if (kind === "webp" || kind === "heic") {
    /* Fără decodor pur-JS: trimitem fișierul ca atare, în limita de mărime. */
    if (bytes.length > MAX_ID_OUTPUT_BYTES) return { ok: false, reason: "image_too_large" };
    return {
      ok: true,
      kind,
      attachment: { mimeType: mimeForKind(kind), base64: encodeBase64(bytes), bytes: bytes.length },
      raster: null,
    };
  }

  let raster: Raster | null = null;
  try {
    if (kind === "jpeg") {
      const decoded = decodeJpeg(bytes, { useTArray: true });
      raster = applyOrientation(
        { data: new Uint8Array(decoded.data), width: decoded.width, height: decoded.height },
        readJpegOrientation(bytes),
      );
    } else {
      raster = toRaster(decodePng(bytes));
    }
  } catch {
    return { ok: false, reason: "image_corrupt" };
  }
  if (!raster || raster.width === 0 || raster.height === 0) return { ok: false, reason: "image_corrupt" };

  const reduced = downscale(raster, MAX_ID_EDGE);
  const attachment = jpegAttachment(reduced);
  if (attachment.bytes > MAX_ID_OUTPUT_BYTES) return { ok: false, reason: "image_too_large" };
  return { ok: true, kind, attachment, raster };
}

/**
 * Decupajul treimii inferioare, la rezoluție mai mare, pentru reîncercarea
 * citirii zonei automate. `null` când nu avem pixeli (WEBP/HEIC/PDF).
 */
export function mrzCropAttachment(raster: Raster | null): IdAttachment | null {
  if (!raster) return null;
  const crop = downscale(cropBottom(raster, 0.4), MAX_ID_CROP_EDGE);
  const attachment = jpegAttachment(crop);
  return attachment.bytes > MAX_ID_OUTPUT_BYTES ? null : attachment;
}
