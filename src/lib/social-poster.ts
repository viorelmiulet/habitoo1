export type SocialPosterFormat = "square" | "story" | "landscape" | "post";
export type SocialPosterTransaction = "sale" | "rent";
export type PosterLogoBackground = "transparent" | "white" | "dark";
export type PosterStamp = "new" | "exclusive" | "reduced" | "reserved" | "sold" | "zero";

export const SOCIAL_POSTER_SIZES: Record<SocialPosterFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  landscape: { width: 1200, height: 628 },
  post: { width: 1080, height: 1350 },
};

export const SOCIAL_POSTER_FORMATS: { value: SocialPosterFormat; label: string }[] = [
  { value: "square", label: "Pătrat (Feed)" },
  { value: "story", label: "Story / Reel" },
  { value: "landscape", label: "Landscape" },
  { value: "post", label: "Postare" },
];

export const POSTER_STAMPS: Record<PosterStamp, string> = {
  new: "Nou",
  exclusive: "Exclusiv",
  reduced: "Preț redus",
  reserved: "Rezervat",
  sold: "Vândut",
  zero: "Comision 0%",
};

export type PosterColors = { accent: string; background: string; text: string };
export const DEFAULT_POSTER_COLORS: PosterColors = { accent: "#C8A24B", background: "#0E1118", text: "#FFFFFF" };

export type SocialPosterOptions = {
  format: SocialPosterFormat;
  photoUrl: string;
  logoUrl: string | null;
  logoBackground: PosterLogoBackground;
  label: string | null;
  overtitle: string | null;
  title: string;
  titleScale: number;
  location: string | null;
  price: string | null;
  oldPrice: string | null;
  viewing: string | null;
  details: string[];
  agent: { name: string; phone: string | null; photoUrl: string | null } | null;
  bigAgentPhotoUrl: string | null;
  stamp: string | null;
  colors: PosterColors;
};

