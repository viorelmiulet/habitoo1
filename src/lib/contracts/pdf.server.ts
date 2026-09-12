/**
 * Generare PDF pentru contracte, cu fonturi Unicode încorporate (diacritice
 * românești) și antetul agenției. Rulează exclusiv pe server, cu pdf-lib —
 * bibliotecă pură JS, compatibilă cu runtime-ul nostru.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CONTRACT_FONT_BOLD_B64, CONTRACT_FONT_REGULAR_B64 } from "./fonts";

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
  };
  logo?: { bytes: Uint8Array; mime: string } | null;
  parties: ContractPdfParty[];
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

  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
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
    for (const line of wrap(value, font, size, contentWidth)) {
      ensure(size + 4);
      if (line) page.drawText(line, { x: MARGIN, y: y - size, size, font, color: opts.color ?? INK });
      y -= size * 1.5;
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
  text(input.title.toUpperCase(), { size: 15, font: bold, color: NAVY, gap: 2 });
  if (input.subtitle) text(input.subtitle, { size: 9.5, color: MUTED, gap: 8 });
  else y -= 8;

  /* Corpul contractului */
  text(input.body, { size: 10.5, gap: 12 });

  /* Semnături */
  ensure(150);
  y -= 10;
  page.drawRectangle({ x: MARGIN, y, width: contentWidth, height: 1, color: GOLD });
  y -= 22;
  text("SEMNĂTURI", { size: 11, font: bold, color: NAVY, gap: 6 });

  for (const party of input.parties) {
    ensure(120);
    text(`${party.roleLabel}: ${party.fullName}`, { size: 10, font: bold });
    for (const detail of party.details.filter(Boolean)) {
      text(detail, { size: 9, color: MUTED });
    }

    if (party.signature) {
      try {
        const clean = party.signature.pngBase64.replace(/^data:image\/\w+;base64,/, "");
        const png = await doc.embedPng(Buffer.from(clean, "base64"));
        const scaled = png.scaleToFit(180, 60);
        ensure(scaled.height + 30);
        page.drawImage(png, {
          x: MARGIN,
          y: y - scaled.height,
          width: scaled.width,
          height: scaled.height,
        });
        y -= scaled.height + 4;
      } catch {
        /* semnătură ilizibilă — rămâne dovada text */
      }
      page.drawRectangle({ x: MARGIN, y, width: 200, height: 0.8, color: MUTED });
      y -= 12;
      const proof = [
        `Semnat electronic olograf la ${new Date(party.signature.signedAt).toLocaleString("ro-RO")}`,
        party.signature.ip ? `IP ${party.signature.ip}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      text(proof, { size: 7.5, color: MUTED });
      if (party.signature.userAgent) {
        text(`Dispozitiv: ${party.signature.userAgent.slice(0, 120)}`, { size: 7, color: MUTED });
      }
    } else {
      y -= 34;
      page.drawRectangle({ x: MARGIN, y, width: 200, height: 0.8, color: MUTED });
      y -= 12;
      text("Semnătura", { size: 7.5, color: MUTED });
    }
    y -= 10;
  }

  /* Numerotare pagini */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Pagina ${i + 1} din ${pages.length}`;
    const w = regular.widthOfTextAtSize(label, 8);
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
