/**
 * Tipărirea materialelor generate (fișa de prezentare a proprietății).
 *
 * Folosim un iframe ascuns în loc de `window.open`, pentru că fereastra nouă
 * era blocată de browser și `print()` pornea înainte ca logo-ul și fotografiile
 * să fie încărcate (rezultat: pagină goală sau fără imagini).
 */

/** Așteaptă încărcarea tuturor imaginilor din document (cu limită de timp). */
function waitForImages(doc: Document, timeoutMs = 8000) {
  const images = Array.from(doc.images);
  const pending = images
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    );
  if (pending.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Scrie HTML-ul într-un iframe ascuns, așteaptă imaginile, deschide dialogul de
 * tipărire și curăță iframe-ul după închiderea acestuia.
 */
export async function printHtmlDocument(html: string) {
  if (typeof document === "undefined") return;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const cleanup = () => {
    setTimeout(() => frame.remove(), 1000);
  };

  try {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error("Nu am putut pregăti documentul pentru tipărire.");

    doc.open();
    doc.write(html);
    doc.close();

    if (doc.readyState !== "complete") {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        win.addEventListener("load", done, { once: true });
        setTimeout(done, 5000);
      });
    }
    await waitForImages(doc);

    win.focus();
    win.print();
  } finally {
    cleanup();
  }
}
