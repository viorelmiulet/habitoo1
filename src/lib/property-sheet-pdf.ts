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

export const IMAGE_LOAD_ERROR = "O fotografie nu a putut fi încărcată. Încearcă din nou.";
export const MAX_IMAGE_SIDE = 1600;

/** Dimensiunile reduse proporțional la maximum `max` px pe latura mare. */
export function scaledSize(width: number, height: number, max = MAX_IMAGE_SIDE) {
  const ratio = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

type Rasterize = (blob: Blob, max: number) => Promise<string>;

async function canvasRasterize(blob: Blob, max: number): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "sync";
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 300, h = img.naturalHeight || 150;
    const size = scaledSize(w, h, max);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(IMAGE_LOAD_ERROR);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const opaque = blob.type === "image/jpeg" || blob.type === "image/jpg";
    const data = opaque ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png");
    canvas.width = 0; canvas.height = 0;
    return data;
  } finally { URL.revokeObjectURL(url); }
}

/** Descarcă o imagine și o întoarce ca data URL redimensionat (max 1600 px). */
export async function imageToDataUrl(
  src: string,
  deps: { fetchImpl?: typeof fetch; rasterize?: Rasterize; max?: number } = {},
): Promise<string> {
  if (src.startsWith("data:")) return src;
  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try { response = await fetchImpl(src); } catch { throw new Error(IMAGE_LOAD_ERROR); }
  if (!response.ok) throw new Error(IMAGE_LOAD_ERROR);
  const blob = await response.blob();
  try { return await (deps.rasterize ?? canvasRasterize)(blob, deps.max ?? MAX_IMAGE_SIDE); }
  catch { throw new Error(IMAGE_LOAD_ERROR); }
}

/** Oprește generarea dacă o imagine din pagină nu este încărcată complet. */
export function assertImagesLoaded(root: ParentNode) {
  for (const img of Array.from(root.querySelectorAll("img"))) {
    if (!img.complete || img.naturalWidth <= 0) throw new Error(IMAGE_LOAD_ERROR);
  }
}

/** True dacă zona unei imagini din captură a ieșit complet uniformă (gol). */
export function hasBlankImageArea(page: HTMLElement, canvas: HTMLCanvasElement, scale: number) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  const base = page.getBoundingClientRect();
  for (const img of Array.from(page.querySelectorAll("img"))) {
    const r = img.getBoundingClientRect();
    const x = Math.floor((r.left - base.left) * scale), y = Math.floor((r.top - base.top) * scale);
    const w = Math.floor(r.width * scale), h = Math.floor(r.height * scale);
    if (w < 8 || h < 8) continue;
    const data = ctx.getImageData(Math.max(0, x), Math.max(0, y), Math.min(w, canvas.width - x), Math.min(h, canvas.height - y)).data;
    let uniform = true;
    for (let i = 4; i < data.length; i += 4 * 7) {
      if (Math.abs(data[i]! - data[0]!) > 2 || Math.abs(data[i + 1]! - data[1]!) > 2 || Math.abs(data[i + 2]! - data[2]!) > 2) { uniform = false; break; }
    }
    if (uniform) return true;
  }
  return false;
}

/** Browser-only, lazy loaded. Images are inlined as data URLs before canvas rendering. */
export async function generatePropertySheetPdf(html: string, options: { allPhotos?: boolean } = {}): Promise<Blob> {
  const [{ default: html2canvas }, { PDFDocument }] = await Promise.all([
    import("html2canvas-pro"), import("pdf-lib"),
  ]);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;pointer-events:none;";
  document.body.append(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Nu am putut pregăti fișa de proprietate.");
    doc.open(); doc.write(html); doc.close();
    const style = doc.createElement("style");
    style.textContent = ".page{margin:0;box-shadow:none}[data-sheet-description]{height:154mm;max-height:none;overflow:visible}[data-sheet-description] p{overflow-wrap:anywhere}";
    doc.head.append(style);
    const cache = new Map<string, Promise<string>>();
    await Promise.all(Array.from(doc.images).map(async image => {
      image.removeAttribute("loading");
      image.removeAttribute("srcset");
      image.decoding = "sync";
      const src = image.getAttribute("src") ?? "";
      if (!cache.has(src)) cache.set(src, imageToDataUrl(new URL(src, location.href).href));
      image.src = await cache.get(src)!;
      try { await image.decode(); } catch { throw new Error(IMAGE_LOAD_ERROR); }
    }));
    await doc.fonts.ready;
    fitSheetHeadings(doc);
    paginateDescription(doc);
    const canvases: HTMLCanvasElement[] = [];
    for (const element of doc.querySelectorAll<HTMLElement>(".page")) {
      // Paginile clonate la paginare au imagini noi: așteaptă-le și verifică-le.
      await Promise.all(Array.from(element.querySelectorAll("img")).map(img => img.decode().catch(() => undefined)));
      assertImagesLoaded(element);
      let canvas: HTMLCanvasElement | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (canvas) { canvas.width = 0; canvas.height = 0; }
        canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, windowWidth: 900, windowHeight: 1200, imageTimeout: 0 });
        if (!hasBlankImageArea(element, canvas, 2)) break;
        if (attempt === 2) { canvas.width = 0; canvas.height = 0; throw new Error(IMAGE_LOAD_ERROR); }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      canvases.push(canvas!);
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
      throw new Error(options.allPhotos
        ? "Fișa depășește 5 MB. Debifează „Include toate fotografiile” sau redu lungimea descrierii."
        : "Fișa depășește 5 MB. Redu numărul de fotografii sau lungimea descrierii.");
    } finally { canvases.forEach(canvas => { canvas.width = 0; canvas.height = 0; }); }
  } finally {
    frame.remove();
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