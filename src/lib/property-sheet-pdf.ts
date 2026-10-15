import { propertySheetFileName } from "./property-sheet";

/** Partition description on paragraph/word boundaries, never crop a rendered line. */
export function paginateDescription(doc: Document) {
  const original = doc.querySelector<HTMLElement>("[data-sheet-description-page]");
  const description = original?.querySelector<HTMLElement>("[data-sheet-description]");
  if (!original || !description) return;
  const paragraphs = Array.from(description.querySelectorAll("p")).map(p => p.textContent ?? "");
  const template = original.cloneNode(true) as HTMLElement;
  let page = original;
  let container = description;
  container.replaceChildren();
  const fits = () => container.scrollHeight <= container.clientHeight + 1;
  const nextPage = () => {
    const next = template.cloneNode(true) as HTMLElement;
    const nextContainer = next.querySelector<HTMLElement>("[data-sheet-description]");
    if (!nextContainer) throw new Error("Nu am putut pregăti paginile fișei.");
    nextContainer.replaceChildren();
    page.after(next);
    page = next;
    container = nextContainer;
  };
  for (const text of paragraphs) {
    let p = doc.createElement("p");
    container.append(p);
    for (const word of text.split(/(\s+)/).filter(Boolean)) {
      const previous = p.textContent ?? "";
      p.textContent = previous + word;
      if (fits()) continue;
      p.textContent = previous;
      if (!previous) p.remove();
      nextPage();
      p = doc.createElement("p");
      p.textContent = word;
      container.append(p);
    }
  }
}

/** Fit unusually long headings within their allocated space before pagination. */
export function fitSheetHeadings(doc: Document) {
  for (const page of doc.querySelectorAll<HTMLElement>(".page:not([data-sheet-description-page])")) {
    const heading = page.querySelector<HTMLElement>(".property-heading");
    const title = heading?.querySelector<HTMLElement>("h1");
    if (!heading || !title) continue;
    const win = doc.defaultView;
    if (!win) continue;
    let size = parseFloat(win.getComputedStyle(title).fontSize);
    const limit = doc.body.dataset.template === "split" ? 140 : 90;
    while (title.offsetHeight > limit && size > 9) {
      size -= 1;
      title.style.fontSize = `${size}px`;
    }
    const features = page.querySelector<HTMLElement>(".features");
    const contact = page.querySelector<HTMLElement>(".contact-card");
    const cover = page.querySelector<HTMLElement>(".cover");
    if (features && contact && cover && win.getComputedStyle(contact).position === "absolute") {
      const overlap = features.getBoundingClientRect().bottom - contact.getBoundingClientRect().top + 12;
      if (overlap > 0) {
        const mosaic = cover.closest<HTMLElement>(".minimal-mosaic");
        const target = mosaic ?? cover;
        target.style.height = `${Math.max(100, target.offsetHeight - overlap)}px`;
        if (mosaic) for (const img of mosaic.querySelectorAll<HTMLElement>(".small-photos img")) img.style.height = `${(target.offsetHeight - 8) / 2}px`;
      }
    }
  }
}

/** Browser-only, lazy loaded. Signed images are fetched before canvas rendering. */
export async function generatePropertySheetPdf(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { PDFDocument }] = await Promise.all([
    import("html2canvas-pro"), import("pdf-lib"),
  ]);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;pointer-events:none;";
  document.body.append(frame);
  const urls: string[] = [];
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Nu am putut pregăti fișa de proprietate.");
    doc.open(); doc.write(html); doc.close();
    const style = doc.createElement("style");
    style.textContent = ".page{margin:0;box-shadow:none}[data-sheet-description]{height:154mm;max-height:none;overflow:visible}[data-sheet-description] p{overflow-wrap:anywhere}";
    doc.head.append(style);
    await Promise.all(Array.from(doc.images).map(async image => {
      const response = await fetch(image.src);
      if (!response.ok) throw new Error("O fotografie nu a putut fi încărcată. Încearcă din nou.");
      const url = URL.createObjectURL(await response.blob());
      urls.push(url);
      image.src = url;
      await image.decode();
    }));
    await doc.fonts.ready;
    fitSheetHeadings(doc);
    paginateDescription(doc);
    const canvases: HTMLCanvasElement[] = [];
    for (const element of doc.querySelectorAll<HTMLElement>(".page")) {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, windowWidth: 900, windowHeight: 1200 });
      canvases.push(canvas);
    }
    try {
      for (const quality of [0.82, 0.65, 0.48, 0.32]) {
        const pdf = await PDFDocument.create();
        for (const canvas of canvases) {
          const jpeg = await pdf.embedJpg(canvas.toDataURL("image/jpeg", quality));
          const page = pdf.addPage([595.28, 841.89]);
          page.drawImage(jpeg, { x: 0, y: 0, width: 595.28, height: 841.89 });
        }
        const bytes = await pdf.save();
        if (bytes.byteLength < 5_000_000) return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      }
      throw new Error("Fișa depășește 5 MB. Redu numărul de fotografii sau lungimea descrierii.");
    } finally { canvases.forEach(canvas => { canvas.width = 0; canvas.height = 0; }); }
  } finally {
    frame.remove();
    urls.forEach(url => URL.revokeObjectURL(url));
  }
}

/** Must be called synchronously from a click after generation, especially on iOS. */
export async function downloadPropertySheet(blob: Blob, reference?: string | null) {
  const filename = propertySheetFileName(reference);
  const file = new File([blob], filename, { type: "application/pdf" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Fișă de proprietate" }); return; }
    catch (error) { if ((error as DOMException).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}