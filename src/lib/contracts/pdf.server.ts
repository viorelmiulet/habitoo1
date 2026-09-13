/**
 * Generare PDF pentru contracte, cu fonturi Unicode încorporate (diacritice
 * românești) și antetul agenției. Rulează exclusiv pe server, cu pdf-lib —
 * bibliotecă pură JS, compatibilă cu runtime-ul nostru.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CONTRACT_FONT_BOLD_B64, CONTRACT_FONT_REGULAR_B64 } from "./fonts";
import type { InventoryItem } from "./templates";

export type ContractPdfParty = {
  role: string;
  roleLabel: string;
  fullName: string;
  details: string[];
  signature?: {
    pngBase64: string;
    signedAt: string;
    ip: string | null;
    userAgent: string | null;
  } | null;
  citizenship?: string | null;
};

export type ContractPdfInput = {
  title: string;
  subtitle?: string | null;
  body: string;
  agency: {
    name: string;
    legalName?: string | null;
    cui?: string | null;
    registry?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    legalRepresentative?: string | null;
    legalRepresentativeTitle?: string | null;
  };
  logo?: { bytes: Uint8Array; mime: string } | null;
  parties: ContractPdfParty[];
  rentalAgreement?: boolean;
  exclusiveRepresentation?: boolean;
  inventory?: {
    propertyAddress: string;
    handoverDate: string;
    items: InventoryItem[];
  } | null;
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const NAVY = rgb(0.09, 0.14, 0.27);
const GOLD = rgb(0.72, 0.56, 0.24);
const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.52);

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

export async function buildContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
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

  const drawHeader = () => {
    page.drawRectangle({ x: MARGIN, y: A4[1] - 51, width: contentWidth, height: 1.5, color: GOLD });
  };
  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
    drawHeader();
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 24) newPage();
  };
  const text = (
    value: string,
    opts: { size?: number; font?: PDFFont; color?: typeof INK; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10.5;
    const font = opts.font ?? regular;
    const paragraphs = value.split(/\r?\n/);
    for (const paragraph of paragraphs) {
      const lines = paragraph.trim() ? wrap(paragraph, font, size, contentWidth) : [""];
      const paragraphHeight = lines.length * size * 1.5;
      if (paragraphHeight <= A4[1] - MARGIN * 2 - 48) ensure(paragraphHeight + 4);
      for (const line of lines) {
        ensure(size + 4);
        if (line) page.drawText(line, { x: MARGIN, y: y - size, size, font, color: opts.color ?? INK });
        y -= size * 1.5;
      }
    }
    y -= opts.gap ?? 0;
  };

  /* Antet agenție */
  let headerBottom = y;
  if (input.logo) {
    try {
      const image = input.logo.mime.includes("png")
        ? await doc.embedPng(input.logo.bytes)
        : await doc.embedJpg(input.logo.bytes);
      const scaled = image.scaleToFit(120, 48);
      page.drawImage(image, {
        x: MARGIN,
        y: y - scaled.height,
        width: scaled.width,
        height: scaled.height,
      });
      headerBottom = y - scaled.height;
    } catch {
      /* logo invalid — antetul rămâne text */
    }
  }

  const agencyLines = [
    input.agency.legalName || input.agency.name,
    [input.agency.cui ? `CUI ${input.agency.cui}` : null, input.agency.registry]
      .filter(Boolean)
      .join(" · "),
    input.agency.address ?? "",
    [input.agency.phone, input.agency.email].filter(Boolean).join(" · "),
  ].filter((l) => l && l.trim() !== "");

  let ay = y - 4;
  for (const line of agencyLines) {
    const size = 8.5;
    const w = regular.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: width - MARGIN - w,
      y: ay - size,
      size,
      font: regular,
      color: MUTED,
    });
    ay -= size * 1.45;
  }

  y = Math.min(headerBottom, ay) - 14;
  page.drawRectangle({ x: MARGIN, y, width: contentWidth, height: 2, color: GOLD });
  y -= 26;

  /* Titlu */
  text((input.rentalAgreement ? "CONTRACT DE INCHIRIERE" : input.exclusiveRepresentation ? "CONTRACT DE REPREZENTARE EXCLUSIVA" : input.title).toUpperCase(), {
    size: 15,
    font: bold,
    color: NAVY,
    gap: 2,
  });
  if (input.rentalAgreement) text("(Semnat electronic)", { size: 9.5, color: MUTED, gap: 8 });
  else if (input.subtitle) text(input.subtitle, { size: 9.5, color: MUTED, gap: 8 });
  else y -= 8;

  /* Corpul contractului */
  text(input.body, { size: 10.5, gap: 12 });

  if (input.inventory) {
    newPage();
    y -= 18;
    text("ANEXA 1 - INVENTAR IMOBIL", { size: 14, font: bold, color: NAVY, gap: 8 });
    text(
      `Inventar al bunurilor aflate in imobilul situat in ${input.inventory.propertyAddress || "__________"}, predate de proprietar chiriasului la data inceperii contractului de inchiriere.`,
      { size: 10, gap: 12 },
    );
    const columns = [180, 38, 72, 85, contentWidth - 375];
    const labels = ["Denumire", "Cant.", "Stare", "Locatie", "Observatii"];
    const drawRow = (values: string[], header = false) => {
      const lineSets = values.map((value, index) =>
        wrap(value || "—", header ? bold : regular, header ? 8 : 7.7, columns[index]! - 8),
      );
      const rowHeight = Math.max(22, ...lineSets.map((lines) => lines.length * 10 + 8));
      ensure(rowHeight + 2);
      let x = MARGIN;
      page.drawRectangle({ x, y: y - rowHeight, width: contentWidth, height: rowHeight, borderColor: MUTED, borderWidth: 0.5 });
      lineSets.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x: x + 4,
            y: y - 12 - lineIndex * 10,
            size: header ? 8 : 7.7,
            font: header ? bold : regular,
            color: header ? NAVY : INK,
          });
        });
        x += columns[index]!;
        if (index < columns.length - 1) {
          page.drawLine({ start: { x, y }, end: { x, y: y - rowHeight }, thickness: 0.5, color: MUTED });
        }
      });
      y -= rowHeight;
    };
    drawRow(labels, true);
    input.inventory.items.forEach((item) =>
      drawRow([item.name, String(item.quantity), item.condition, item.location, item.notes]),
    );
    y -= 14;
    text(`Total articole inventariate: ${input.inventory.items.length}`, { size: 9.5, font: bold, gap: 4 });
    text(
      "Prezentul inventar a fost intocmit in 2 (doua) exemplare, cate unul pentru fiecare parte, si face parte integranta din contractul de inchiriere.",
      { size: 9.5, gap: 8 },
    );
  }

  /* Semnături pe pagina finală */
  newPage();
  y -= 32;
  text("SEMNĂTURI", { size: 13, font: bold, color: NAVY, gap: 18 });

  const signatureParties = input.rentalAgreement
    ? input.parties.filter((party) => party.role === "landlord" || party.role === "tenant")
    : input.exclusiveRepresentation
      ? input.parties.filter((party) => party.role === "agent" || party.role === "seller")
    : input.parties;
  const columnWidth = (contentWidth - 32) / 2;
  const slots = signatureParties.length === 2 ? signatureParties : input.parties;

  for (const [index, party] of slots.entries()) {
    const x = MARGIN + (index % 2) * (columnWidth + 32);
    const top = y - Math.floor(index / 2) * 150;
    const roleTitle = input.exclusiveRepresentation && party.role === "agent"
      ? "PRESTATOR"
      : input.exclusiveRepresentation && party.role === "seller"
        ? "BENEFICIAR"
        : party.role === "landlord" ? "PROPRIETAR" : party.role === "tenant" ? "CHIRIAS" : party.roleLabel.toUpperCase();
    page.drawText(roleTitle, { x, y: top, size: 10.5, font: bold, color: NAVY });
    page.drawText(input.exclusiveRepresentation && party.role === "agent" ? (input.agency.legalName || input.agency.name) : party.fullName, { x, y: top - 18, size: 9, font: regular, color: INK });

    if (party.signature) {
      try {
        const clean = party.signature.pngBase64.replace(/^data:image\/\w+;base64,/, "");
        const png = await doc.embedPng(Buffer.from(clean, "base64"));
        const scaled = png.scaleToFit(180, 60);
        page.drawImage(png, {
          x,
          y: top - 32 - scaled.height,
          width: scaled.width,
          height: scaled.height,
        });
      } catch {
        /* semnătură ilizibilă — rămâne dovada text */
      }
      page.drawRectangle({ x, y: top - 98, width: columnWidth, height: 0.8, color: MUTED });
      const proof = [
        `Semnat electronic olograf la ${new Date(party.signature.signedAt).toLocaleString("ro-RO")}`,
        party.signature.ip ? `IP ${party.signature.ip}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      for (const [lineIndex, line] of wrap(proof, regular, 7, columnWidth).entries()) {
        page.drawText(line, { x, y: top - 112 - lineIndex * 9, size: 7, font: regular, color: MUTED });
      }
    } else {
      page.drawRectangle({ x, y: top - 98, width: columnWidth, height: 0.8, color: MUTED });
      page.drawText("Semnătura", { x, y: top - 112, size: 7.5, font: regular, color: MUTED });
    }
  }

  /* Numerotare pagini */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Pagina ${i + 1} din ${pages.length}`;
    const w = regular.widthOfTextAtSize(label, 8);
    const agencyFooter = [
      input.agency.name,
      input.agency.phone ? `Tel: ${input.agency.phone}` : null,
      input.agency.email ? `Email: ${input.agency.email}` : null,
      input.agency.website,
    ]
      .filter(Boolean)
      .join(" | ");
    p.drawText(agencyFooter, { x: MARGIN, y: MARGIN - 22, size: 7, font: regular, color: MUTED });
    p.drawText(label, {
      x: width - MARGIN - w,
      y: MARGIN - 22,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });

  return await doc.save();
}
