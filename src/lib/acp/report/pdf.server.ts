/**
 * Randarea PDF a raportului ACP. Rulează exclusiv pe server, cu pdf-lib —
 * bibliotecă pură JS deja folosită pentru contracte, compatibilă cu runtime-ul
 * nostru (fără DOM, fără binare native). Fonturile Unicode sunt reutilizate din
 * modulul de contracte, pentru diacritice românești corecte.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CONTRACT_FONT_BOLD_B64, CONTRACT_FONT_REGULAR_B64 } from "@/lib/contracts/fonts";
import { reportDate, type AcpReportModel } from "./model";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const NAVY = rgb(0.09, 0.14, 0.27);
const GOLD = rgb(0.79, 0.63, 0.15);
const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.52);
const SOFT = rgb(0.96, 0.96, 0.97);

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

export async function buildAcpReportPdf(model: AcpReportModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  let regular: PDFFont;
  let bold: PDFFont;
  try {
    regular = await doc.embedFont(Buffer.from(CONTRACT_FONT_REGULAR_B64, "base64"), {
      subset: true,
    });
    bold = await doc.embedFont(Buffer.from(CONTRACT_FONT_BOLD_B64, "base64"), { subset: true });
  } catch {
    regular = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  }

  const width = A4[0];
  const contentWidth = width - MARGIN * 2;
  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 28) newPage();
  };
  const text = (
    value: string,
    opts: { size?: number; font?: PDFFont; color?: typeof INK; gap?: number; x?: number; width?: number } = {},
  ) => {
    const size = opts.size ?? 9.5;
    const font = opts.font ?? regular;
    const maxWidth = opts.width ?? contentWidth;
    for (const line of wrap(value, font, size, maxWidth)) {
      ensure(size + 4);
      if (line) {
        page.drawText(line, { x: opts.x ?? MARGIN, y: y - size, size, font, color: opts.color ?? INK });
      }
      y -= size * 1.45;
    }
    y -= opts.gap ?? 0;
  };
  /** Un titlu de secțiune nu rămâne niciodată singur la baza paginii. */
  const heading = (label: string) => {
    ensure(76);
    y -= 10;
    page.drawText(label.toUpperCase(), { x: MARGIN, y: y - 11, size: 10.5, font: bold, color: NAVY });
    y -= 16;
    page.drawRectangle({ x: MARGIN, y, width: contentWidth, height: 1.2, color: GOLD });
    y -= 12;
  };

  /* ---------------- Antet ---------------- */
  page.drawText("HABITOO", { x: MARGIN, y: y - 16, size: 17, font: bold, color: NAVY });
  page.drawText("CRM imobiliar", { x: MARGIN + 88, y: y - 15, size: 8.5, font: regular, color: GOLD });
  const agencyLines = [
    model.agency.legalName || model.agency.name,
    [model.agency.cui ? `CUI ${model.agency.cui}` : null, model.agency.registry]
      .filter(Boolean)
      .join(" · "),
    model.agency.address ?? "",
    [model.agency.phone, model.agency.email, model.agency.website].filter(Boolean).join(" · "),
  ].filter((l) => l && l.trim() !== "");
  let ay = y - 2;
  for (const line of agencyLines) {
    const w = regular.widthOfTextAtSize(line, 8);
    page.drawText(line, { x: width - MARGIN - w, y: ay - 8, size: 8, font: regular, color: MUTED });
    ay -= 11;
  }
  y = Math.min(y - 26, ay) - 8;
  page.drawRectangle({ x: MARGIN, y, width: contentWidth, height: 2, color: GOLD });
  y -= 26;

  text(model.title.toUpperCase(), { size: 16, font: bold, color: NAVY, gap: 2 });
  text(model.analysisTitle, { size: 10, color: MUTED, gap: 8 });

  /* ---------------- Fișa raportului ---------------- */
  const metaRows: [string, string][] = [
    ["Versiunea ACP", `Versiunea ${model.analysisVersion}`],
    ["Data raportului", reportDate(model.generatedAt)],
    ["Date piață la data de", reportDate(model.snapshotAt)],
    ["Status analiză", model.statusLabel],
    ["Scor de încredere", model.confidenceLabel],
    ["Autor analiză", model.authorName ?? "—"],
  ];
  ensure(metaRows.length * 13 + 16);
  const boxHeight = metaRows.length * 13 + 14;
  page.drawRectangle({ x: MARGIN, y: y - boxHeight, width: contentWidth, height: boxHeight, color: SOFT });
  let my = y - 12;
  for (const [label, value] of metaRows) {
    page.drawText(label, { x: MARGIN + 10, y: my - 8, size: 8.5, font: regular, color: MUTED });
    page.drawText(value, { x: MARGIN + 170, y: my - 8, size: 8.5, font: bold, color: INK });
    my -= 13;
  }
  y -= boxHeight + 6;

  /* ---------------- Proprietatea analizată ---------------- */
  heading("Proprietatea analizată");
  text(model.property.title, { size: 11, font: bold, color: NAVY });
  const propertyMeta = [model.property.reference, model.property.locationLabel]
    .filter(Boolean)
    .join(" · ");
  if (propertyMeta) text(propertyMeta, { size: 9, color: MUTED, gap: 4 });
  const half = contentWidth / 2;
  for (let i = 0; i < model.property.rows.length; i += 2) {
    ensure(14);
    const left = model.property.rows[i]!;
    const right = model.property.rows[i + 1];
    page.drawText(left.label, { x: MARGIN, y: y - 9, size: 8.5, font: regular, color: MUTED });
    page.drawText(left.value, { x: MARGIN + 120, y: y - 9, size: 8.5, font: bold, color: INK });
    if (right) {
      page.drawText(right.label, { x: MARGIN + half, y: y - 9, size: 8.5, font: regular, color: MUTED });
      page.drawText(right.value, { x: MARGIN + half + 120, y: y - 9, size: 8.5, font: bold, color: INK });
    }
    y -= 14;
  }

  /* ---------------- Rezultatul analizei ---------------- */
  heading("Rezultatul analizei · calcul ACP");
  for (let i = 0; i < model.summary.length; i += 2) {
    ensure(34);
    const cells = [model.summary[i]!, model.summary[i + 1]].filter(Boolean) as typeof model.summary;
    cells.forEach((cell, index) => {
      const x = MARGIN + index * (half + 4);
      page.drawRectangle({
        x,
        y: y - 30,
        width: half - 8,
        height: 30,
        borderColor: MUTED,
        borderWidth: 0.4,
      });
      page.drawText(cell.label, { x: x + 8, y: y - 12, size: 7.5, font: regular, color: MUTED });
      page.drawText(cell.value, { x: x + 8, y: y - 24, size: 10.5, font: bold, color: NAVY });
      if (cell.hint) {
        const w = regular.widthOfTextAtSize(cell.hint, 7);
        page.drawText(cell.hint, { x: x + half - 16 - w, y: y - 24, size: 7, font: regular, color: MUTED });
      }
    });
    y -= 34;
  }
  y -= 4;
  text(
    `Comparabile găsite: ${model.counts.found} · folosite în calcul: ${model.counts.used} · excluse: ${model.counts.excluded}`,
    { size: 9, font: bold, gap: 2 },
  );

  /* ---------------- Metodologie ---------------- */
  heading("Metodologia analizei");
  for (const line of model.methodology) text(`• ${line}`, { size: 8.5, color: INK });

  /* ---------------- Comparabile ---------------- */
  heading("Comparabilele analizate");
  const columns = [140, 62, 62, 66, 30, 66, contentWidth - 426];
  const labels = ["Ofertă / sursă", "Preț listat", "Preț ajustat", "€/mp ajustat", "Scor", "Ajustare", "Stare"];
  const drawRow = (values: string[], header = false) => {
    const size = header ? 7.6 : 7.4;
    const font = header ? bold : regular;
    const lineSets = values.map((value, index) => wrap(value || "—", font, size, columns[index]! - 6));
    const rowHeight = Math.max(18, ...lineSets.map((lines) => lines.length * 9 + 8));
    ensure(rowHeight + 2);
    let x = MARGIN;
    page.drawRectangle({
      x,
      y: y - rowHeight,
      width: contentWidth,
      height: rowHeight,
      color: header ? SOFT : undefined,
      borderColor: MUTED,
      borderWidth: 0.4,
    });
    lineSets.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: x + 3,
          y: y - 11 - lineIndex * 9,
          size,
          font,
          color: header ? NAVY : INK,
        });
      });
      x += columns[index]!;
    });
    y -= rowHeight;
  };
  drawRow(labels, true);
  if (model.comparables.length === 0) {
    text("Nu există comparabile salvate pentru această versiune.", { size: 8.5, color: MUTED });
  }
  for (const c of model.comparables) {
    drawRow([
      `${c.title}\n${[c.sourceName, c.locationLabel].filter(Boolean).join(" · ")}`,
      c.price,
      c.adjustedPrice,
      c.adjustedPricePerSqm,
      c.similarity,
      c.adjustment,
      `${c.tier}\n${c.flags}`,
    ]);
  }

  /* ---------------- Ajustări detaliate ---------------- */
  const withAdjustments = model.comparables.filter((c) => c.adjustments.length > 0);
  if (withAdjustments.length > 0) {
    heading("Detalii ajustări");
    for (const c of withAdjustments) {
      text(c.title, { size: 8.8, font: bold, color: NAVY });
      for (const a of c.adjustments) {
        text(`   ${a.label} — ${a.basis}: ${a.amount}`, { size: 8, color: INK });
      }
      y -= 2;
    }
  }

  /* ---------------- Statistici ---------------- */
  heading("Indicatori statistici");
  for (const row of model.statistics) {
    ensure(13);
    page.drawText(row.label, { x: MARGIN, y: y - 9, size: 8.5, font: regular, color: MUTED });
    page.drawText(row.value, { x: MARGIN + 260, y: y - 9, size: 8.5, font: bold, color: INK });
    y -= 13;
  }

  /* ---------------- Surse ---------------- */
  heading("Surse de date folosite");
  for (const src of model.sources) {
    text(
      `• ${src.name} — găsite ${src.found}, folosite ${src.used}, excluse ${src.excluded}`,
      { size: 8.5 },
    );
  }
  if (model.sources.length === 0) {
    text("Nu au fost înregistrate surse pentru această versiune.", { size: 8.5, color: MUTED });
  }

  /* ---------------- Piața la momentul analizei ---------------- */
  if (model.market) {
    heading("Piața la momentul analizei");
    text(
      `Cifre din snapshot-ul de piață al versiunii${
        model.market.capturedAt ? `, capturat la ${reportDate(model.market.capturedAt)}` : ""
      }. Nu reflectă evoluțiile ulterioare ale pieței.`,
      { size: 8, color: MUTED, gap: 4 },
    );
    for (const row of model.market.rows) {
      // Valorile lungi (mixul surselor, poziționarea) se scriu pe rânduri
      // separate, cu wrap, ca să nu iasă din pagină.
      if (row.value.length > 46) {
        text(`${row.label}:`, { size: 8.5, color: MUTED, gap: 1 });
        text(row.value, { size: 8.5 });
        continue;
      }
      ensure(13);
      page.drawText(row.label, { x: MARGIN, y: y - 9, size: 8.5, font: regular, color: MUTED });
      page.drawText(row.value, { x: MARGIN + 260, y: y - 9, size: 8.5, font: bold, color: INK });
      y -= 13;
    }
    if (model.market.note) text(model.market.note, { size: 8, color: MUTED });
  }

  /* ---------------- Calibrare și calitatea datelor ---------------- */
  if (model.precision) {
    heading("Calibrare și calitatea datelor");
    for (const row of model.precision.rows) {
      if (row.value.length > 46) {
        text(`${row.label}:`, { size: 8.5, color: MUTED, gap: 1 });
        text(row.value, { size: 8.5 });
        continue;
      }
      ensure(13);
      page.drawText(row.label, { x: MARGIN, y: y - 9, size: 8.5, font: regular, color: MUTED });
      page.drawText(row.value, { x: MARGIN + 260, y: y - 9, size: 8.5, font: bold, color: INK });
      y -= 13;
    }
    for (const note of model.precision.notes) text(`• ${note}`, { size: 8, color: MUTED });
  }



  /* ---------------- Limitări ---------------- */
  if (model.warnings.length > 0) {
    heading("Limitări și observații privind datele");
    for (const warning of model.warnings) text(`• ${warning}`, { size: 8.5 });
  }

  /* ---------------- Interpretare AI ---------------- */
  if (model.ai) {
    heading("Interpretare AI");
    text(
      `Text generat automat pe baza cifrelor calculate mai sus${model.ai.model ? ` (model ${model.ai.model})` : ""}${
        model.ai.generatedAt ? `, la ${reportDate(model.ai.generatedAt)}` : ""
      }. Interpretarea nu modifică niciuna dintre valorile calculate.`,
      { size: 8, color: MUTED, gap: 4 },
    );
    text(model.ai.summary, { size: 9 });
    for (const section of model.ai.sections) {
      text(section.title, { size: 8.5, font: bold, gap: 2 });
      text(section.body, { size: 9 });
    }
    for (const group of model.ai.bullets) {
      text(group.title, { size: 8.5, font: bold, gap: 2 });
      for (const item of group.items) text(`• ${item}`, { size: 8.5 });
    }
  }

  /* ---------------- Disclaimer ---------------- */
  heading("Precizări");
  text(
    "Prezentul raport este o estimare orientativă de piață, realizată prin metoda comparației directe pe baza datelor disponibile la data snapshot-ului. Nu constituie o evaluare autorizată ANEVAR, o expertiză judiciară sau o consultanță juridică ori financiară. Prețul de tranzacționare efectiv poate diferi în funcție de negociere, starea reală a imobilului și evoluția pieței.",
    { size: 8, color: MUTED },
  );

  /* ---------------- Subsol ---------------- */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const footer = `${model.agency.name} · Habitoo CRM · Raport ACP v${model.formatVersion} nr. ${model.reportNumber} · versiunea analizei ${model.analysisVersion}`;
    p.drawText(footer, { x: MARGIN, y: MARGIN - 24, size: 6.8, font: regular, color: MUTED });
    const label = `Pagina ${i + 1} din ${pages.length}`;
    const w = regular.widthOfTextAtSize(label, 7.5);
    p.drawText(label, { x: width - MARGIN - w, y: MARGIN - 24, size: 7.5, font: regular, color: MUTED });
  });

  return await doc.save();
}
