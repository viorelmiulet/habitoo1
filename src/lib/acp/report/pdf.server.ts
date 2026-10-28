/**
 * Randarea PDF a raportului ACP (format 2.0). Rulează exclusiv pe server, cu
 * pdf-lib — pur JS, fără DOM sau binare native. Fonturile Unicode sunt
 * reutilizate din modulul de contracte, pentru diacritice românești corecte.
 *
 * Raportul doar afișează modelul (construit din snapshot-ul versiunii). Pozele
 * se încarcă prin `loadImage`; orice poză lipsă, lentă sau într-un format
 * neacceptat devine un fundal neutru și nu oprește generarea.
 */
import {
  PDFDocument,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CONTRACT_FONT_BOLD_B64, CONTRACT_FONT_REGULAR_B64 } from "@/lib/contracts/fonts";
import { reportDate, type AcpReportModel, type AcpReportSheet } from "./model";
import {
  fetchReportImage,
  imageKind,
  loadWithTimeout,
  normalizeReportImage,
  REPORT_IMAGE_TIMEOUT_MS,
  type ReportImageLoader,
} from "./images.server";

const W = 595.28;
const H = 841.89;
const M = 40;
const CW = W - M * 2;
const CONTENT_TOP = 78;
const CONTENT_BOTTOM = H - 52;

const NAVY = rgb(0.09, 0.14, 0.27);
const NAVY_SOFT = rgb(0.9, 0.92, 0.96);
const GOLD = rgb(0.79, 0.63, 0.15);
const GOLD_SOFT = rgb(0.98, 0.94, 0.82);
const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.52);
const SOFT = rgb(0.955, 0.958, 0.965);
const LINE = rgb(0.84, 0.86, 0.9);
const WHITE = rgb(1, 1, 1);
const PLACEHOLDER = rgb(0.9, 0.91, 0.93);

