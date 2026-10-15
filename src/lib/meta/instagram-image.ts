/** Pregătirea în browser a imaginilor pentru Instagram: decupare centrată + JPEG 0,9, ≤1440 px. */
import { IG_JPEG_QUALITY, IG_MAX_EDGE, cropRect, type IgRatio } from "./instagram-core";

async function toBitmap(blob: Blob) {
  return createImageBitmap(blob);
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Imaginea nu a putut fi convertită."))), "image/jpeg", IG_JPEG_QUALITY),
  );
}

/** `ratio` null = fără decupare (doar conversie + micșorare), de ex. posterul pentru story. */
export async function toInstagramJpeg(blob: Blob, ratio: IgRatio | null): Promise<Blob> {
  const bmp = await toBitmap(blob);
  const r = ratio ? cropRect(bmp.width, bmp.height, ratio) : (() => {
    const scale = Math.min(1, IG_MAX_EDGE / Math.max(bmp.width, bmp.height));
    return { sx: 0, sy: 0, sw: bmp.width, sh: bmp.height, outW: Math.round(bmp.width * scale), outH: Math.round(bmp.height * scale) };
  })();
  const c = document.createElement("canvas");
  c.width = r.outW;
  c.height = r.outH;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Browserul nu poate procesa imaginea.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, r.sx, r.sy, r.sw, r.sh, 0, 0, r.outW, r.outH);
  bmp.close?.();
  return canvasJpeg(c);
}

export async function urlToInstagramJpeg(url: string, ratio: IgRatio | null) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Nu am putut descărca poza.");
  return toInstagramJpeg(await res.blob(), ratio);
}
