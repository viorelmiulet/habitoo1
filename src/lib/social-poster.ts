export type SocialPosterFormat = "story" | "post";
export type SocialPosterTransaction = "sale" | "rent";

export type SocialPosterOptions = {
  format: SocialPosterFormat;
  transaction: SocialPosterTransaction;
  photoUrl: string;
  logoUrl: string | null;
  showLogo: boolean;
  showPhone: boolean;
  showPrice: boolean;
  title: string;
  location: string;
  rooms: number | null;
  surface: number | null;
  floor: string | null;
  phone: string | null;
  price: number | null;
  currency: string;
};

export const SOCIAL_POSTER_SIZES: Record<SocialPosterFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
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
    .slice(0, 72);
  return `${format}-${slug || "proprietate"}.png`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

async function loadBitmap(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Fotografia nu a putut fi încărcată.");
  return createImageBitmap(await response.blob());
}

function drawCover(ctx: CanvasRenderingContext2D, image: ImageBitmap, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(
    image,
    (image.width - sourceWidth) / 2,
    (image.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
}

function drawContained(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function fitLines(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines = 2) {
  const words = cleanPosterTitle(value).split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  const consumed = lines.join(" ").split(" ").length;
  if (consumed < words.length && lines.length) {
    let last = lines.length - 1;
    while (lines[last] && ctx.measureText(`${lines[last]}…`).width > maxWidth) {
      lines[last] = lines[last].split(" ").slice(0, -1).join(" ");
    }
    lines[last] = `${lines[last]}…`;
  }
  return lines;
}

function formatPosterPrice(value: number, currency: string) {
  const amount = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(value);
  const symbol = currency.toUpperCase() === "EUR" ? "€" : currency.toUpperCase();
  return `${amount}${symbol}`;
}

function drawTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = '600 25px "Manrope", sans-serif';
  const width = ctx.measureText(text).width + 42;
  roundedRect(ctx, x, y, width, 48, 24);
  ctx.strokeStyle = "rgba(255,255,255,.42)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(text, x + 21, y + 32);
  return width;
}

function drawLocationPin(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 13);
  ctx.bezierCurveTo(-15, -5, -13, -23, 0, -23);
  ctx.bezierCurveTo(13, -23, 15, -5, 0, 13);
  ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,.82)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -10, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.fill();
  ctx.restore();
}

export async function renderSocialPoster(canvas: HTMLCanvasElement, options: SocialPosterOptions) {
  const { width, height } = SOCIAL_POSTER_SIZES[options.format];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Previzualizarea nu poate fi creată în acest browser.");

  await Promise.all([
    document.fonts?.load('600 80px "Fraunces"'),
    document.fonts?.load('600 30px "Manrope"'),
  ]);
  const [photo, logo] = await Promise.all([
    loadBitmap(options.photoUrl),
    options.showLogo && options.logoUrl ? loadBitmap(options.logoUrl).catch(() => null) : Promise.resolve(null),
  ]);

  drawCover(ctx, photo, width, height);
  const shade = ctx.createLinearGradient(0, height * 0.42, 0, height);
  shade.addColorStop(0, "rgba(9,12,16,0)");
  shade.addColorStop(0.62, "rgba(9,12,16,.12)");
  shade.addColorStop(1, "rgba(9,12,16,.58)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  if (logo) {
    roundedRect(ctx, 48, 48, 164, 94, 18);
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.fill();
    drawContained(ctx, logo, 64, 62, 132, 66);
  }

  const transactionText = options.transaction === "rent" ? "DE ÎNCHIRIAT" : "DE VÂNZARE";
  ctx.font = '700 24px "Manrope", sans-serif';
  ctx.letterSpacing = "5px";
  const transactionWidth = ctx.measureText(transactionText).width + 54;
  roundedRect(ctx, width - 48 - transactionWidth, 58, transactionWidth, 62, 31);
  ctx.fillStyle = "rgba(10,13,18,.34)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.68)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(transactionText, width - 48 - transactionWidth + 27, 98);
  ctx.letterSpacing = "0px";

  const cardX = 48;
  const cardWidth = width - 96;
  const cardHeight = options.format === "story" ? 600 : 520;
  const cardY = height - 48 - cardHeight;
  roundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 28);
  ctx.fillStyle = "rgba(12,15,20,.91)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.stroke();

  const pad = 48;
  const left = cardX + pad;
  const right = cardX + cardWidth - pad;
  ctx.fillStyle = "#D4AF57";
  ctx.font = '700 23px "Manrope", sans-serif';
  ctx.letterSpacing = "5px";
  ctx.fillText("OFERTĂ EXCLUSIVĂ", left, cardY + 66);
  ctx.letterSpacing = "0px";

  const titleWidth = cardWidth - pad * 2;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${options.format === "story" ? 70 : 62}px "Fraunces", Georgia, serif`;
  const titleLines = fitLines(ctx, options.title, titleWidth, 2);
  const titleTop = cardY + 130;
  const titleLineHeight = options.format === "story" ? 78 : 70;
  titleLines.forEach((line, index) => ctx.fillText(line, left, titleTop + index * titleLineHeight));

  if (options.showPrice && options.price) {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.font = '700 19px "Manrope", sans-serif';
    ctx.letterSpacing = "4px";
    ctx.fillText("PREȚ", right, cardY + cardHeight - 104);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "#D4AF57";
    ctx.font = '600 55px "Fraunces", Georgia, serif';
    ctx.fillText(formatPosterPrice(options.price, options.currency), right, cardY + cardHeight - 48);
    ctx.textAlign = "left";
  }

  const detailsY = titleTop + titleLines.length * titleLineHeight + 36;
  drawLocationPin(ctx, left + 8, detailsY - 7);
  ctx.font = '500 27px "Manrope", sans-serif';
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(options.location || "Localizare indisponibilă", left + 38, detailsY);

  const tags = [
    options.rooms ? `${options.rooms} ${options.rooms === 1 ? "cameră" : "camere"}` : null,
    options.surface ? `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(options.surface)} mp` : null,
    options.floor ? `Etaj ${options.floor}` : null,
  ].filter((value): value is string => Boolean(value));
  let tagX = left;
  const tagY = detailsY + 50;
  tags.slice(0, 3).forEach((tag) => {
    tagX += drawTag(ctx, tag, tagX, tagY) + 14;
  });

  if (options.showPhone && options.phone) {
    ctx.fillStyle = "rgba(255,255,255,.76)";
    ctx.font = '600 25px "Manrope", sans-serif';
    ctx.fillText(`Telefon · ${options.phone}`, left, cardY + cardHeight - 50);
  }

  photo.close();
  logo?.close();
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