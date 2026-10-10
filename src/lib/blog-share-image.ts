// Imaginea de distribuire 1200×630 (PNG) a unui articol de blog: ilustrația
// articolului, titlul și logo-ul Habitoo, desenate în browser pe canvas.
// Sursele sunt same-origin (/assets, /api/public/blog-media), deci canvasul nu e „tainted”.

export const SHARE_W = 1200;
export const SHARE_H = 630;
export const BLOG_SHARE_LOGO = "/assets/habitoo-logo.png";

/** URL-ul public al imaginii de distribuire; `v` invalidează cache-ul rețelelor. */
export function blogShareImageUrl(siteUrl: string, postId: string, updatedAt: string) {
  const v = new Date(updatedAt).getTime() || 0;
  return `${siteUrl}/api/public/blog-og/${postId}.png?v=${v}`;
}

/** Calea din bucketul `blog-media` unde se salvează imaginea. */
export function blogShareImagePath(postId: string) {
  return `og/${postId}.png`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function wrapLines(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1]!;
    while (last && measure(`${last}…`) > maxWidth) last = last.replace(/\s*\S+$/, "");
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

export async function renderBlogShareImage(input: {
  title: string;
  coverUrl: string | null;
  category?: string | null;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f7f1e6";
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  ctx.fillStyle = "#c08a3e";
  ctx.fillRect(0, SHARE_H - 14, SHARE_W, 14);

  const [cover, logo] = await Promise.all([
    input.coverUrl ? loadImage(input.coverUrl) : Promise.resolve(null),
    loadImage(BLOG_SHARE_LOGO),
  ]);
  // Ilustrația în dreapta (raport 16:9).
  if (cover) {
    const w = 500;
    const h = Math.round((w * 9) / 16);
    const x = SHARE_W - w - 60;
    const y = Math.round((SHARE_H - h) / 2);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 24);
    ctx.clip();
    ctx.drawImage(cover, x, y, w, h);
    ctx.restore();
  }
  if (logo) {
    const h = 56;
    const w = Math.round((logo.naturalWidth / logo.naturalHeight) * h) || 200;
    ctx.drawImage(logo, 64, 56, Math.min(w, 260), h);
  }

  const textWidth = cover ? 540 : SHARE_W - 128;
  if (input.category) {
    ctx.fillStyle = "#8a6128";
    ctx.font = "700 24px Manrope, system-ui, sans-serif";
    ctx.fillText(input.category.toUpperCase(), 64, 190);
  }
  ctx.fillStyle = "#1c2430";
  ctx.font = "600 52px Fraunces, Georgia, serif";
  const lines = wrapLines((s) => ctx.measureText(s).width, input.title, textWidth, 5);
  lines.forEach((l, i) => ctx.fillText(l, 64, 260 + i * 64));
  ctx.fillStyle = "#5b6370";
  ctx.font = "600 24px Manrope, system-ui, sans-serif";
  ctx.fillText("www.habitoo.ro/blog", 64, SHARE_H - 52);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG indisponibil"))), "image/png"),
  );
}
