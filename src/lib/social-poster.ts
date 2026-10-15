export type SocialPosterFormat = "square" | "story" | "landscape" | "post";
export type SocialPosterTemplate = "classic" | "split" | "editorial" | "spotlight" | "collage" | "mosaic";
export const SOCIAL_POSTER_TEMPLATES: { value: SocialPosterTemplate; label: string }[] = [
  { value: "classic", label: "Clasic" }, { value: "split", label: "Split" },
  { value: "editorial", label: "Editorial" }, { value: "spotlight", label: "Spotlight" },
  { value: "collage", label: "Colaj" }, { value: "mosaic", label: "Mozaic" },
];
export function posterTemplate(value: unknown): SocialPosterTemplate {
  return SOCIAL_POSTER_TEMPLATES.find(t => t.value === value)?.value ?? "classic";
}
/** Selected cover first, followed by the remaining public images in listing order. */
export function posterPhotoSequence(photos: string[], selected: number) {
  const main = photos[Math.min(Math.max(0, selected), photos.length - 1)];
  return main ? [main, ...photos.filter(url => url !== main)] : [];
}
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
  template?: SocialPosterTemplate;
  photoUrls?: string[];
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
  return lines.map(line => {
    if (ctx.measureText(line).width <= maxWidth) return line;
    let short = line;
    while (short.length && ctx.measureText(`${short}…`).width > maxWidth) short = short.slice(0, -1);
    return `${short}…`;
  });
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