export type AcpReportPdfAssets = {
  /** Logo-ul agenției (JPEG/PNG), deja descărcat. */
  logo?: Uint8Array | null;
  /** Încărcătorul pozelor; implicit descărcare https cu limită de 5 s. */
  loadImage?: ReportImageLoader;
  imageTimeoutMs?: number;
};

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function roundedPath(w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M ${rr} 0 H ${w - rr} Q ${w} 0 ${w} ${rr} V ${h - rr} Q ${w} ${h} ${w - rr} ${h} H ${rr} Q 0 ${h} 0 ${h - rr} V ${rr} Q 0 0 ${rr} 0 Z`;
}

export async function buildAcpReportPdf(
  model: AcpReportModel,
  assets: AcpReportPdfAssets = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(model.cover.title);
  doc.setProducer("Habitoo CRM");

  let regular: PDFFont;
  let bold: PDFFont;
  try {
    regular = await doc.embedFont(Buffer.from(CONTRACT_FONT_REGULAR_B64, "base64"), { subset: true });
    bold = await doc.embedFont(Buffer.from(CONTRACT_FONT_BOLD_B64, "base64"), { subset: true });
  } catch {
    regular = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  }

  /* ---------------- Poze: încărcare paralelă, cache pe URL ---------------- */
  const loader = assets.loadImage ?? fetchReportImage;
  const timeout = assets.imageTimeoutMs ?? REPORT_IMAGE_TIMEOUT_MS;
  const urls = new Set<string>();
  const addUrl = (u: string | null | undefined) => {
    if (u) urls.add(u);
  };
  addUrl(model.cover.photo);
  model.subjectSheet.photos.forEach(addUrl);
  for (const c of model.used) {
    addUrl(c.photo);
    c.sheet.photos.forEach(addUrl);
  }
  const images = new Map<string, PDFImage | null>();
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      const bytes = await loadWithTimeout(loader, url, timeout);
      const normalized = bytes ? normalizeReportImage(bytes) : null;
      let image: PDFImage | null = null;
      if (normalized) {
        try {
          image = await doc.embedJpg(normalized.jpeg);
        } catch {
          image = null;
        }
      }
      images.set(url, image);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
  const img = (url: string | null | undefined) => (url ? (images.get(url) ?? null) : null);

  let logo: PDFImage | null = null;
  if (assets.logo) {
    try {
      const kind = imageKind(assets.logo);
      logo = kind === "png" ? await doc.embedPng(assets.logo) : kind === "jpeg" ? await doc.embedJpg(assets.logo) : null;
    } catch {
      logo = null;
    }
  }

  /* ---------------- Primitive (coordonate de sus în jos) ---------------- */
  let page: PDFPage = doc.addPage([W, H]);
  let top = CONTENT_TOP;

  const text = (
    p: PDFPage,
    value: string,
    x: number,
    t: number,
    size: number,
    opts: { font?: PDFFont; color?: RGB } = {},
  ) => {
    if (!value) return;
    p.drawText(value, { x, y: H - t - size, size, font: opts.font ?? regular, color: opts.color ?? INK });
  };
  const box = (
    p: PDFPage,
    x: number,
    t: number,
    w: number,
    h: number,
    opts: { fill?: RGB; border?: RGB; radius?: number; borderWidth?: number } = {},
  ) => {
    p.drawSvgPath(roundedPath(w, h, opts.radius ?? 8), {
      x,
      y: H - t,
      color: opts.fill,
      borderColor: opts.border,
      borderWidth: opts.border ? (opts.borderWidth ?? 0.8) : 0,
    });
  };
  const rect = (p: PDFPage, x: number, t: number, w: number, h: number, color: RGB, opacity = 1) => {
    p.drawRectangle({ x, y: H - t - h, width: w, height: h, color, opacity });
  };
  /** Poză „cover” decupată în cadru; fundal neutru dacă lipsește. */
  const photo = (p: PDFPage, url: string | null | undefined, x: number, t: number, w: number, h: number) => {
    const image = img(url);
    if (!image) {
      rect(p, x, t, w, h, PLACEHOLDER);
      const label = "Fără fotografie";
      const size = Math.min(10, Math.max(6.5, w / 14));
      const lw = regular.widthOfTextAtSize(label, size);
      text(p, label, x + (w - lw) / 2, t + h / 2 - size / 2, size, { color: MUTED });
      return;
    }
    const scale = Math.max(w / image.width, h / image.height);
    const iw = image.width * scale;
    const ih = image.height * scale;
    p.pushOperators(pushGraphicsState(), rectangle(x, H - t - h, w, h), clip(), endPath());
    p.drawImage(image, { x: x + (w - iw) / 2, y: H - t - h + (h - ih) / 2, width: iw, height: ih });
    p.pushOperators(popGraphicsState());
  };
  const newPage = () => {
    page = doc.addPage([W, H]);
    top = CONTENT_TOP;
  };
  const ensure = (needed: number) => {
    if (top + needed > CONTENT_BOTTOM) newPage();
  };
  /** Titlu pe două culori, cu liniuță aurie dedesubt. */
  const sectionTitle = (parts: [string, boolean][], size = 19) => {
    ensure(70);
    let x = M;
    for (const [value, accent] of parts) {
      const font = bold;
      text(page, value, x, top, size, { font, color: accent ? GOLD : NAVY });
      x += font.widthOfTextAtSize(value, size);
    }
    top += size + 8;
    rect(page, M, top, 38, 2.6, GOLD);
    top += 18;
  };
  const subTitle = (value: string, size = 11.5) => {
    ensure(40);
    text(page, value, M, top, size, { font: bold, color: NAVY });
    top += size + 8;
  };
  const paragraph = (value: string, opts: { size?: number; color?: RGB; x?: number; width?: number; font?: PDFFont } = {}) => {
    const size = opts.size ?? 9;
    const font = opts.font ?? regular;
    for (const line of wrap(value, font, size, opts.width ?? CW)) {
      ensure(size * 1.5);
      text(page, line, opts.x ?? M, top, size, { font, color: opts.color ?? INK });
      top += size * 1.5;
    }
  };
  /** Casetă gri cu text, împărțită pe pagini dacă e nevoie. */
  const textBox = (title: string | null, body: string | null, items: string[] = [], size = 9) => {
    const pad = 12;
    const inner = CW - pad * 2;
    const lines: { value: string; font: PDFFont; color: RGB; size: number }[] = [];
    if (title) lines.push({ value: title, font: bold, color: NAVY, size: size + 1 });
    if (body) for (const l of wrap(body, regular, size, inner)) lines.push({ value: l, font: regular, color: INK, size });
    for (const item of items)
      wrap(`•  ${item}`, regular, size, inner - 8).forEach((l, i) =>
        lines.push({ value: i === 0 ? l : `    ${l}`, font: regular, color: INK, size }),
      );
    let i = 0;
    while (i < lines.length) {
      ensure(pad * 2 + 30);
      const available = CONTENT_BOTTOM - top - pad * 2;
      const slice: typeof lines = [];
      let h = 0;
      while (i < lines.length && h + lines[i]!.size * 1.5 <= available) {
        slice.push(lines[i]!);
        h += lines[i]!.size * 1.5;
        i++;
      }
      if (slice.length === 0) {
        newPage();
        continue;
      }
      box(page, M, top, CW, h + pad * 2 - 3, { fill: SOFT, radius: 8 });
      let t = top + pad;
      for (const l of slice) {
        text(page, l.value, M + pad, t, l.size, { font: l.font, color: l.color });
        t += l.size * 1.5;
      }
      top += h + pad * 2 + 6;
      if (i < lines.length) newPage();
    }
  };
  const badge = (p: PDFPage, label: string, x: number, t: number, active: boolean, size = 7) => {
    const w = bold.widthOfTextAtSize(label, size) + 12;
    box(p, x, t, w, size + 7, { fill: active ? NAVY : PLACEHOLDER, radius: (size + 7) / 2 });
    text(p, label, x + 6, t + 3.5, size, { font: bold, color: active ? WHITE : MUTED });
    return w;
  };

  /* ================= 1. Copertă ================= */
  {
    const p = page;
    let t = 46;
    const chip = `Data raportului: ${model.cover.dateLabel}`;
    const chipW = regular.widthOfTextAtSize(chip, 8.5) + 20;
    box(p, M, t, chipW, 20, { fill: GOLD_SOFT, radius: 10 });
    text(p, chip, M + 10, t + 6, 8.5, { color: NAVY });
    t += 38;
    text(p, "Raport analiză de piață", M, t, 28, { font: bold, color: NAVY });
    t += 34;
    text(p, "comparativă", M, t, 28, { font: bold, color: GOLD });
    t += 38;
    rect(p, M, t, 46, 3, GOLD);
    t += 18;
    const photoH = 300;
    photo(p, model.cover.photo, M, t, CW, photoH);
    t += photoH;
    const titleLines = wrap(model.cover.propertyTitle, bold, 14, CW - 32).slice(0, 2);
    const bandH = 22 + titleLines.length * 18 + (model.cover.address ? 16 : 0);
    rect(p, M, t, CW, bandH, NAVY);
    let bt = t + 14;
    for (const l of titleLines) {
      text(p, l, M + 16, bt, 14, { font: bold, color: WHITE });
      bt += 18;
    }
    if (model.cover.address) text(p, fit(model.cover.address, regular, 10, CW - 32), M + 16, bt, 10, { color: GOLD_SOFT });
    rect(p, M, t + bandH, CW, 3, GOLD);
    t += bandH + 20;
    const disclaimerLines = wrap(model.cover.disclaimer, regular, 8.5, CW - 28);
    const dh = disclaimerLines.length * 12.5 + 22;
    box(p, M, t, CW, dh, { fill: SOFT, radius: 8 });
    let dt = t + 11;
    for (const l of disclaimerLines) {
      text(p, l, M + 14, dt, 8.5, { color: MUTED });
      dt += 12.5;
    }
    // Subsolul copertei: logo + agentul care a generat raportul.
    const baseTop = H - 96;
    rect(p, M, baseTop - 12, CW, 0.8, LINE);
    let x = M;
    if (logo) {
      const scale = Math.min(140 / logo.width, 48 / logo.height);
      p.drawImage(logo, { x, y: H - baseTop - 48 + (48 - logo.height * scale) / 2, width: logo.width * scale, height: logo.height * scale });
      x += logo.width * scale + 18;
    }
    const agent = model.cover.agentName ?? model.cover.agencyName;
    text(p, agent, x, baseTop + 6, 12, { font: bold, color: NAVY });
    const roleLine = [model.cover.agentName ? model.cover.agentRole : null, model.cover.agencyName].filter(Boolean).join(" · ");
    text(p, fit(roleLine, regular, 9.5, W - M - x), x, baseTop + 24, 9.5, { color: MUTED });
  }

  /* ================= 2. Tabel comparație ================= */
  const LABEL_W = 104;
  const COL_W = (CW - LABEL_W) / 5;
  model.comparisonPages.forEach((cp, pageIndex) => {
    newPage();
    sectionTitle(pageIndex === 0 ? [["Tabel ", false], ["comparație", true]] : [["Tabel ", false], ["comparație", true], [" (continuare)", false]]);
    // Antetul coloanelor: eticheta + poză mică.
    cp.headers.forEach((h, i) => {
      const x = M + LABEL_W + i * COL_W + 3;
      const w = COL_W - 6;
      box(page, x, top, w, 92, { fill: i === 0 ? NAVY : WHITE, border: i === 0 ? undefined : LINE, radius: 8 });
      const lw = bold.widthOfTextAtSize(h.label, 7.6);
      text(page, fit(h.label, bold, 7.6, w - 8), x + Math.max(4, (w - lw) / 2), top + 8, 7.6, { font: bold, color: i === 0 ? WHITE : NAVY });
      photo(page, h.photo, x + 5, top + 24, w - 10, 62);
    });
    top += 100;
    const drawRow = (label: string, cells: { value: string; adjustment: string | null }[], zebra: boolean) => {
      const lineSets = cells.map((c) => wrap(c.value || "—", regular, 7.6, COL_W - 10).slice(0, 3));
      const hasAdj = cells.some((c) => c.adjustment !== null);
      const rowH = Math.max(20, Math.max(...lineSets.map((l) => l.length)) * 10 + 8 + (hasAdj ? 10 : 0));
      if (zebra) box(page, M, top, CW, rowH, { fill: SOFT, radius: 5 });
      text(page, fit(label, bold, 8, LABEL_W - 10), M + 8, top + 6, 8, { font: bold, color: NAVY });
      cells.forEach((c, i) => {
        const cx = M + LABEL_W + i * COL_W;
        lineSets[i]!.forEach((l, li) => {
          const lw = regular.widthOfTextAtSize(l, 7.6);
          text(page, l, cx + (COL_W - lw) / 2, top + 6 + li * 10, 7.6, { color: INK });
        });
        if (c.adjustment !== null) {
          const lw = bold.widthOfTextAtSize(c.adjustment, 7);
          text(page, c.adjustment, cx + (COL_W - lw) / 2, top + 6 + lineSets[i]!.length * 10, 7, { font: bold, color: GOLD });
        }
      });
      top += rowH;
    };
    cp.top.forEach((row, i) => drawRow(row.label, row.cells, i % 2 === 0));
    top += 4;
    box(page, M, top, CW, 20, { fill: NAVY, radius: 6 });
    text(page, "Ajustări +/-", M + 8, top + 6, 8.5, { font: bold, color: WHITE });
    top += 24;
    cp.features.forEach((row, i) => drawRow(row.label, row.cells, i % 2 === 0));
    top += 4;
    box(page, M, top, CW, 26, { fill: NAVY, radius: 6 });
    text(page, "Preț ajustat", M + 8, top + 9, 9, { font: bold, color: WHITE });
    text(page, "—", M + LABEL_W + (COL_W - regular.widthOfTextAtSize("—", 9)) / 2, top + 9, 9, { color: WHITE });
    cp.adjusted.forEach((value, i) => {
      const cx = M + LABEL_W + (i + 1) * COL_W;
      const lw = bold.widthOfTextAtSize(value, 8.6);
      text(page, value, cx + (COL_W - lw) / 2, top + 9, 8.6, { font: bold, color: GOLD_SOFT });
    });
    top += 34;
    paragraph("Fiecare valoare este urmată de ajustarea aplicată comparabilei pe acel criteriu (0 dacă nu s-a aplicat).", { size: 7.5, color: MUTED });
  });

  /* ================= 3. Analiza comparativă ================= */
  newPage();
  sectionTitle([["Analiza ", false], ["comparativă", true]]);
  // Loc rezervat pentru caseta „analiza cererii” (pasul 3).
  const active = model.used.filter((c) => c.active);
  const inactive = model.used.filter((c) => !c.active);
  const table = (
    title: string,
    columns: { label: string; w: number; value: (c: (typeof model.used)[number]) => string; badge?: boolean; bold?: boolean }[],
    rows: typeof model.used,
  ) => {
    subTitle(`${title} (${rows.length})`);
    const header = () => {
      box(page, M, top, CW, 22, { fill: NAVY_SOFT, radius: 6 });
      let x = M;
      for (const col of columns) {
        text(page, fit(col.label, bold, 7.6, col.w - 8), x + 6, top + 7, 7.6, { font: bold, color: NAVY });
        x += col.w;
      }
      top += 24;
    };
    header();
    rows.forEach((row, ri) => {
      const sets = columns.map((col) => (col.badge ? [col.value(row)] : wrap(col.value(row), col.bold ? bold : regular, 7.6, col.w - 10).slice(0, 3)));
      const h = Math.max(22, Math.max(...sets.map((s) => s.length)) * 10 + 10);
      if (top + h > CONTENT_BOTTOM) {
        newPage();
        header();
      }
      if (ri % 2 === 1) box(page, M, top, CW, h, { fill: SOFT, radius: 5 });
      let x = M;
      columns.forEach((col, ci) => {
        if (col.badge) badge(page, sets[ci]![0]!, x + 6, top + 6, row.active);
        else
          sets[ci]!.forEach((l, li) =>
            text(page, l, x + 6, top + 6 + li * 10, 7.6, { font: col.bold ? bold : regular, color: col.bold ? NAVY : INK }),
          );
        x += col.w;
      });
      top += h;
    });
    top += 14;
  };
  if (model.used.length === 0) paragraph("Nu există comparabile folosite în calcul.", { color: MUTED });
  if (active.length > 0)
    table(
      "Active",
      [
        { label: "ID / referință", w: 72, value: (c) => `#${c.index} · ${c.reference}` },
        { label: "Adresă", w: 128, value: (c) => c.address },
        { label: "Status", w: 54, value: (c) => c.statusLabel, badge: true },
        { label: "Zile în piață", w: 72, value: (c) => (c.firstSeen === "—" ? c.daysOnMarket : `${c.daysOnMarket}\ndin ${c.firstSeen}`) },
        { label: "Preț", w: 62, value: (c) => c.price },
        { label: "Ajustări", w: 62, value: (c) => c.adjustmentTotal },
        { label: "Preț ajustat", w: CW - 450, value: (c) => c.adjustedPrice, bold: true },
      ],
      active,
    );
  if (inactive.length > 0)
    table(
      "Inactive (ieșite din piață)",
      [
        { label: "ID / referință", w: 66, value: (c) => `#${c.index} · ${c.reference}` },
        { label: "Adresă", w: 106, value: (c) => c.address },
        { label: "Status", w: 58, value: (c) => c.statusLabel, badge: true },
        { label: "Zile în piață", w: 58, value: (c) => c.daysOnMarket },
        { label: "Dispărută la", w: 58, value: (c) => c.disappeared },
        { label: "Preț", w: 58, value: (c) => c.price },
        { label: "Ajustări", w: 54, value: (c) => c.adjustmentTotal },
        { label: "Preț ajustat", w: CW - 458, value: (c) => c.adjustedPrice, bold: true },
      ],
      inactive,
    );

  /* ================= 4. Analiza preț ================= */
  if (model.priceChart) {
    newPage();
    sectionTitle([["Analiza ", false], ["prețului", true]]);
    const chart = model.priceChart;
    const boxH = 330;
    box(page, M, top, CW, boxH, { border: LINE, radius: 10 });
    const values = [
      ...chart.bars.map((b) => b.value),
      ...(chart.recommended ? [chart.recommended.value] : []),
      ...(chart.band ? [chart.band.min, chart.band.max] : []),
    ];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = Math.max(hi - lo, hi * 0.05, 1);
    const base = Math.max(0, lo - span * 0.6);
    const ceil = hi + span * 0.25;
    const plotTop = top + 40;
    const plotH = boxH - 90;
    const plotX = M + 30;
    const plotW = CW - 170;
    const yOf = (v: number) => plotTop + plotH - ((v - base) / (ceil - base)) * plotH;
    if (chart.band) {
      const t1 = yOf(chart.band.max);
      const t2 = yOf(chart.band.min);
      rect(page, plotX, t1, plotW, Math.max(1, t2 - t1), GOLD, 0.16);
    }
    rect(page, plotX, plotTop + plotH, plotW, 0.8, LINE);
    const barW = plotW / chart.bars.length;
    chart.bars.forEach((b, i) => {
      const t = yOf(b.value);
      const x = plotX + i * barW + barW * 0.22;
      const w = barW * 0.56;
      box(page, x, t, w, plotTop + plotH - t, { fill: i === 2 ? NAVY : rgb(0.29, 0.36, 0.52), radius: 4 });
      const vw = bold.widthOfTextAtSize(b.display, 8);
      text(page, b.display, x + (w - vw) / 2, t - 13, 8, { font: bold, color: NAVY });
      const lw = regular.widthOfTextAtSize(b.label, 8.5);
      text(page, b.label, x + (w - lw) / 2, plotTop + plotH + 8, 8.5, { color: MUTED });
    });
    if (chart.recommended) {
      const t = yOf(chart.recommended.value);
      page.drawLine({
        start: { x: plotX - 6, y: H - t },
        end: { x: plotX + plotW + 6, y: H - t },
        thickness: 1.4,
        color: GOLD,
        dashArray: [5, 3],
      });
      text(page, "Preț recomandat", plotX + plotW + 12, t - 10, 8, { font: bold, color: GOLD });
      text(page, chart.recommended.display, plotX + plotW + 12, t + 1, 8.5, { font: bold, color: NAVY });
    }
    // Legendă.
    const lt = top + boxH - 28;
    rect(page, M + 30, lt + 2, 14, 8, GOLD, 0.3);
    text(page, chart.band ? `Interval valoare estimată: ${chart.band.display}` : "Interval estimat indisponibil", M + 50, lt + 1, 8, { color: MUTED });
    top += boxH + 16;
    paragraph(
      `Barele arată prețurile ajustate ale celor ${model.used.length} comparabile folosite în calcul. Linia punctată marchează prețul recomandat de listare, iar banda aurie intervalul dintre valoarea minimă și cea maximă estimată.`,
      { size: 8.5, color: MUTED },
    );
  }

  /* ================= 5. Valoarea estimată ================= */
  newPage();
  sectionTitle([["Valoarea ", false], ["estimată", true], [" de piață", false]]);
  {
    const gap = 12;
    const cw = (CW - gap * 2) / 3;
    model.valuation.cards.forEach((card, i) => {
      const x = M + i * (cw + gap);
      const h = card.highlight ? 120 : 108;
      const t = card.highlight ? top : top + 6;
      box(page, x, t, cw, h, card.highlight ? { fill: NAVY, radius: 12 } : { fill: WHITE, border: LINE, radius: 12 });
      if (card.highlight) rect(page, x + cw / 2 - 18, t + 12, 36, 2.6, GOLD);
      const lw = bold.widthOfTextAtSize(card.label, 9.5);
      text(page, card.label, x + (cw - lw) / 2, t + 28, 9.5, { font: bold, color: card.highlight ? GOLD_SOFT : MUTED });
      const size = card.highlight ? 21 : 18;
      const value = fit(card.value, bold, size, cw - 16);
      const vw = bold.widthOfTextAtSize(value, size);
      text(page, value, x + (cw - vw) / 2, t + h / 2 + 6, size, { font: bold, color: card.highlight ? WHITE : NAVY });
    });
    top += 134;
    if (model.valuation.listingNote) {
      const lw = regular.widthOfTextAtSize(model.valuation.listingNote, 9);
      text(page, model.valuation.listingNote, M + (CW - lw) / 2, top, 9, { color: MUTED });
      top += 26;
    }
  }
  if (model.recommendations) {
    top += 10;
    sectionTitle([["Recomandări ", false], ["suplimentare", true]], 16);
    for (const group of model.recommendations.groups) textBox(group.title, group.body ?? null, group.items ?? []);
    paragraph(model.recommendations.note, { size: 7.5, color: MUTED });
  }

  /* ================= 6. Proprietăți comparabile ================= */
  const sheet = (s: AcpReportSheet, first: boolean, adjustmentsTitle: string) => {
    newPage();
    if (first) sectionTitle([["Proprietăți ", false], ["comparabile", true]]);
    const chipW = bold.widthOfTextAtSize(s.label, 8) + 18;
    box(page, M, top, chipW, 18, { fill: GOLD_SOFT, radius: 9 });
    text(page, s.label, M + 9, top + 5, 8, { font: bold, color: NAVY });
    top += 26;
    text(page, fit(s.title, bold, 16, CW), M, top, 16, { font: bold, color: NAVY });
    top += 22;
    if (s.reference) {
      text(page, `Referință: ${s.reference}`, M, top, 8.5, { color: MUTED });
      top += 16;
    }
    const gap = 6;
    const pw = (CW - gap * 2) / 3;
    for (let i = 0; i < 3; i++) photo(page, s.photos[i] ?? null, M + i * (pw + gap), top, pw, 120);
    top += 132;
    let x = M;
    if (s.statusLabel) x += badge(page, s.statusLabel, M, top + 3, s.active, 8) + 12;
    text(page, s.price, x, top, 15, { font: bold, color: NAVY });
    top += 28;
    // Caracteristici în două coloane; dreapta rămâne liberă pentru harta mică (pasul 2).
    const featW = CW * 0.64;
    subTitle("Caracteristici proprietate", 10.5);
    const rowsN = Math.ceil(s.characteristics.length / 2);
    const fh = rowsN * 17 + 14;
    ensure(fh);
    box(page, M, top, featW, fh, { fill: SOFT, radius: 8 });
    s.characteristics.forEach((c, i) => {
      const col = i < rowsN ? 0 : 1;
      const row = col === 0 ? i : i - rowsN;
      const cx = M + 10 + col * (featW / 2);
      const t = top + 8 + row * 17;
      text(page, fit(c.label, regular, 8, 70), cx, t, 8, { color: MUTED });
      text(page, fit(c.value, bold, 8.2, featW / 2 - 92), cx + 76, t, 8.2, { font: bold, color: INK });
    });
    top += fh + 12;
    if (s.description) textBox("Descriere", s.description, [], 8.5);
    if (s.adjustments.length > 0) {
      top += 4;
      subTitle(adjustmentsTitle, 10.5);
      const header = () => {
        box(page, M, top, CW, 20, { fill: NAVY_SOFT, radius: 6 });
        text(page, "Ajustare", M + 8, top + 6, 7.8, { font: bold, color: NAVY });
        text(page, "Bază de calcul", M + 130, top + 6, 7.8, { font: bold, color: NAVY });
        text(page, "Sumă", M + CW - 80, top + 6, 7.8, { font: bold, color: NAVY });
        top += 22;
      };
      header();
      s.adjustments.forEach((a, i) => {
        const lines = wrap(a.basis || "—", regular, 7.6, CW - 230).slice(0, 3);
        const h = Math.max(18, lines.length * 10 + 8);
        if (top + h > CONTENT_BOTTOM - 30) {
          newPage();
          header();
        }
        if (i % 2 === 1) box(page, M, top, CW, h, { fill: SOFT, radius: 4 });
        text(page, fit(a.label, bold, 7.8, 118), M + 8, top + 5, 7.8, { font: bold, color: INK });
        lines.forEach((l, li) => text(page, l, M + 130, top + 5 + li * 10, 7.6, { color: MUTED }));
        text(page, a.amount, M + CW - 80, top + 5, 7.8, { font: bold, color: INK });
        top += h;
      });
      if (s.finalAdjustedPrice) {
        top += 4;
        box(page, M, top, CW, 24, { fill: NAVY, radius: 6 });
        text(page, "Preț final ajustat", M + 8, top + 8, 9, { font: bold, color: WHITE });
        text(page, s.finalAdjustedPrice, M + CW - 80, top + 8, 9, { font: bold, color: GOLD_SOFT });
        top += 30;
      }
    }
  };
  sheet(model.subjectSheet, true, "Ajustări");
  for (const c of model.used) sheet(c.sheet, false, `Ajustări pentru comparabila #${c.index}`);

  /* ================= 7. Anexă tehnică (opțională) ================= */
  if (model.includeAppendix) {
    newPage();
    sectionTitle([["Anexă ", false], ["tehnică", true]]);
    const kv = (rows: { label: string; value: string }[]) => {
      for (const row of rows) {
        const lines = wrap(row.value, bold, 8.3, CW - 250);
        ensure(lines.length * 12 + 2);
        text(page, fit(row.label, regular, 8.3, 236), M, top, 8.3, { color: MUTED });
        lines.forEach((l, i) => text(page, l, M + 250, top + i * 12, 8.3, { font: bold, color: INK }));
        top += lines.length * 12 + 2;
      }
      top += 8;
    };
    subTitle("Metodologia analizei");
    for (const line of model.methodology) paragraph(`•  ${line}`, { size: 8.3 });
    top += 6;
    subTitle("Indicatori statistici");
    kv([
      ...model.statistics,
      { label: "Scor de încredere", value: model.confidenceLabel },
      { label: "Comparabile găsite / folosite / excluse", value: `${model.counts.found} / ${model.counts.used} / ${model.counts.excluded}` },
      { label: "Versiunea analizei", value: `v${model.analysisVersion} · date piață la ${reportDate(model.snapshotAt)}` },
    ]);
    if (model.timeAdjustment) {
      subTitle("Ajustarea în timp a comparabilelor");
      paragraph(model.timeAdjustment.note, { size: 8, color: MUTED });
      top += 4;
      kv(model.timeAdjustment.rows);
      for (const c of model.comparables.filter((x) => x.used && x.timeAdjustment)) {
        const t = c.timeAdjustment!;
        paragraph(
          `${c.title}: ${t.applied ? `${t.originalPrice} (${t.comparableQuarter}) × ${t.ratio} → ${t.adjustedPrice} (${t.usedQuarter})` : `${t.originalPrice} — fără ajustare`}. ${t.reason}`,
          { size: 7.8 },
        );
      }
      top += 6;
    }
    subTitle("Surse de date folosite");
    if (model.sources.length === 0) paragraph("Nu au fost înregistrate surse pentru această versiune.", { size: 8.3, color: MUTED });
    for (const src of model.sources) {
      paragraph(
        `•  ${src.name}${src.outcomeLabel ? ` — ${src.outcomeLabel}` : ""} — găsite ${src.found}, folosite ${src.used}, excluse ${src.excluded}`,
        { size: 8.3 },
      );
      if (src.outcomeDetail) paragraph(src.outcomeDetail, { size: 7.8, color: MUTED, x: M + 12, width: CW - 12 });
    }
    top += 6;
    if (model.market) {
      subTitle("Piața la momentul analizei");
      paragraph(
        `Cifre din snapshot-ul de piață al versiunii${model.market.capturedAt ? `, capturat la ${reportDate(model.market.capturedAt)}` : ""}. Nu reflectă evoluțiile ulterioare ale pieței.`,
        { size: 7.8, color: MUTED },
      );
      top += 4;
      kv(model.market.rows);
      if (model.market.note) paragraph(model.market.note, { size: 7.8, color: MUTED });
    }
    if (model.precision) {
      subTitle("Calibrare și calitatea datelor");
      kv(model.precision.rows);
      for (const note of model.precision.notes) paragraph(`•  ${note}`, { size: 7.8, color: MUTED });
      top += 6;
    }
    if (model.warnings.length > 0) {
      subTitle("Limitări și observații privind datele");
      for (const w of model.warnings) paragraph(`•  ${w}`, { size: 8.3 });
    }
  }

  /* ================= Precizări (mereu pe ultima pagină) ================= */
  top += 12;
  const legalLines = wrap(model.legalNotice, regular, 8.3, CW - 28);
  ensure(legalLines.length * 12 + 50);
  text(page, "Precizări", M, top, 11, { font: bold, color: NAVY });
  top += 18;
  textBox(null, model.legalNotice, [], 8.3);

  /* ================= Antet și subsol ================= */
  const pages = doc.getPages();
  const phone = model.agency.phone ?? "";
  pages.forEach((p, i) => {
    const label = `pagina ${i + 1} / ${pages.length}`;
    const lw = regular.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: W - M - lw, y: 26, size: 8, font: regular, color: MUTED });
    if (i === 0) return;
    const name = fit(model.agency.name, bold, 9.5, CW / 2);
    const nw = bold.widthOfTextAtSize(name, 9.5);
    p.drawText(name, { x: W - M - nw, y: H - 34, size: 9.5, font: bold, color: NAVY });
    if (phone) {
      const pw = regular.widthOfTextAtSize(phone, 8.5);
      p.drawText(phone, { x: W - M - pw, y: H - 47, size: 8.5, font: regular, color: MUTED });
    }
    p.drawText("Raport analiză de piață comparativă", { x: M, y: H - 40, size: 8, font: regular, color: MUTED });
    p.drawRectangle({ x: M, y: H - 58, width: CW, height: 0.8, color: LINE });
    p.drawRectangle({ x: M, y: H - 58.8, width: 38, height: 2.4, color: GOLD });
    p.drawText(`Raport ACP v${model.formatVersion} · nr. ${model.reportNumber} · versiunea analizei ${model.analysisVersion}`, {
      x: M,
      y: 26,
      size: 7,
      font: regular,
      color: MUTED,
    });
  });

  return await doc.save();
}
