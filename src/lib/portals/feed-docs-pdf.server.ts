/** PDF A4 cu branding Habitoo: pagina „Date de acces – confidențial” + documentația feedului. */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CONTRACT_FONT_BOLD_B64, CONTRACT_FONT_REGULAR_B64 } from "@/lib/contracts/fonts";

const A4: [number, number] = [595.28, 841.89];
const M = 50;
const BRAND = rgb(0.11, 0.29, 0.24);
const MUTED = rgb(0.4, 0.4, 0.4);
const TEXT = rgb(0.1, 0.1, 0.1);

export type FeedDocPdfInput = {
  portalName: string;
  indexUrl: string;
  generatedAt: Date;
  markdown: string;
};

function clean(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\t/g, "  ")
    .replace(/→/g, "->").replace(/[≤]/g, "<=").replace(/[≥]/g, ">=").replace(/[“”„]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[^\u0009\u000a\u0020-\u024f\u2013\u2014\u2026]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) out.push(line);
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width) {
        let n = w.length;
        while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--;
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

export async function buildFeedDocPdf(input: FeedDocPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(Buffer.from(CONTRACT_FONT_REGULAR_B64, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(CONTRACT_FONT_BOLD_B64, "base64"), { subset: true });
  doc.setTitle(`Documentație feed Habitoo — ${input.portalName}`);
  doc.setAuthor("Habitoo CRM");
  doc.setCreator("Habitoo CRM");

  const W = A4[0] - M * 2;
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage(A4);
    page.drawRectangle({ x: 0, y: A4[1] - 36, width: A4[0], height: 36, color: BRAND });
    page.drawText("Habitoo CRM", { x: M, y: A4[1] - 24, size: 13, font: bold, color: rgb(1, 1, 1) });
    const right = `Feed ${input.portalName}`;
    page.drawText(right, { x: A4[0] - M - regular.widthOfTextAtSize(right, 9), y: A4[1] - 23, size: 9, font: regular, color: rgb(1, 1, 1) });
    y = A4[1] - 70;
  };
  const ensure = (h: number) => { if (y - h < M + 20) newPage(); };
  const write = (text: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 9.5;
    const indent = opts.indent ?? 0;
    for (const line of wrap(clean(text), font, size, W - indent)) {
      ensure(size * 1.4);
      page.drawText(line, { x: M + indent, y, size, font, color: opts.color ?? TEXT });
      y -= size * 1.4;
    }
    y -= opts.gap ?? 4;
  };

  // Pagina 1 — date de acces.
  newPage();
  write("Date de acces – confidențial", { font: bold, size: 20, color: BRAND, gap: 10 });
  write(`Portal: ${input.portalName}`, { font: bold, size: 11 });
  write("URL-ul complet al indexului agențiilor (conține cheia de acces; nu îl publicați și nu îl trimiteți mai departe):", { size: 10, gap: 6 });
  const boxLines = wrap(input.indexUrl, bold, 10, W - 20);
  const boxH = boxLines.length * 14 + 16;
  ensure(boxH);
  page.drawRectangle({ x: M, y: y - boxH + 12, width: W, height: boxH, borderColor: BRAND, borderWidth: 1, color: rgb(0.95, 0.97, 0.96) });
  for (const line of boxLines) { page.drawText(line, { x: M + 10, y: y - 4, size: 10, font: bold, color: TEXT }); y -= 14; }
  y -= 24;
  write(`Data generării: ${input.generatedAt.toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}`, { size: 10 });
  write("Contact tehnic: contact@habitoo.ro", { size: 10, gap: 14 });
  write("Indexul listează agențiile care au activat portalul. Fiecare agenție are un token propriu de feed, inclus în index; feedul unei agenții conține numai ofertele bifate pentru acest portal. Documentația completă urmează din pagina următoare.", { size: 9.5, color: MUTED });

  // Restul — documentația.
  newPage();
  let inCode = false;
  for (const raw of input.markdown.split("\n")) {
    if (raw.startsWith("```")) { inCode = !inCode; y -= 2; continue; }
    if (inCode) { write(raw || " ", { size: 7.5, color: rgb(0.2, 0.2, 0.3), indent: 10, gap: 0 }); continue; }
    const line = raw.trimEnd();
    if (!line.trim()) { y -= 3; continue; }
    if (line.startsWith("# ")) { write(line.slice(2), { font: bold, size: 16, color: BRAND, gap: 8 }); continue; }
    if (line.startsWith("## ")) { y -= 6; ensure(40); write(line.slice(3), { font: bold, size: 13, color: BRAND, gap: 5 }); continue; }
    if (line.startsWith("### ")) { y -= 3; ensure(30); write(line.slice(4), { font: bold, size: 11, gap: 3 }); continue; }
    if (line.startsWith("|")) {
      if (/^\|[\s|:-]+\|$/.test(line)) continue;
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      write(cells.join("  —  "), { size: 8.5, indent: 6, gap: 2 });
      continue;
    }
    const bullet = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (bullet) { write(`${/\d/.test(bullet[2]) ? bullet[2] : "–"} ${bullet[3]}`, { indent: 10 + bullet[1].length * 4, gap: 2 }); continue; }
    write(line);
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Habitoo CRM · contact@habitoo.ro · pagina ${i + 1} din ${pages.length}`;
    p.drawText(label, { x: M, y: 28, size: 8, font: regular, color: MUTED });
    if (i === 0) p.drawText("CONFIDENȚIAL", { x: A4[0] - M - bold.widthOfTextAtSize("CONFIDENȚIAL", 8), y: 28, size: 8, font: bold, color: BRAND });
  });
  return doc.save();
}