/** One dialog-scoped pool shares decoded images across preview and every thumbnail. */
export function createPosterAssetPool() {
  const images = new Map<string, Promise<ImageBitmap>>();
  let disposed = false;
  return {
    load(url: string) {
      let pending = images.get(url);
      if (!pending) {
        pending = loadBitmap(url).then(image => { if (disposed) image.close(); return image; });
        images.set(url, pending);
      }
      return pending;
    },
    dispose() { disposed = true; images.forEach(p => { void p.then(image => image.close()).catch(() => {}); }); images.clear(); },
  };
}
export type PosterAssetPool = ReturnType<typeof createPosterAssetPool>;
export async function renderSocialPoster(canvas: HTMLCanvasElement, o: SocialPosterOptions, render: { assets?: PosterAssetPool; maxWidth?: number } = {}) {
  const { width, height } = SOCIAL_POSTER_SIZES[o.format];
  const outputScale = render.maxWidth ? Math.min(1, render.maxWidth / width) : 1;
  canvas.width = Math.round(width * outputScale);
  canvas.height = Math.round(height * outputScale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Previzualizarea nu poate fi creată în acest browser.");
  ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  const k = SCALE[o.format];
  const landscape = o.format === "landscape";
  const { accent, background, text } = o.colors;
  const muted = rgba(text, 0.76);

  await Promise.all([
    document.fonts?.load('600 80px "Fraunces"'),
    document.fonts?.load('600 30px "Manrope"'),
    document.fonts?.load('800 30px "Manrope"'),
  ]);
  const assets = render.assets ?? createPosterAssetPool();
  const avatarUrl = o.agent?.photoUrl ?? o.bigAgentPhotoUrl;
  const [photo, logo, avatar] = await Promise.all([
    assets.load(o.photoUrl),
    o.logoUrl ? assets.load(o.logoUrl).catch(() => null) : Promise.resolve(null),
    avatarUrl ? assets.load(avatarUrl).catch(() => null) : Promise.resolve(null),
  ]);
  if (posterTemplate(o.template) !== "classic") {
    try {
      const extras = await Promise.all((o.photoUrls ?? []).filter(url => url !== o.photoUrl).slice(0, 3).map(url => assets.load(url)));
      drawPosterLayout(ctx, o, [photo, ...extras], logo, avatar, width, height);
    } finally { if (!render.assets) assets.dispose(); }
    return;
  }
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

  if (!render.assets) assets.dispose();
}

type PosterRect = { x: number; y: number; w: number; h: number };
const POSTER_PAPER = "#F7F3EA";
const POSTER_INK = "#171B22";

function drawPosterLayout(ctx: CanvasRenderingContext2D, o: SocialPosterOptions, photos: ImageBitmap[], logo: ImageBitmap | null, avatar: ImageBitmap | null, width: number, height: number) {
  const model = posterTemplate(o.template);
  const vertical = o.format === "story" || o.format === "post";
  const margin = width * 0.04;
  let panel: PosterRect;
  let image: PosterRect;
  ctx.textBaseline = "top";
  ctx.letterSpacing = "0px";
  ctx.fillStyle = o.colors.background;
  ctx.fillRect(0, 0, width, height);
  if (model === "split" || model === "collage") {
    panel = vertical ? { x: 0, y: height * 0.51, w: width, h: height * 0.49 } : { x: 0, y: 0, w: width * 0.48, h: height };
    image = vertical ? { x: 0, y: 0, w: width, h: height * 0.51 } : { x: panel.w, y: 0, w: width - panel.w, h: height };
  } else if (model === "editorial") {
    ctx.fillStyle = POSTER_PAPER;
    ctx.fillRect(0, 0, width, height);
    image = { x: margin, y: height * 0.27, w: width - 2 * margin, h: height * 0.39 };
    panel = { x: margin, y: height * 0.69, w: width - 2 * margin, h: height * 0.28 };
  } else {
    image = { x: 0, y: 0, w: width, h: height };
    panel = model === "spotlight" ? { x: margin, y: height * 0.31, w: width - 2 * margin, h: height * 0.65 } : { x: width * 0.12, y: height * 0.24, w: width * 0.76, h: height * 0.65 };
  }
  const main = photos[0];
  if (!main) return;
  const picture = (photo: ImageBitmap, r: PosterRect, round = false) => {
    ctx.save(); ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, round ? margin * 0.45 : 0); ctx.clip();
    coverInto(ctx, photo, r.x, r.y, r.w, r.h); ctx.restore();
  };
  if (model === "mosaic" && photos.length > 1) {
    const gap = width * 0.008;
    if (photos.length === 2) photos.forEach((p, i) => picture(p, { x: i * (width + gap) / 2, y: 0, w: (width - gap) / 2, h: height }));
    else {
      picture(main, { x: 0, y: 0, w: (width - gap) / 2, h: photos.length === 3 ? height : (height - gap) / 2 });
      photos.slice(1).forEach((p, i) => {
        const left = photos.length === 4 && i === 2;
        picture(p, { x: left ? 0 : (width + gap) / 2, y: left || i === 1 ? (height + gap) / 2 : 0, w: (width - gap) / 2, h: (height - gap) / 2 });
      });
    }
  } else if (model === "collage" && photos.length > 1) {
    const gap = width * 0.008;
    const smallH = image.h * 0.28;
    picture(main, { ...image, h: image.h - smallH - gap });
    const extras = photos.slice(1);
    extras.forEach((p, i) => picture(p, { x: image.x + i * (image.w + gap) / extras.length, y: image.y + image.h - smallH, w: (image.w - gap * (extras.length - 1)) / extras.length, h: smallH }));
  } else picture(main, image, model === "editorial");
  if (model === "spotlight") {
    const shade = ctx.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, rgba(o.colors.background, 0.2)); shade.addColorStop(0.45, rgba(o.colors.background, 0.86)); shade.addColorStop(1, rgba(o.colors.background, 0.98));
    ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
  }
  if (model === "mosaic") {
    ctx.fillStyle = rgba(o.colors.background, 0.9);
    ctx.beginPath(); ctx.roundRect(panel.x, panel.y, panel.w, panel.h, margin * 0.5); ctx.fill();
  }
  const topX = image.x + margin * 0.5;
  const topY = image.y + margin * 0.5;
  if (logo) {
    const lw = Math.min(width * 0.17, image.w * 0.34), lh = lw * 0.57;
    if (o.logoBackground !== "transparent") {
      ctx.fillStyle = o.logoBackground === "white" ? "#FFFFFF" : POSTER_INK;
      ctx.beginPath(); ctx.roundRect(topX, topY, lw, lh, 8); ctx.fill();
    }
    drawContained(ctx, logo, topX + lw * 0.08, topY + lh * 0.1, lw * 0.84, lh * 0.8);
  }
  if (o.bigAgentPhotoUrl && avatar) {
    const size = Math.min(image.w * 0.26, image.h * 0.33);
    const r = { x: image.x + image.w - size - margin * 0.5, y: image.y + margin * 0.5, w: size, h: size };
    picture(avatar, r, true);
    ctx.strokeStyle = o.colors.accent; ctx.lineWidth = 4; ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  if (o.stamp) {
    const x = image.x + image.w * 0.5, y = image.y + image.h * 0.68;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12);
    const w = image.w * 0.69, h = Math.min(75, image.h * 0.14);
    ctx.fillStyle = rgba(o.colors.background, 0.8); ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = o.colors.accent; ctx.lineWidth = 3; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.font = `800 ${h * 0.47}px "Manrope", sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = o.colors.accent;
    ctx.fillText(o.stamp.toLocaleUpperCase("ro-RO"), 0, -h * 0.24, w * 0.92); ctx.restore();
  }
  if (model === "editorial") {
    drawPosterContent(ctx, { ...o, price: null, oldPrice: null, viewing: null, details: [], agent: null }, { x: margin, y: margin * 0.45, w: width - margin * 2, h: height * 0.23 }, POSTER_INK, false, true, avatar);
    drawPosterContent(ctx, { ...o, label: null, overtitle: null, title: "", location: null }, panel, o.colors.text, true, false, avatar);
  } else drawPosterContent(ctx, o, { x: panel.x + margin * 0.7, y: panel.y + margin * 0.7, w: panel.w - margin * 1.4, h: panel.h - margin * 1.4 }, o.colors.text, false, false, avatar);
}

/** Measure every enabled block, then scale the complete composition to its panel. */
function drawPosterContent(ctx: CanvasRenderingContext2D, o: SocialPosterOptions, r: PosterRect, color: string, priceBadge: boolean, headingOnly: boolean, avatar: ImageBitmap | null) {
  const spotlight = o.template === "spotlight";
  type Block = { text: string; size: number; weight: number; font: string; color: string; gap: number; lines: number; kind?: "price" | "old" | "agent" };
  const blocks: Block[] = [];
  const add = (text: string | null, size: number, tint = color, kind?: Block["kind"], lines = 1, font = "Manrope") => {
    if (text) blocks.push({ text, size, color: tint, weight: font === "Fraunces" ? 600 : 700, font, gap: 14, lines, kind });
  };
  add(o.label, 24, headingOnly ? POSTER_INK : o.colors.accent);
  add(o.overtitle, 22, headingOnly ? POSTER_INK : o.colors.accent);
  if (spotlight) add(o.price, 110, o.colors.accent, "price", 1, "Fraunces");
  add(o.title, 62 * Math.min(1.2, Math.max(0.6, o.titleScale)), color, undefined, 2, "Fraunces");
  add(o.location, 27);
  if (!spotlight) add(o.price, 64, o.colors.accent, "price", 1, "Fraunces");
  add(o.oldPrice, 30, color, "old");
  add(o.viewing, 26, headingOnly ? POSTER_INK : o.colors.accent);
  add(o.details.join("  ·  "), 26, color, undefined, 2);
  add(o.agent?.name ?? null, 28, color, "agent");
  add(o.agent?.phone ?? null, 25);
  let scale = Math.min(1.25, r.w / 600);
  const measure = () => blocks.map(b => {
    ctx.font = `${b.weight} ${b.size * scale}px "${b.font}", sans-serif`;
    const reserved = b.kind === "agent" && o.agent?.photoUrl && avatar ? 60 * scale : 0;
    return { ...b, rendered: fitLines(ctx, b.text, r.w - reserved, b.lines) };
  });
  let measured = measure();
  const usedHeight = () => measured.reduce((sum, b) => sum + b.rendered.length * b.size * scale * 1.18 + b.gap * scale + (priceBadge && b.kind === "price" ? 20 * scale : 0), 0);
  for (let i = 0; i < 12 && usedHeight() > r.h; i++) { scale *= Math.min(0.95, r.h / usedHeight()); measured = measure(); }
  let y = spotlight ? r.y + Math.max(0, (r.h - usedHeight()) / 2) : r.y;
  for (const b of measured) {
    let left = r.x;
    if (priceBadge && b.kind === "price") {
      ctx.fillStyle = o.colors.background; ctx.beginPath(); ctx.roundRect(r.x, y - 5 * scale, r.w, b.size * scale * 1.18 + 20 * scale, 8); ctx.fill();
      left += 10 * scale; y += 5 * scale;
    }
    if (b.kind === "agent" && o.agent?.photoUrl && avatar) {
      const size = 44 * scale;
      ctx.save(); ctx.beginPath(); ctx.arc(r.x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip(); coverInto(ctx, avatar, r.x, y, size, size); ctx.restore(); left += 60 * scale;
    }
    ctx.font = `${b.weight} ${b.size * scale}px "${b.font}", sans-serif`;
    ctx.fillStyle = b.color; ctx.textAlign = spotlight ? "center" : "left";
    const x = spotlight ? r.x + r.w / 2 : left;
    b.rendered.forEach((line, i) => ctx.fillText(line, x, y + i * b.size * scale * 1.18, r.w - (left - r.x) - (priceBadge ? 20 * scale : 0)));
    if (b.kind === "old") {
      const w = Math.min(r.w, ctx.measureText(b.rendered[0] ?? "").width);
      ctx.fillRect(spotlight ? x - w / 2 : x, y + b.size * scale * 0.55, w, Math.max(1, 2 * scale));
    }
    y += b.rendered.length * b.size * scale * 1.18 + b.gap * scale + (priceBadge && b.kind === "price" ? 15 * scale : 0);
  }
  ctx.textAlign = "left";
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
