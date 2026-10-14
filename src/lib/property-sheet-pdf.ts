import { propertySheetFileName } from "./property-sheet";

/** Partition description on paragraph/word boundaries, never crop a rendered line. */
function paginateDescription(doc: Document) {
  const original = doc.querySelector<HTMLElement>(".page-two");
  const description = original?.querySelector<HTMLElement>(".description");
  if (!original || !description) return;
  const paragraphs = Array.from(description.querySelectorAll("p")).map(p => p.textContent ?? "");
  const template = original.cloneNode(true) as HTMLElement;
  let page = original;
  let container = description;
  container.replaceChildren();
  const fits = () => container.scrollHeight <= container.clientHeight;
  const nextPage = () => {
    const next = template.cloneNode(true) as HTMLElement;
    const nextContainer = next.querySelector<HTMLElement>(".description");
    if (!nextContainer) throw new Error("Nu am putut pregăti paginile fișei.");
    nextContainer.replaceChildren();
    page.after(next);
    page = next;
    container = nextContainer;
  };
  for (const text of paragraphs) {
    let p = doc.createElement("p");
    container.append(p);
    for (const word of text.split(/\s+/)) {
      const previous = p.textContent ?? "";
      p.textContent = previous ? `${previous} ${word}` : word;
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
    style.textContent = ".page{margin:0;box-shadow:none}.description{height:154mm;max-height:none;overflow:visible}.description p{overflow-wrap:anywhere}";
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
    paginateDescription(doc);
    const pdf = await PDFDocument.create();
    for (const element of doc.querySelectorAll<HTMLElement>(".page")) {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, windowWidth: 900, windowHeight: 1200 });
      const jpeg = await pdf.embedJpg(canvas.toDataURL("image/jpeg", 0.82));
      const page = pdf.addPage([595.28, 841.89]);
      page.drawImage(jpeg, { x: 0, y: 0, width: 595.28, height: 841.89 });
      canvas.width = 0; canvas.height = 0;
    }
    const bytes = await pdf.save();
    return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
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