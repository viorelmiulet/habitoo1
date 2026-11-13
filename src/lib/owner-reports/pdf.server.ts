/** PDF A4 al raportului de proprietar: pdf-lib + fonturile Unicode ale contractelor, brandul agenției. */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CONTRACT_FONT_BOLD_B64, CONTRACT_FONT_REGULAR_B64 } from "@/lib/contracts/fonts";
import { formatDateRo, reportLines, type OwnerReportData, type OwnerReportNarrative } from "./report";

const A4: [number, number] = [595.28, 841.89];
const M = 56;
const NAVY = rgb(0.09, 0.14, 0.27);
const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.52);

function hexColor(hex: string | null) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return rgb(0.72, 0.56, 0.24);
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const w of para.split(/\s+/)) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > max && line) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildOwnerReportPdf(d: OwnerReportData, n: OwnerReportNarrative, logo: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Raport săptămânal — ${d.property.title}`);
  doc.setProducer("Habitoo CRM");
  let regular: PDFFont, bold: PDFFont;
  try {
    regular = await doc.embedFont(Buffer.from(CONTRACT_FONT_REGULAR_B64, "base64"), { subset: true });
    bold = await doc.embedFont(Buffer.from(CONTRACT_FONT_BOLD_B64, "base64"), { subset: true });
  } catch {
    regular = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  }
  let img: PDFImage | null = null;
  if (logo) {
    try { img = logo[0] === 0x89 ? await doc.embedPng(logo) : await doc.embedJpg(logo); } catch { img = null; }
  }
  const accent = hexColor(d.agency.accent);
  let page = doc.addPage(A4);
  const [W, H] = A4;
  const width = W - 2 * M;
  let y = H - M;
  const ensure = (h: number) => { if (y - h < M + 30) { page = doc.addPage(A4); y = H - M; } };
  const text = (t: string, size: number, font = regular, color = INK, gap = 4) => {
    for (const line of wrap(t, font, size, width)) { ensure(size + gap); page.drawText(line, { x: M, y: y - size, size, font, color }); y -= size + gap; }
  };

  // Antet
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: accent });
  if (img) {
    const s = Math.min(140 / img.width, 44 / img.height);
    page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s });
  } else page.drawText(d.agency.name, { x: M, y: y - 16, size: 16, font: bold, color: NAVY });
  y -= 60;
  text("Raport săptămânal pentru proprietar", 20, bold, NAVY, 6);
  text(`${d.property.title}${d.property.reference ? ` · ${d.property.reference}` : ""}`, 12, regular, MUTED);
  text(`Săptămâna ${formatDateRo(d.week.start)} – ${formatDateRo(d.week.end)}`, 12, regular, MUTED, 14);
  text(n.intro, 11, regular, INK, 12);

  // Cifre
  for (const l of reportLines(d)) {
    ensure(40);
    page.drawRectangle({ x: M, y: y - 2, width: 3, height: -14, color: accent });
    text(l.label, 10, bold, NAVY, 2);
    text(l.value, 11, regular, INK, 10);
  }
  y -= 6;
  text("Concluzie", 13, bold, NAVY, 4);
  text(n.conclusion, 11, regular, INK, 10);
  text("Recomandare", 13, bold, NAVY, 4);
  text(n.recommendation, 11, regular, INK, 18);

  // Agent
  text(d.agent.name, 11, bold, NAVY, 2);
  text([d.agent.phone, d.agent.email].filter(Boolean).join(" · "), 10, regular, MUTED, 2);
  text(d.agency.name, 10, regular, MUTED, 2);
  return await doc.save();
}