/** Curăță titlurile importate fără să inventeze sau să adauge informații. */
export function cleanPosterTitle(value: string) {
  const clean = value
    .replace(/[|•·–—\-\s]+$/g, "")
    .replace(/^[|•·–—\-\s]+/g, "")
    .replace(/\s*[|]+\s*/g, " — ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Proprietate";
  const letters = clean.replace(/[^A-Za-zĂÂÎȘȚăâîșț]/g, "");
  const uppercase = letters.length > 8 && letters === letters.toLocaleUpperCase("ro-RO");
  return uppercase
    ? clean.toLocaleLowerCase("ro-RO").replace(/(^|[.!?]\s+)(\p{L})/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase("ro-RO")}`)
    : clean;
}

export function posterFileName(format: SocialPosterFormat, title: string) {
  const slug = cleanPosterTitle(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72)
    .replace(/-$/g, "");
  return `poster-${slug || "proprietate"}-${format}.png`;
}

export function formatPosterPrice(value: number | null, currency: string) {
  if (!value) return "";
  const amount = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(value);
  const symbol = currency.toUpperCase() === "EUR" ? "€" : ` ${currency.toUpperCase()}`;
  return `${amount}${symbol}`;
}

/** „Vizionări: 12 oct., 14:00” din valorile selectorilor de dată (yyyy-mm-dd) și oră (hh:mm). */
export function formatViewing(date: string | null, time: string | null) {
  const parts: string[] = [];
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    parts.push(new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d))));
  }
  if (time && /^\d{2}:\d{2}$/.test(time)) parts.push(time);
  return parts.length ? `Vizionări: ${parts.join(", ")}` : null;
}

export function normalizeHex(value: string) {
  const v = value.trim().replace(/^#?/, "#");
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toUpperCase();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
}

function rgb(hex: string) {
  const v = normalizeHex(hex) ?? "#000000";
  return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
}

function rgba(hex: string, alpha: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Raport de contrast WCAG între două culori hex. */
export function contrastRatio(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, b] = rgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const SCALE: Record<SocialPosterFormat, number> = { story: 1, post: 1, square: 0.9, landscape: 0.6 };

async function loadBitmap(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Fotografia nu a putut fi încărcată.");
  return createImageBitmap(await response.blob());
}

function coverInto(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

function drawContained(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / image.width, h / image.height);
  ctx.drawImage(image, x + (w - image.width * scale) / 2, y + (h - image.height * scale) / 2, image.width * scale, image.height * scale);
}

function fitLines(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines = 2) {
  const words = cleanPosterTitle(value).split(" ");
  const lines: string[] = [];
  let current = "";
  let used = 0;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      used += 1;
      continue;
    }
    lines.push(current);
    if (lines.length === maxLines) { current = ""; break; }
    current = word;
    used += 1;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (used < words.length && lines.length) {
    const last = lines.length - 1;
    while (lines[last].includes(" ") && ctx.measureText(`${lines[last]}…`).width > maxWidth) {
      lines[last] = lines[last].split(" ").slice(0, -1).join(" ");
    }
    lines[last] = `${lines[last].replace(/[,;:.\-—]+$/, "")}…`;
  }
  return lines;
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, k: number, color: string) {
  ctx.font = `600 ${25 * k}px "Manrope", sans-serif`;
  const w = ctx.measureText(text).width + 42 * k;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 48 * k, 24 * k);
  ctx.strokeStyle = rgba(color, 0.42);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(text, x + 21 * k, y + 11 * k);
  return w;
}

function pillWidth(ctx: CanvasRenderingContext2D, text: string, k: number) {
  ctx.font = `600 ${25 * k}px "Manrope", sans-serif`;
  return ctx.measureText(text).width + 42 * k;
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(0, 13);
  ctx.bezierCurveTo(-15, -5, -13, -23, 0, -23);
  ctx.bezierCurveTo(13, -23, 15, -5, 0, 13);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -10, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export async function renderSocialPoster(canvas: HTMLCanvasElement, o: SocialPosterOptions) {
  const { width, height } = SOCIAL_POSTER_SIZES[o.format];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Previzualizarea nu poate fi creată în acest browser.");
  const k = SCALE[o.format];
  const landscape = o.format === "landscape";
  const { accent, background, text } = o.colors;
  const muted = rgba(text, 0.76);

  await Promise.all([
    document.fonts?.load('600 80px "Fraunces"'),
    document.fonts?.load('600 30px "Manrope"'),
    document.fonts?.load('800 30px "Manrope"'),
  ]);
  const avatarUrl = o.agent?.photoUrl ?? o.bigAgentPhotoUrl;
  const [photo, logo, avatar] = await Promise.all([
    loadBitmap(o.photoUrl),
    o.logoUrl ? loadBitmap(o.logoUrl).catch(() => null) : Promise.resolve(null),
    avatarUrl ? loadBitmap(avatarUrl).catch(() => null) : Promise.resolve(null),
  ]);
  ctx.textBaseline = "top";
  ctx.letterSpacing = "0px";

  coverInto(ctx, photo, 0, 0, width, height);
  const shade = landscape ? ctx.createLinearGradient(width * 0.3, 0, width, 0) : ctx.createLinearGradient(0, height * 0.4, 0, height);
  shade.addColorStop(0, "rgba(9,12,16,0)");
  shade.addColorStop(0.6, "rgba(9,12,16,.14)");
  shade.addColorStop(1, "rgba(9,12,16,.6)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  const M = Math.round(48 * k);
  const pad = 46 * k;

  // Logo
  const logoW = 164 * k;
  const logoH = 94 * k;
  if (logo) {
    if (o.logoBackground !== "transparent") {
      ctx.beginPath();
      ctx.roundRect(M, M, logoW, logoH, 18 * k);
      ctx.fillStyle = o.logoBackground === "white" ? "rgba(255,255,255,.95)" : "rgba(12,15,20,.86)";
      ctx.fill();
    }
    drawContained(ctx, logo, M + 16 * k, M + 14 * k, logoW - 32 * k, logoH - 28 * k);
  }

  // Card geometry and content measurement
  const cardW = landscape ? width * 0.56 : width - 2 * M;
  const cardX = landscape ? width - M - cardW : M;
  const W = cardW - 2 * pad;
  const titleSize = (o.format === "story" ? 70 : 62) * k * Math.min(1.2, Math.max(0.6, o.titleScale));
  const titleLH = titleSize * 1.14;
  ctx.font = `600 ${titleSize}px "Fraunces", Georgia, serif`;
  const titleLines = fitLines(ctx, o.title, W, 2);

  const priceSize = 55 * k;
  ctx.font = `600 ${priceSize}px "Fraunces", Georgia, serif`;
  const priceTextW = o.price ? ctx.measureText(o.price).width : 0;
  ctx.font = `500 ${30 * k}px "Fraunces", Georgia, serif`;
  const oldW = o.price && o.oldPrice ? ctx.measureText(o.oldPrice).width + 18 * k : 0;
  const priceBlockW = o.price ? priceTextW + oldW : 0;
  const priceBlockH = o.price ? 28 * k + priceSize : 0;
  const tags: string[] = [];
  let tagsW = 0;
  const tagsAvail = W - (priceBlockW ? priceBlockW + 28 * k : 0);
  for (const tag of o.details.slice(0, 3)) {
    const w = pillWidth(ctx, tag, k);
    if (tagsW + w > tagsAvail) break;
    tags.push(tag);
    tagsW += w + 14 * k;
  }
  const bottomH = Math.max(tags.length ? 48 * k : 0, priceBlockH);

  const blocks: number[] = [];
  if (o.overtitle) blocks.push(26 * k + 22 * k);
  blocks.push(titleLines.length * titleLH);
  if (o.location) blocks.push(18 * k + 30 * k);
  if (o.viewing) blocks.push(14 * k + 30 * k);
  if (o.agent) blocks.push(26 * k + 64 * k);
  if (bottomH) blocks.push(28 * k + bottomH);
  const contentH = blocks.reduce((a, b) => a + b, 0);
  const cardH = Math.min(height - 2 * M, contentH + 2 * pad);
  const cardY = height - M - cardH;

  // Big agent photo
  if (o.bigAgentPhotoUrl && avatar) {
    const size = Math.round((landscape ? 250 : o.format === "square" ? 230 : 270) * k);
    const x = landscape ? M : cardX + cardW - size;
    const y = landscape ? height - M - size : cardY - size - 20 * k;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 28 * k);
    ctx.clip();
    coverInto(ctx, avatar, x, y, size, size);
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 28 * k);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4 * k;
    ctx.stroke();
  }

  // Transaction label
  if (o.label) {
    const t = o.label.toLocaleUpperCase("ro-RO");
    ctx.font = `700 ${24 * k}px "Manrope", sans-serif`;
    ctx.letterSpacing = `${5 * k}px`;
    const w = ctx.measureText(t).width + 54 * k;
    const h = 62 * k;
    const x = landscape ? (logo ? M + logoW + 16 * k : M) : width - M - w;
    const y = M + (logo ? (logoH - h) / 2 : 6 * k);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = "rgba(10,13,18,.34)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.68)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(t, x + 27 * k, y + (h - 24 * k) / 2 + 1);
    ctx.letterSpacing = "0px";
  }

  // Stamp
  if (o.stamp) {
    const t = o.stamp.toLocaleUpperCase("ro-RO");
    ctx.save();
    ctx.font = `800 ${44 * k}px "Manrope", sans-serif`;
    ctx.letterSpacing = `${6 * k}px`;
    const w = ctx.measureText(t).width + 60 * k;
    const h = 92 * k;
    const cx = landscape ? cardX / 2 : o.bigAgentPhotoUrl ? width * 0.36 : width / 2;
    const cy = landscape ? height * 0.42 : Math.max(M + logoH + 110 * k, cardY * 0.5);
    ctx.translate(cx, cy);
    ctx.rotate(-0.2);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 14 * k);
    ctx.fillStyle = rgba(background, 0.55);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5 * k;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 9 * k, -h / 2 + 9 * k, w - 18 * k, h - 18 * k, 8 * k);
    ctx.lineWidth = 2 * k;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.fillText(t, 3 * k, -22 * k);
    ctx.restore();
  }

  // Card
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 28 * k);
  ctx.fillStyle = rgba(background, 0.92);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const left = cardX + pad;
  const right = cardX + cardW - pad;
  let y = cardY + pad;

  if (o.overtitle) {
    ctx.fillStyle = accent;
    ctx.font = `700 ${23 * k}px "Manrope", sans-serif`;
    ctx.letterSpacing = `${5 * k}px`;
    ctx.fillText(o.overtitle.toLocaleUpperCase("ro-RO"), left, y, W);
    ctx.letterSpacing = "0px";
    y += 48 * k;
  }
  ctx.fillStyle = text;
  ctx.font = `600 ${titleSize}px "Fraunces", Georgia, serif`;
  titleLines.forEach((line, i) => ctx.fillText(line, left, y + i * titleLH));
  y += titleLines.length * titleLH;

  if (o.location) {
    y += 18 * k;
    drawPin(ctx, left + 8 * k, y + 20 * k, k, muted);
    ctx.font = `500 ${27 * k}px "Manrope", sans-serif`;
    ctx.fillStyle = text;
    ctx.fillText(o.location, left + 36 * k, y, W - 36 * k);
    y += 30 * k;
  }
  if (o.viewing) {
    y += 14 * k;
    ctx.font = `700 ${25 * k}px "Manrope", sans-serif`;
    ctx.fillStyle = accent;
    ctx.fillText(o.viewing, left, y, W);
    y += 30 * k;
  }
  if (o.agent) {
    y += 26 * k;
    const s = 64 * k;
    let tx = left;
    if (o.agent.photoUrl && avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(left + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
      ctx.clip();
      coverInto(ctx, avatar, left, y, s, s);
      ctx.restore();
      tx += s + 18 * k;
    }
    ctx.fillStyle = text;
    ctx.font = `700 ${26 * k}px "Manrope", sans-serif`;
    ctx.fillText(o.agent.name, tx, y + (o.agent.phone ? 4 * k : 18 * k), right - tx);
    if (o.agent.phone) {
      ctx.fillStyle = muted;
      ctx.font = `500 ${23 * k}px "Manrope", sans-serif`;
      ctx.fillText(o.agent.phone, tx, y + 36 * k, right - tx);
    }
    y += s;
  }
  if (bottomH) {
    const rowY = y + 28 * k;
    let tx = left;
    for (const tag of tags) tx += pill(ctx, tag, tx, rowY + bottomH - 48 * k, k, text) + 14 * k;
    if (o.price) {
      ctx.textAlign = "right";
      ctx.fillStyle = muted;
      ctx.font = `700 ${19 * k}px "Manrope", sans-serif`;
      ctx.letterSpacing = `${4 * k}px`;
      ctx.fillText("PREȚ", right, rowY);
      ctx.letterSpacing = "0px";
      ctx.fillStyle = accent;
      ctx.font = `600 ${priceSize}px "Fraunces", Georgia, serif`;
      const py = rowY + 28 * k;
      ctx.fillText(o.price, right, py);
      if (o.oldPrice) {
        ctx.fillStyle = muted;
        ctx.font = `500 ${30 * k}px "Fraunces", Georgia, serif`;
        const ox = right - priceTextW - 18 * k;
        const ow = ctx.measureText(o.oldPrice).width;
        const oy = py + priceSize - 36 * k;
        ctx.fillText(o.oldPrice, ox, oy);
        ctx.fillRect(ox - ow, oy + 16 * k, ow, 2.5 * k);
      }
      ctx.textAlign = "left";
    }
  }

  photo.close();
  logo?.close();
  avatar?.close();
}

export function downloadPoster(canvas: HTMLCanvasElement, fileName: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
